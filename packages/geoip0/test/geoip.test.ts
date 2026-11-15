import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import {
  GeoIPProviderError,
  createGeoIPManager,
  hasGeoLocationData,
  normalizeGeoLocation,
} from "../src";
import hybridDriver from "../src/drivers/hybrid";
import ipWhoisDriver from "../src/drivers/ipwhois";
import type { Driver, GeoLocation } from "../src/types";

const ipWhoisFixture = {
  ip: "8.8.8.8",
  success: true,
  country: "United States",
  country_code: "US",
  region: "California",
  region_code: "CA",
  city: "San Jose",
  latitude: 37.3393939,
  longitude: -121.8949553,
  connection: { asn: 15169, isp: "Google LLC", org: "Google LLC" },
  timezone: { id: "America/Los_Angeles" },
};

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GeoLocation normalization", () => {
  test("omits absent provider fields and preserves explicit values", () => {
    const location = normalizeGeoLocation({
      ip: "192.0.2.1",
      source: "fixture",
      countryCode: "US",
      latitude: 0,
      isProxy: false,
    });

    expect(location).toEqual({
      ip: "192.0.2.1",
      source: "fixture",
      countryCode: "US",
      latitude: 0,
      isProxy: false,
    });
    expect(hasGeoLocationData(location)).toBe(true);
  });

  test("can emit legacy sparse fields for older consumers", () => {
    const location = normalizeGeoLocation(
      { ip: "192.0.2.1", source: "fixture", accuracyRadius: 23 },
      { legacySparseFields: true },
    );

    expect(location).toMatchObject({
      country: "",
      regionCode: "",
      longitude: 0,
      isProxy: false,
      accuracyRadius: "23",
    });
    expect(hasGeoLocationData(location)).toBe(true);
  });

  test("treats legacy placeholder-only results as missing data", () => {
    const location = normalizeGeoLocation(
      { ip: "192.0.2.1", source: "fixture" },
      { legacySparseFields: true },
    );

    expect(hasGeoLocationData(location)).toBe(false);
  });

  test("rejects a provider response without ip or source", () => {
    expect(normalizeGeoLocation({ ip: "", source: "fixture" })).toBeNull();
    expect(normalizeGeoLocation({ ip: "192.0.2.1", source: "" })).toBeNull();
    expect(hasGeoLocationData({ ip: "192.0.2.1", source: "fixture" })).toBe(false);
  });
});

describe("bounded batch lookup", () => {
  test("manager fan-out never exceeds the configured concurrency", async () => {
    let active = 0;
    let maxActive = 0;
    const driver: Driver = {
      name: "bounded-fixture",
      capabilities: { lookup: true, current: false, batchLookup: false },
      async lookup(ip) {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active -= 1;
        return { ip, source: "bounded-fixture", countryCode: "US" };
      },
    };

    const geoip = createGeoIPManager({ driver });
    const ips = Array.from({ length: 5 }, (_, index) => `192.0.2.${index + 1}`);
    const results = await geoip.batchLookup(ips, { concurrency: 2 });

    expect(maxActive).toBeLessThanOrEqual(2);
    expect(results.map((result) => result.ip)).toEqual(ips);
    expect(results.every((result) => result.source === "bounded-fixture")).toBe(true);
  });
});

describe("hybrid fallback", () => {
  function found(ip: string, marker: string): GeoLocation {
    return { ip, source: marker, countryCode: "US", city: marker };
  }

  test("skips unavailable operations, recovers from provider errors, and fills batch gaps", async () => {
    const unavailableLookup = vi.fn();
    const failingLookup = vi.fn(async () => {
      throw new GeoIPProviderError("failing", "network unavailable");
    });
    const firstLookup = vi.fn(async (ip: string) =>
      ip === "192.0.2.1" ? found(ip, "first") : null,
    );
    const secondLookup = vi.fn(async (ip: string) => found(ip, "second"));

    const hybrid = hybridDriver({
      drivers: [
        {
          name: "unavailable",
          capabilities: { lookup: false, current: false, batchLookup: false },
          lookup: unavailableLookup,
        },
        {
          name: "failing",
          capabilities: { lookup: true, current: false, batchLookup: false },
          lookup: failingLookup,
        },
        {
          name: "first",
          capabilities: { lookup: true, current: false, batchLookup: false },
          lookup: firstLookup,
        },
        {
          name: "second",
          capabilities: { lookup: true, current: false, batchLookup: false },
          lookup: secondLookup,
        },
      ],
    });

    const single = await hybrid.lookup!("192.0.2.1");
    expect(single?.source).toBe("first");
    expect(unavailableLookup).not.toHaveBeenCalled();

    const batch = await hybrid.batchLookup!(["192.0.2.1", "192.0.2.2"]);
    expect(batch.map((result) => result.source)).toEqual(["first", "second"]);
    expect(failingLookup).toHaveBeenCalledTimes(3);
  });

  test("distinguishes authoritative missing data from provider errors", async () => {
    const sparseDriver: Driver = {
      name: "sparse",
      capabilities: { lookup: true, current: false, batchLookup: false },
      async lookup(ip) {
        return { ip, source: "sparse" };
      },
    };
    const laterDriver: Driver = {
      name: "later",
      capabilities: { lookup: true, current: false, batchLookup: false },
      async lookup(ip) {
        return found(ip, "later");
      },
    };
    const failingDriver: Driver = {
      name: "failing",
      capabilities: { lookup: true, current: false, batchLookup: false },
      async lookup() {
        throw new GeoIPProviderError("failing", "failed");
      },
    };

    const authoritative = hybridDriver({
      drivers: [sparseDriver, laterDriver],
      fallbackOn: { missingData: false },
    });
    expect(await authoritative.lookup!("192.0.2.1")).toMatchObject({ source: "sparse" });

    const strictErrors = hybridDriver({
      drivers: [failingDriver, laterDriver],
      fallbackOn: { providerError: false },
    });
    await expect(strictErrors.lookup!("192.0.2.1")).rejects.toMatchObject({
      name: "GeoIPProviderError",
      provider: "failing",
    });
  });
});

describe("ipwho.is provider", () => {
  test("maps documented fields without unsupported flags", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(ipWhoisFixture));
    vi.stubGlobal("fetch", fetchMock);

    const location = await ipWhoisDriver().lookup!("8.8.8.8");
    expect(fetchMock).toHaveBeenCalledWith("https://ipwho.is/8.8.8.8", expect.anything());
    expect(location).toEqual({
      ip: "8.8.8.8",
      source: "ipwho.is",
      country: "United States",
      countryCode: "US",
      region: "California",
      regionCode: "CA",
      city: "San Jose",
      latitude: 37.3393939,
      longitude: -121.8949553,
      isp: "Google LLC",
      org: "Google LLC",
      asn: "15169",
      timezone: "America/Los_Angeles",
    });
    expect(ipWhoisDriver().capabilities).toMatchObject({
      nativeBatch: false,
      proxyDetection: true,
    });
  });
});

import { describe, expect, test, vi } from "vite-plus/test";

const queryIP = vi.fn(async () => ({
  objectClassName: "ip network",
  handle: "fixture",
  startAddress: "192.0.2.0",
  endAddress: "192.0.2.255",
  ipVersion: "v4",
  country: "US",
}));

vi.mock("rdap", () => ({
  queryIP,
}));

describe("RDAP GeoIP driver", () => {
  test("forwards legacy sparse normalization options", async () => {
    const { default: rdapDriver } = await import("../src/drivers/rdap");
    const result = await rdapDriver().lookup!("192.0.2.1", { legacySparseFields: true });

    expect(queryIP).toHaveBeenCalledWith(
      "192.0.2.1",
      expect.objectContaining({ baseUrl: undefined }),
    );
    expect(result).toEqual({
      ip: "192.0.2.1",
      source: "rdap",
      country: "US",
      countryCode: "US",
      region: "",
      regionCode: "",
      city: "",
      isp: "",
      org: "",
      asn: "",
      timezone: "",
      latitude: 0,
      longitude: 0,
      accuracyRadius: "",
      isProxy: false,
    });
  });
});

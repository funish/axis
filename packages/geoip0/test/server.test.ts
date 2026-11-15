import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import packageJson from "../package.json";
import { GeoIPProviderError } from "../src/errors";
import {
  createGeoIPHandler,
  geoIPVersion,
  resolveClientIP,
  resolveCORSHeaders,
} from "../src/server";
import type { Driver } from "../src/types";

function headersOf(response: Response): Headers {
  return response.headers;
}

function handlerResponse(handler: ReturnType<typeof createGeoIPHandler>, request: Request) {
  return handler.fetch(request) as Promise<Response>;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("server client IP resolution", () => {
  test("uses the direct peer and ignores forwarding headers by default", () => {
    const headers = new Headers({ "X-Forwarded-For": "203.0.113.7" });
    expect(resolveClientIP(headers, "198.51.100.2", false)).toBe("198.51.100.2");
    expect(resolveClientIP(new Headers(), undefined, false)).toBeNull();
  });

  test("selects the rightmost untrusted proxy in a configured chain", () => {
    const headers = new Headers({
      "X-Forwarded-For": "203.0.113.7,198.51.100.2,192.0.2.9",
    });

    expect(resolveClientIP(headers, "192.0.2.9", ["192.0.2.9"])).toBe("198.51.100.2");
    expect(resolveClientIP(headers, "198.51.100.2", ["192.0.2.9"])).toBe("198.51.100.2");
  });

  test("current endpoint does not trust X-Forwarded-For by default", async () => {
    let authorizedIP = "";
    const handler = createGeoIPHandler({
      driver: {
        name: "server-fixture",
        capabilities: { lookup: false, current: true, batchLookup: false },
        async current() {
          return { ip: "current-provider", source: "server-fixture" };
        },
      },
      authorize(request) {
        authorizedIP = request.ip;
      },
    });

    const response = await handlerResponse(
      handler,
      new Request("http://localhost/current", {
        headers: { "X-Forwarded-For": "203.0.113.7" },
      }),
    );
    expect(response.status).toBe(200);
    expect(authorizedIP).toBe("127.0.0.1");
  });
});

describe("server batch safety", () => {
  test("rejects bodies and IP counts above configured limits", async () => {
    const handler = createGeoIPHandler({
      maxIps: 2,
      maxBodyBytes: 100,
      driver: {
        name: "server-fixture",
        capabilities: { lookup: true, current: false, batchLookup: true },
        async batchLookup(ips) {
          return ips.map((ip) => ({ ip, source: "server-fixture" }));
        },
      } satisfies Driver,
    });

    const tooMany = await handlerResponse(
      handler,
      new Request("http://localhost/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ips: ["192.0.2.1", "192.0.2.2", "192.0.2.3"] }),
      }),
    );
    expect(tooMany.status).toBe(413);

    const tooLarge = await handlerResponse(
      handler,
      new Request("http://localhost/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ips: [`${"0".repeat(200)}.1`] }),
      }),
    );
    expect(tooLarge.status).toBe(413);

    const invalid = await handlerResponse(
      handler,
      new Request("http://localhost/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ips: ["192.0.2.1", ""] }),
      }),
    );
    expect(invalid.status).toBe(400);

    const nullBody = await handlerResponse(
      handler,
      new Request("http://localhost/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "null",
      }),
    );
    expect(nullBody.status).toBe(400);
  });

  test("maps native batch provider failures to HTTP 502", async () => {
    const handler = createGeoIPHandler({
      driver: {
        name: "server-fixture",
        capabilities: { lookup: true, current: false, batchLookup: true },
        async batchLookup() {
          throw new GeoIPProviderError("server-fixture", "quota exceeded");
        },
      } satisfies Driver,
    });

    const response = await handlerResponse(
      handler,
      new Request("http://localhost/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ips: ["192.0.2.1"] }),
      }),
    );
    expect(response.status).toBe(502);
  });

  test("does not force wildcard CORS when custom headers are configured", async () => {
    const headers = resolveCORSHeaders("https://example.test", {
      allowHeaders: ["X-API-Key"],
    });

    expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(headers["Access-Control-Allow-Headers"]).toBe("X-API-Key");

    const handler = createGeoIPHandler({
      cors: { allowHeaders: ["X-API-Key"] },
    });
    const response = await handlerResponse(handler, new Request("http://localhost/help"));
    expect(headersOf(response).get("Access-Control-Allow-Origin")).toBeNull();
    expect(headersOf(response).get("Access-Control-Allow-Headers")).toBe("X-API-Key");
  });

  test("exposes the package version and bounded batch options", async () => {
    const batchOptions = { batchSize: 1, concurrency: 1 };
    const batchLookup = vi.fn(async (ips: string[]) =>
      ips.map((ip) => ({ ip, source: "server-fixture" })),
    );
    const handler = createGeoIPHandler({
      maxIps: 2,
      batchOptions,
      driver: {
        name: "server-fixture",
        capabilities: { lookup: true, current: false, batchLookup: true },
        batchLookup,
      } satisfies Driver,
    });

    const response = await handlerResponse(handler, new Request("http://localhost/help"));
    const help = (await response.json()) as {
      version: string;
      batch_endpoint: { max_ips: number; max_body_bytes: number };
    };

    expect(help.version).toBe(packageJson.version);
    expect(geoIPVersion).toBe(packageJson.version);

    const batch = await handlerResponse(
      handler,
      new Request("http://localhost/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ips: ["192.0.2.1", "192.0.2.2"] }),
      }),
    );

    expect(batch.status).toBe(200);
    expect(batchLookup).toHaveBeenCalledWith(
      ["192.0.2.1", "192.0.2.2"],
      expect.objectContaining(batchOptions),
    );
  });
});

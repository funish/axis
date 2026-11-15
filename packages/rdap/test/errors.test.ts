import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { RdapError } from "../src/error";
import { getServerUrl, queryHelp, queryRDAP } from "../src/rdap";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("typed RDAP HTTP errors", () => {
  it("maps HTTP 404 to a non-retryable typed error", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ errorCode: 404 }), {
        status: 404,
        headers: { "Content-Type": "application/rdap+json" },
      }),
    );

    const error = await queryRDAP("example.com", {
      baseUrl: "https://rdap.example.com",
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(RdapError);
    const rdapError = error as RdapError;
    expect(rdapError.code).toBe("HTTP_ERROR");
    expect(rdapError.status).toBe(404);
    expect(rdapError.retryable).toBe(false);
    expect(rdapError.query).toBe("example.com");
    expect(rdapError.queryType).toBe("domain");
    expect(rdapError.cause).toBeDefined();
  });

  it("marks rate limits as retryable and preserves the upstream status", async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response("rate limited", {
          status: 429,
          headers: { "Content-Type": "text/plain" },
        }),
    );

    await expect(
      queryRDAP("8.8.8.8", { baseUrl: "https://rdap.example.com", type: "ip" }),
    ).rejects.toMatchObject({
      code: "HTTP_ERROR",
      status: 429,
      retryable: true,
      queryType: "ip",
    });
  });

  it("requires a server URL for help and validates request configuration", async () => {
    await expect(queryHelp()).rejects.toMatchObject({
      code: "CONFIGURATION_ERROR",
      queryType: "help",
    });
    await expect(
      getServerUrl("example.com", "domain", { baseUrl: "not a url" }),
    ).rejects.toMatchObject({
      code: "CONFIGURATION_ERROR",
      queryType: "domain",
    });
  });
});

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import dnsMetadata from "../src/bootstrap/dns.json";
import ipv4Metadata from "../src/bootstrap/ipv4.json";
import { clearBootstrapCache, findBootstrapServer, getBootstrapMetadata } from "../src/rdap";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("IANA bootstrap matching", () => {
  it("matches DNS and IP queries without network access", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    clearBootstrapCache();

    await expect(findBootstrapServer("dns", "example.com")).resolves.toBe(
      "https://rdap.verisign.com/com/v1/",
    );
    await expect(findBootstrapServer("ipv4", "8.8.8.8")).resolves.toBe(
      "https://rdap.arin.net/registry/",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("prefers secure service URLs", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const server = await findBootstrapServer("object-tags", "ARIN");
    expect(server).toBe("https://rdap.arin.net/registry/");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reuses fetched metadata for the configured TTL and falls back to bundled data", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    clearBootstrapCache();
    fetchMock.mockResolvedValueOnce(
      Response.json({
        ...ipv4Metadata,
        description: "fetched IPv4 metadata",
      }),
    );

    const fetched = await getBootstrapMetadata("ipv4", true, 60_000);
    expect(fetched.description).toBe("fetched IPv4 metadata");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const cached = await getBootstrapMetadata("ipv4");
    expect(cached.description).toBe("fetched IPv4 metadata");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    clearBootstrapCache();
    fetchMock.mockImplementation(async () => {
      throw new Error("bootstrap unavailable");
    });
    const fallback = await getBootstrapMetadata("dns", true, 0);
    expect(fallback.description).toBe(dnsMetadata.description);
  });
});

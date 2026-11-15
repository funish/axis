import { describe, expect, it } from "vite-plus/test";

import { RdapError } from "../src/error";
import {
  bootstrapTypeToQueryType,
  convertToAscii,
  formatAsn,
  getBootstrapType,
  getQueryType,
  isAsn,
  isDomain,
  validateQuery,
} from "../src/utils";

describe("RDAP query detection", () => {
  it("detects ASN, IP, domain, help, and entity queries", () => {
    expect(getQueryType("AS15169")).toBe("autnum");
    expect(getQueryType("15169")).toBe("autnum");
    expect(getQueryType("8.8.8.8")).toBe("ip");
    expect(getQueryType("2001:db8::1")).toBe("ip");
    expect(getQueryType("example.com")).toBe("domain");
    expect(getQueryType("help")).toBe("help");
    expect(getQueryType("EXAMPLE-HANDLE")).toBe("entity");
  });

  it("rejects malformed queries instead of silently choosing a type", () => {
    expect(() => getQueryType("invalid query")).toThrow(RdapError);
    expect(() => validateQuery("999.999.999.999", "ip")).toThrow(RdapError);
    expect(() => validateQuery("not-a-domain", "domain")).toThrow(RdapError);
    expect(() => validateQuery("AS99999999999", "autnum")).toThrow(RdapError);
  });

  it("validates explicit domain, nameserver, IP, ASN, and entity values", () => {
    expect(validateQuery("example.com", "domain")).toBe("example.com");
    expect(validateQuery("ns1.example.com", "nameserver")).toBe("ns1.example.com");
    expect(validateQuery("2606:4700::1111", "ip")).toBe("2606:4700::1111");
    expect(validateQuery("AS15169", "autnum")).toBe("AS15169");
    expect(validateQuery("EXAMPLE", "entity")).toBe("EXAMPLE");
  });
});

describe("RDAP helpers", () => {
  it("maps bootstrap types to query types", () => {
    expect(bootstrapTypeToQueryType("asn")).toBe("autnum");
    expect(bootstrapTypeToQueryType("dns")).toBe("domain");
    expect(bootstrapTypeToQueryType("ipv6")).toBe("ip");
    expect(bootstrapTypeToQueryType("object-tags")).toBe("entity");
    expect(bootstrapTypeToQueryType("dns", "nameserver")).toBe("nameserver");
  });

  it("normalizes ASNs and detects bootstrap types", () => {
    expect(formatAsn("AS15169")).toBe("15169");
    expect(getBootstrapType("example.com")).toBe("dns");
    expect(getBootstrapType("8.8.8.8")).toBe("ipv4");
    expect(getBootstrapType("2001:db8::1")).toBe("ipv6");
    expect(getBootstrapType("AS15169")).toBe("asn");
    expect(getBootstrapType("EXAMPLE")).toBe("object-tags");
  });

  it("validates ASNs and domains", () => {
    expect(isAsn("AS15169")).toBe(true);
    expect(isAsn("0")).toBe(true);
    expect(isAsn("AS4294967296")).toBe(false);
    expect(isDomain("example.com")).toBe(true);
    expect(isDomain("localhost")).toBe(false);
    expect(isDomain("example..com")).toBe(false);
    expect(isDomain("999.999.999.999")).toBe(false);
  });
});

describe("IDN handling", () => {
  it("converts Unicode domains to Punycode", () => {
    expect(convertToAscii("Bücher.example")).toBe("xn--bcher-kva.example");
    expect(convertToAscii("пример.испытание")).toBe("xn--e1afmkfd.xn--80akhbyknj4f");
  });

  it("rejects invalid IDN input", () => {
    expect(() => convertToAscii("invalid query")).toThrow(RdapError);
    expect(() => convertToAscii("bad_.example")).toThrow(RdapError);
  });

  it("encodes query values in explicit request URLs", async () => {
    const { getServerUrl } = await import("../src/rdap");
    const url = await getServerUrl("Bücher.example", "domain", {
      baseUrl: "https://rdap.example.com/registry/",
    });
    expect(url).toBe("https://rdap.example.com/registry/domain/xn--bcher-kva.example");
  });
});

import { describe, expect, test } from "vite-plus/test";

import {
  DNS_TYPE_NUMBERS,
  getDnsTypeNumber,
  parseDohAnswer,
  parseDohResponse,
} from "../src/drivers/doh";
import { UNDNS_ERROR_CODES } from "../src/errors";
import { DOH_FAILURE, DOH_NXDOMAIN, DOH_PARTIAL_ANSWER } from "./fixtures/doh";

describe("DoH JSON parsing", () => {
  test("parses requested records and preserves CNAME chain data", () => {
    const records = parseDohResponse(DOH_PARTIAL_ANSWER, "A");
    expect(records).toHaveLength(2);
    expect(records[0]).toEqual({
      type: "CNAME",
      value: "target.example.com.",
      ttl: 180,
    });
    expect(records[1]).toEqual({
      type: "A",
      address: "192.0.2.1",
      ttl: 300,
    });
  });

  test("parses provider-specific wire text into typed records", () => {
    expect(
      parseDohAnswer({ type: DNS_TYPE_NUMBERS.MX!, TTL: 60, data: "10 mail.example.com." }),
    ).toEqual({
      type: "MX",
      priority: 10,
      exchange: "mail.example.com.",
      ttl: 60,
    });
    expect(
      parseDohAnswer({ type: DNS_TYPE_NUMBERS.TXT!, TTL: 60, data: '"v=spf1" "-all"' }),
    ).toEqual({ type: "TXT", entries: ["v=spf1", "-all"], ttl: 60 });
    expect(
      parseDohAnswer({
        type: DNS_TYPE_NUMBERS.CAA!,
        TTL: 60,
        data: '0 issue "pki.example.com"',
      }),
    ).toEqual({ type: "CAA", critical: 0, issue: "pki.example.com", ttl: 60 });
  });

  test("separates NXDOMAIN from NOERROR-empty and preserves provider status", () => {
    expect(parseDohResponse({ Status: 0, Answer: [] }, "A")).toEqual([]);
    try {
      parseDohResponse(DOH_NXDOMAIN, "A");
      throw new Error("expected NXDOMAIN");
    } catch (error: any) {
      expect(error.code).toBe(UNDNS_ERROR_CODES.nameNotFound);
      expect(error.status).toBe(3);
    }
    try {
      parseDohResponse(DOH_FAILURE, "A");
      throw new Error("expected provider failure");
    } catch (error: any) {
      expect(error.code).toBe(UNDNS_ERROR_CODES.providerError);
      expect(error.status).toBe(2);
      expect(error.providerMessage).toBe("upstream timeout");
    }
  });

  test("rejects malformed provider data instead of silently dropping it", () => {
    expect(() =>
      parseDohAnswer({ type: DNS_TYPE_NUMBERS.MX!, TTL: 60, data: "mail.example.com." }),
    ).toThrow(/Invalid MX/);
    expect(() => getDnsTypeNumber("BOGUS")).toThrow(/Unsupported DNS record type/);
  });
});

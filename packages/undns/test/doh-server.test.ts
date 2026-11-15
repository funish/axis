import { H3 } from "h3";
import { describe, expect, test, vi } from "vite-plus/test";

import { UndnsError } from "../src/errors";
import { createDohHandler, encodeDnsWireResponse, parseDnsWireQuery } from "../src/servers/doh";
import type { Driver } from "../src/types";
import {
  encodeWireQuery,
  readFirstAAnswer,
  readOptDoBit,
  readWireHeader,
} from "./fixtures/dns-wire";

function fixtureDriver(records: readonly any[]): Driver {
  return {
    name: "fixture",
    capabilities: { read: true, nxdomain: false },
    getRecords: vi.fn(async () => [...records]),
  };
}

async function callHandler(driver: Driver, request: Request): Promise<Response> {
  const app = new H3().use("/dns-query", createDohHandler({ driver }));
  return await app.fetch(request);
}

describe("DoH JSON server", () => {
  test("returns NOERROR-empty separately from NXDOMAIN", async () => {
    const empty = await callHandler(
      fixtureDriver([]),
      new Request("http://localhost/dns-query?name=empty.example.com&type=A", {
        headers: { accept: "application/dns-json" },
      }),
    );
    expect(empty.status).toBe(200);
    expect(await empty.json()).toMatchObject({ Status: 0, AD: false, DO: false, Answer: [] });

    const nxDriver: Driver = {
      name: "fixture",
      capabilities: { read: true, nxdomain: true },
      getRecords: async () => {
        throw new UndnsError("name_not_found", "missing name");
      },
    };
    const missing = await callHandler(
      nxDriver,
      new Request("http://localhost/dns-query?name=missing.example.com&type=A", {
        headers: { accept: "application/dns-json" },
      }),
    );
    expect(missing.status).toBe(200);
    expect(await missing.json()).toMatchObject({ Status: 3, Answer: [] });
  });

  test("does not turn the DNSSEC DO request flag into authenticated data", async () => {
    const response = await callHandler(
      fixtureDriver([{ type: "A", address: "192.0.2.1", ttl: 120 }]),
      new Request("http://localhost/dns-query?name=example.com&type=A&do=1", {
        headers: { accept: "application/dns-json" },
      }),
    );
    const body = await response.json();
    expect(body).toMatchObject({
      Status: 0,
      AD: false,
      DO: true,
      Question: [{ name: "example.com.", type: 1 }],
      Answer: [{ type: 1, TTL: 120, data: "192.0.2.1" }],
    });
  });
});

describe("DoH wire server", () => {
  test("round-trips a safe wire query and echoes its transaction ID and DO bit", () => {
    const query = encodeWireQuery({ transactionId: 0x4f21, dnssecOk: true });
    const parsed = parseDnsWireQuery(query.buffer);
    expect(parsed).toMatchObject({
      transactionId: 0x4f21,
      name: "example.com",
      type: 1,
      dnssecOk: true,
    });

    const response = encodeDnsWireResponse(parsed, {
      Status: 0,
      RD: true,
      RA: true,
      AD: false,
      CD: false,
      DO: true,
      Answer: [{ name: "example.com.", type: 1, TTL: 300, data: "192.0.2.7" }],
    });
    expect(readWireHeader(response)).toEqual({
      transactionId: 0x4f21,
      flags: expect.any(Number),
      questionCount: 1,
      answerCount: 1,
      authorityCount: 0,
      additionalCount: 1,
    });
    expect(readFirstAAnswer(response)).toBe("192.0.2.7");
    expect(readOptDoBit(response)).toBe(true);
  });

  test("sends an RFC 8484 wire NXDOMAIN response rather than an empty NOERROR", async () => {
    const nxDriver: Driver = {
      name: "fixture",
      capabilities: { read: true, nxdomain: true },
      getRecords: async () => {
        throw new UndnsError("name_not_found", "missing name");
      },
    };
    const body = encodeWireQuery({ transactionId: 0x00ff });
    const response = await callHandler(
      nxDriver,
      new Request("http://localhost/dns-query?dns=ignored", {
        method: "POST",
        headers: { "content-type": "application/dns-message" },
        body: body as unknown as BodyInit,
      }),
    );
    const bytes = await response.arrayBuffer();
    const header = readWireHeader(bytes);
    expect(response.headers.get("content-type")).toBe("application/dns-message");
    expect(header.transactionId).toBe(0x00ff);
    expect(header.answerCount).toBe(0);
    expect(header.flags & 0x0f).toBe(3);
    expect(header.flags & 0x8000).not.toBe(0);
    expect(header.flags & 0x0020).toBe(0); // AD remains false
  });

  test("rejects oversized wire POST bodies with 413", async () => {
    const oversized = new Uint8Array(65_536);
    const response = await callHandler(
      fixtureDriver([]),
      new Request("http://localhost/dns-query", {
        method: "POST",
        headers: { "content-type": "application/dns-message" },
        body: oversized as unknown as BodyInit,
      }),
    );
    expect(response.status).toBe(413);
    expect(await response.text()).toContain("DNS message too large");
  });
  test("parses POST wire transactions and returns an A answer", async () => {
    const bytes = encodeWireQuery({ transactionId: 0x5aa5 });
    const response = await callHandler(
      fixtureDriver([{ type: "A", address: "192.0.2.9", ttl: 60 }]),
      new Request("http://localhost/dns-query", {
        method: "POST",
        headers: { "content-type": "application/dns-message" },
        body: bytes as unknown as BodyInit,
      }),
    );
    expect(response.headers.get("content-type")).toBe("application/dns-message");
    const wire = await response.arrayBuffer();
    expect(readWireHeader(wire).transactionId).toBe(0x5aa5);
    expect(readFirstAAnswer(wire)).toBe("192.0.2.9");
  });
});

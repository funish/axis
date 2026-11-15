import { describe, expect, test, vi } from "vite-plus/test";

import { UNDNS_ERROR_CODES } from "../src/errors";
const clients: any[] = [];

vi.mock("cloudflare", () => ({
  default: vi.fn(function MockCloudflare(options: unknown) {
    const client = {
      options,
      zones: {
        list: vi.fn(),
      },
      dns: {
        records: {
          list: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
        },
      },
    };
    clients.push(client);
    return client;
  }),
}));

const cloudflareDriver = (await import("../src/drivers/cloudflare")).default;

describe("Cloudflare driver requests", () => {
  test("uses a configured zone ID and follows record pagination without listing zones", async () => {
    clients.length = 0;
    const driver = cloudflareDriver({
      apiToken: "fixture-token",
      zones: { "example.com": "zone-123" },
    });
    const client = clients[0];
    client.dns.records.list
      .mockReturnValueOnce(
        (async function* () {
          yield { id: "one", name: "www.example.com", type: "A", content: "192.0.2.1", ttl: 300 };
          yield { id: "two", name: "www.example.com", type: "A", content: "192.0.2.1", ttl: 300 };
        })(),
      )
      .mockReturnValueOnce(
        (async function* () {
          yield {
            id: "three",
            name: "www.example.com",
            type: "AAAA",
            content: "2001:db8::1",
            ttl: 300,
          };
        })(),
      );

    const first = await driver.getRecords!("example.com", { name: "www", type: "A" });
    const second = await driver.getRecords!("example.com", { type: "AAAA" });

    expect(first.map((record) => record.id)).toEqual(["one", "two"]);
    expect(second.map((record) => record.id)).toEqual(["three"]);
    expect(client.zones.list).not.toHaveBeenCalled();
    expect(client.dns.records.list).toHaveBeenNthCalledWith(1, {
      zone_id: "zone-123",
      type: "A",
      name: { exact: "www.example.com" },
    });
  });

  test("looks up only the exact zone candidate and caches it", async () => {
    clients.length = 0;
    const driver = cloudflareDriver({ apiToken: "fixture-token" });
    const client = clients[0];
    expect(client).toBeDefined();
    expect(clients.length).toBe(1);
    expect(vi.isMockFunction(client.zones.list)).toBe(true);
    client.zones.list.mockImplementation((params: any) =>
      (async function* generateZones(params: any) {
        if (params.name === "example.com") {
          yield { id: "zone-discovered", name: params.name };
        }
      })(params),
    );
    client.dns.records.list.mockReturnValue(
      (async function* () {
        yield { id: "one", name: "api.example.com", type: "A", content: "192.0.2.3", ttl: 300 };
      })(),
    );

    const records = await driver.getRecords!("api.example.com", { type: "A" });
    const cached = await driver.getRecords!("www.example.com", { type: "A" });
    expect(records.map((record) => record.id)).toEqual(["one"]);
    expect(cached).toEqual([]);
    expect(client.zones.list).toHaveBeenCalledTimes(2);
    expect(client.zones.list).toHaveBeenNthCalledWith(1, { name: "api.example.com", per_page: 1 });
    expect(client.zones.list).toHaveBeenNthCalledWith(2, { name: "example.com", per_page: 1 });
  });

  test("updates an existing matching record instead of creating a duplicate", async () => {
    clients.length = 0;
    const driver = cloudflareDriver({
      apiToken: "fixture-token",
      zones: { "example.com": "zone-123" },
    });
    const client = clients[0];
    client.dns.records.list.mockReturnValue(
      (async function* () {
        yield {
          id: "record-1",
          name: "www.example.com",
          type: "A",
          content: "192.0.2.1",
          ttl: 300,
        };
      })(),
    );
    client.dns.records.update = vi.fn(async () => ({
      id: "record-1",
      name: "www.example.com",
      type: "A",
      content: "192.0.2.1",
      ttl: 300,
    }));

    const result = await driver.setRecord!("example.com", {
      name: "www",
      type: "A",
      address: "192.0.2.1",
      ttl: 300,
    });

    expect(result).toMatchObject({ id: "record-1", address: "192.0.2.1", name: "www" });
    expect(client.dns.records.update).toHaveBeenCalledWith("record-1", {
      zone_id: "zone-123",
      name: "www.example.com",
      type: "A",
      ttl: 300,
      content: "192.0.2.1",
    });
    expect(client.dns.records.create).not.toHaveBeenCalled();
  });

  test("creates a second value instead of replacing the first same-name record", async () => {
    clients.length = 0;
    const driver = cloudflareDriver({
      apiToken: "fixture-token",
      zones: { "example.com": "zone-123" },
    });
    const client = clients[0];
    client.dns.records.list.mockReturnValue(
      (async function* () {
        yield {
          id: "record-1",
          name: "www.example.com",
          type: "TXT",
          content: "first",
          ttl: 300,
        };
      })(),
    );
    client.dns.records.create = vi.fn(async () => ({
      id: "record-2",
      name: "www.example.com",
      type: "TXT",
      content: "second",
      ttl: 300,
    }));

    const result = await driver.setRecord!("example.com", {
      name: "www",
      type: "TXT",
      entries: ["second"],
      ttl: 300,
    });

    expect(result).toMatchObject({ id: "record-2", entries: ["second"], name: "www" });
    expect(client.dns.records.create).toHaveBeenCalledWith({
      zone_id: "zone-123",
      name: "www.example.com",
      type: "TXT",
      ttl: 300,
      content: "second",
    });
    expect(client.dns.records.update).not.toHaveBeenCalled();
  });

  test("wraps provider failures with the stable taxonomy, message, and status", async () => {
    clients.length = 0;
    const driver = cloudflareDriver({
      apiToken: "fixture-token",
      zones: { "example.com": "zone-123" },
    });
    const client = clients[0];
    client.dns.records.list.mockImplementation(() => {
      throw Object.assign(new Error("rate limited"), { status: 429 });
    });

    await expect(driver.getRecords!("example.com")).rejects.toMatchObject({
      name: "UndnsError",
      code: UNDNS_ERROR_CODES.providerError,
      provider: "cloudflare",
      status: 429,
      providerMessage: "rate limited",
    });
  });
});

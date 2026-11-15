import { describe, expect, test, vi } from "vite-plus/test";

import { createDNSManager } from "../src";
import nullDriver from "../src/drivers/null";
import { UNDNS_ERROR_CODES } from "../src/errors";
import type { Driver, DNSRecord } from "../src/types";

describe("manager capability contract", () => {
  test("makes missing read and write operations explicit", async () => {
    const manager = createDNSManager({ driver: { name: "empty" } });

    expect(manager.capabilities).toEqual({
      read: false,
      write: false,
      upsert: false,
      batchWrite: false,
      nxdomain: false,
    });
    await expect(manager.getRecords("example.com")).rejects.toMatchObject({
      code: UNDNS_ERROR_CODES.unsupportedOperation,
    });
    await expect(
      manager.setRecord("example.com", { name: "@", type: "A", address: "127.0.0.1" }),
    ).rejects.toMatchObject({
      code: UNDNS_ERROR_CODES.unsupportedOperation,
    });
    await expect(
      manager.removeRecord("example.com", { type: "A" } as DNSRecord),
    ).rejects.toMatchObject({
      code: UNDNS_ERROR_CODES.unsupportedOperation,
    });
  });

  test("null driver disables operations explicitly rather than pretending to read", async () => {
    const manager = createDNSManager({ driver: nullDriver() });
    expect(manager.capabilities).toMatchObject({ read: false, write: false });
    await expect(manager.getRecords("example.com")).rejects.toMatchObject({
      code: UNDNS_ERROR_CODES.unsupportedOperation,
    });
  });

  test("propagates a driver NXDOMAIN instead of changing it to an empty answer", async () => {
    const driver: Driver = {
      name: "fixture",
      capabilities: { read: true, nxdomain: true },
      getRecords: async () => {
        throw Object.assign(new Error("missing name"), { code: UNDNS_ERROR_CODES.nameNotFound });
      },
    };
    const manager = createDNSManager({ driver });
    await expect(manager.getRecords("missing.example.com")).rejects.toMatchObject({
      code: UNDNS_ERROR_CODES.nameNotFound,
    });
  });
});

describe("manager upsert semantics", () => {
  test("returns an identical record without invoking a non-upsert writer", async () => {
    const existing: DNSRecord = {
      id: "record-1",
      type: "A",
      name: "www",
      address: "192.0.2.10",
      ttl: 300,
    };
    const setRecord = vi.fn();
    const driver: Driver = {
      name: "fixture",
      capabilities: { read: true, write: true, upsert: false },
      getRecords: async () => [existing],
      setRecord,
    };
    const manager = createDNSManager({ driver });

    const result = await manager.setRecord("example.com", {
      name: "www.example.com",
      type: "A",
      address: "192.0.2.10",
    });
    expect(result).toBe(existing);
    expect(setRecord).not.toHaveBeenCalled();
  });

  test("does not infer a replacement target when a changed value has no explicit ID", async () => {
    const existing = {
      id: "record-1",
      type: "A",
      name: "www",
      address: "192.0.2.10",
    } as DNSRecord;
    const calls: any[] = [];
    const driver: Driver = {
      name: "fixture",
      capabilities: { read: true, write: true, upsert: false },
      getRecords: async () => [existing],
      setRecord: async (_domain, record) => {
        calls.push(record);
        return { ...record, id: record.id } as DNSRecord;
      },
    };
    const manager = createDNSManager({ driver });

    const result = await manager.setRecord("example.com", {
      name: "www",
      type: "A",
      address: "192.0.2.20",
    });
    expect(result).toMatchObject({ id: undefined, address: "192.0.2.20" });
    expect(calls).toHaveLength(1);
  });

  test("delegates to an explicitly upsert-capable writer without prelisting", async () => {
    const listCalls = vi.fn();
    const driver: Driver = {
      name: "fixture",
      capabilities: { read: true, write: true, upsert: true },
      getRecords: listCalls,
      setRecord: async () =>
        ({ id: "new", type: "A", name: "www", address: "192.0.2.20" }) as DNSRecord,
    };
    const manager = createDNSManager({ driver });
    const result = await manager.setRecord("example.com", {
      name: "www",
      type: "A",
      address: "192.0.2.20",
    });
    expect(listCalls).not.toHaveBeenCalled();
    expect(result.id).toBe("new");
  });
});

describe("manager partial batch semantics", () => {
  test("continues setRecords and reports successful records plus indexed failures", async () => {
    const driver: Driver = {
      name: "fixture",
      capabilities: { read: false, write: true, upsert: true },
      setRecord: async (_domain, record) => {
        if (record.name === "bad") throw new Error("provider rejected record");
        return { ...record, id: `new-${record.name}` } as DNSRecord;
      },
    };
    const manager = createDNSManager({ driver });
    const result = await manager.setRecords("example.com", [
      { name: "good", type: "A", address: "192.0.2.1" },
      { name: "bad", type: "A", address: "192.0.2.2" },
      { name: "also-good", type: "A", address: "192.0.2.3" },
    ]);

    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.records.map((record) => record.id)).toEqual(["new-good", "new-also-good"]);
    expect(result.failures).toEqual([
      {
        index: 1,
        item: { name: "bad", type: "A", address: "192.0.2.2" },
        error: expect.objectContaining({ message: "provider rejected record" }),
      },
    ]);
  });

  test("continues removeRecords and reports indexed failures", async () => {
    const driver: Driver = {
      name: "fixture",
      capabilities: { write: true },
      removeRecord: async (_domain, record) => {
        if (record.id === "bad") throw new Error("provider rejected removal");
      },
    };
    const manager = createDNSManager({ driver });
    const result = await manager.removeRecords("example.com", [
      { type: "A", id: "good" } as DNSRecord,
      { type: "A", id: "bad" } as DNSRecord,
    ]);

    expect(result.removed).toBe(1);
    expect(result.failures[0]).toMatchObject({ index: 1 });
    expect(result.failures[0]?.error.message).toBe("provider rejected removal");
  });
});

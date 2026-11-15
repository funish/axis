import { describe, expect, test, vi } from "vite-plus/test";

let testQueue = Promise.resolve();

function enqueue<T>(task: () => Promise<T> | T): Promise<T> {
  const running = testQueue.then(task, task);
  testQueue = running.then(
    () => undefined,
    () => undefined,
  );
  return running;
}

function serialTest(name: string, callback: () => Promise<void> | void): void {
  test(name, () => enqueue(callback));
}

import hybridDriver from "../src/drivers/hybrid";
import type { Driver, PingResult } from "../src/types";

function result(alive: boolean, overrides: Partial<PingResult> = {}): PingResult {
  return { host: "example.com", alive, time: 3, kind: "tcp", ...overrides };
}

function driver(name: string, value: PingResult[] | Error): Driver {
  return {
    name,
    ping: vi.fn(async () => {
      if (value instanceof Error) {
        throw value;
      }
      return value;
    }),
  };
}

describe("Hybrid driver", () => {
  describe("hybrid driver", () => {
    serialTest("falls back from target-down to a successful driver", async () => {
      const tcp = driver("tcp", [
        result(false, { error: { code: "ECONNREFUSED", category: "network" } }),
      ]);
      const web = driver("web", [result(true, { statusCode: 200 })]);
      const hybrid = hybridDriver({ drivers: [tcp, web] });

      const results = await hybrid.ping("example.com");

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        alive: true,
        kind: "hybrid",
        method: "hybrid-fallback",
        statusCode: 200,
        metadata: {
          successfulDriver: "web",
          attempts: [
            { driver: "tcp", outcome: "target_down" },
            { driver: "web", outcome: "success" },
          ],
        },
      });
      expect(tcp.ping).toHaveBeenCalled();
    });

    serialTest(
      "continues after a driver exception and reports the final target-down result",
      async () => {
        const failing = driver("failing", new Error("transport unavailable"));
        const tcp = driver("tcp", [result(false)]);
        const hybrid = hybridDriver({ drivers: [failing, tcp] });

        const results = await hybrid.ping("example.com");

        expect(results[0].alive).toBe(false);
        expect(results[0].metadata?.attempts).toEqual([
          expect.objectContaining({ driver: "failing", outcome: "driver_failure" }),
          expect.objectContaining({ driver: "tcp", outcome: "target_down" }),
        ]);
        expect(results[0].metadata?.fallbackReasons).toEqual(["tcp"]);
      },
    );

    serialTest("throws when every driver failure is transport/configuration related", async () => {
      const first = driver("first", new Error("driver one unavailable"));
      const second = { name: "second" };
      const hybrid = hybridDriver({ drivers: [first, second] });

      const error = (await hybrid
        .ping("example.com")
        .catch((caught: unknown) => caught)) as Error & {
        attempts?: unknown;
      };

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe("Driver second does not implement ping");
      expect((error as Error & { attempts?: unknown }).attempts).toEqual([
        expect.objectContaining({ driver: "first", outcome: "driver_failure" }),
        expect.objectContaining({ driver: "second", outcome: "driver_failure" }),
      ]);
    });

    serialTest("resolves count zero to an empty series without probing", async () => {
      const selected = driver("tcp", [result(true)]);
      const hybrid = hybridDriver({ drivers: [selected] });

      await expect(hybrid.ping("example.com", { count: 0 })).resolves.toEqual([]);
      expect(selected.ping).not.toHaveBeenCalled();
    });
    serialTest(
      "preserves the sequence contract and passes count to each selected driver",
      async () => {
        const selected = driver("web", [
          result(true, { sequence: 7 }),
          result(true, { sequence: 8 }),
        ]);
        const hybrid = hybridDriver({ drivers: [selected] });

        const results = await hybrid.ping("example.com", { count: 2 });

        expect(selected.ping).toHaveBeenCalledWith("example.com", { count: 2 });
        expect(results[0].sequence).toBe(7);
        expect(results[1].sequence).toBe(8);
        expect(results.every((item) => item.kind === "hybrid")).toBe(true);
      },
    );
  });
});

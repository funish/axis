import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

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

import { normalizeProbeOptions, runProbeSeries } from "../src/probe";
import type { PingResult } from "../src/types";

const probe = vi.fn(async (host: string, context: { sequence: number }): Promise<PingResult> => ({
  host,
  alive: true,
  time: 2,
  sequence: context.sequence,
}));

beforeEach(() => {
  probe.mockClear();
});

describe("Probe loop", () => {
  describe("probe options", () => {
    serialTest("applies defaults and preserves an explicit zero interval", () => {
      expect(normalizeProbeOptions()).toEqual({
        count: 1,
        timeout: 5000,
        interval: 0,
        size: undefined,
      });
      expect(normalizeProbeOptions({ count: 3, interval: 0, size: 64 })).toEqual({
        count: 3,
        timeout: 5000,
        interval: 0,
        size: 64,
      });
    });

    serialTest("rejects invalid limits", () => {
      expect(() => normalizeProbeOptions({ count: -1 })).toThrow(RangeError);
      expect(() => normalizeProbeOptions({ timeout: 0 })).toThrow(RangeError);
      expect(() => normalizeProbeOptions({ interval: -1 })).toThrow(RangeError);
      expect(() => normalizeProbeOptions({ size: 0 })).toThrow(RangeError);
    });
  });

  describe("probe series", () => {
    serialTest("returns no results for count zero", async () => {
      await expect(runProbeSeries("example.com", { count: 0 }, probe)).resolves.toEqual([]);
      expect(probe).not.toHaveBeenCalled();
    });

    serialTest("passes sequences and does not schedule a zero interval", async () => {
      const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

      await runProbeSeries("example.com", { count: 3, interval: 0 }, probe);

      expect(probe.mock.calls.map(([, context]) => context.sequence)).toEqual([1, 2, 3]);
      expect(setTimeoutSpy).not.toHaveBeenCalled();
    });

    serialTest("waits only between probes", async () => {
      const results = await runProbeSeries("example.com", { count: 2, interval: 5 }, probe);
      expect(results).toHaveLength(2);
    });

    serialTest("normalizes sequence and timestamp on returned probes", async () => {
      const before = Date.now();
      const results = await runProbeSeries("example.com", {}, async () => ({
        host: "example.com",
        alive: true,
        time: 1,
      }));

      expect(results[0]).toMatchObject({ sequence: 1, timestamp: expect.any(Number) });
      expect(results[0].timestamp).toBeGreaterThanOrEqual(before);
    });
  });
});

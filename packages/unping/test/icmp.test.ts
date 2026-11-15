import { EventEmitter } from "node:events";

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

class MockStream extends EventEmitter {
  setEncoding = vi.fn();
}

class MockChild extends EventEmitter {
  stdout = new MockStream();
  stderr = new MockStream();
  kill = vi.fn();
}

let child: MockChild;
const spawnMock = vi.fn(() => child);

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

const {
  buildICMPArguments,
  default: icmpDriver,
  parseICMPOutput,
  pingOnceICMP,
} = await import("../src/drivers/icmp");

beforeEach(() => {
  child = new MockChild();
  spawnMock.mockClear().mockImplementation(() => child);
});

describe("ICMP driver", () => {
  describe("ICMP arguments and parsing", () => {
    serialTest("uses shell-free, platform-specific arguments", () => {
      expect(
        buildICMPArguments("linux", "example.com", { sequence: 1, timeout: 1500, size: 64 }),
      ).toEqual(["-c", "1", "-W", "2", "-s", "64", "example.com"]);
      expect(
        buildICMPArguments("darwin", "example.com", { sequence: 1, timeout: 1500, size: 64 }),
      ).toEqual(["-c", "1", "-W", "1500", "-s", "64", "example.com"]);
      expect(buildICMPArguments("win32", "::1", { sequence: 1, timeout: 5000, size: 32 })).toEqual([
        "-6",
        "-n",
        "1",
        "-w",
        "5000",
        "-l",
        "32",
        "::1",
      ]);
    });

    serialTest("rejects option-like and unsafe hosts before spawning", () => {
      expect(() =>
        buildICMPArguments("linux", "- evil", { sequence: 1, timeout: 1000, size: 64 }),
      ).toThrow(RangeError);
      expect(() =>
        buildICMPArguments("linux", "example.com\n", { sequence: 1, timeout: 1000, size: 64 }),
      ).toThrow(RangeError);
    });

    serialTest("parses Unix, Windows, timing, TTL, and loss output", () => {
      expect(
        parseICMPOutput(
          [
            "PING example.com (192.0.2.1): 64 data bytes",
            "64 bytes from 192.0.2.1: icmp_seq=0 ttl=54 time=12.3 ms",
            "1 packets transmitted, 1 packets received, 0.0% packet loss",
          ].join("\n"),
        ),
      ).toEqual({ sent: 1, received: 1, loss: 0, ttl: 54, time: 12.3 });

      expect(
        parseICMPOutput(
          [
            "Packets: Sent = 4, Received = 3, Lost = 1 (25% loss)",
            "Minimum = 10ms, Maximum = 20ms, Average = 14ms",
          ].join("\n"),
        ),
      ).toEqual({ sent: 4, received: 3, loss: 1, time: 14 });
    });
  });

  describe("icmp driver", () => {
    serialTest("spawns the configured binary safely and parses success", async () => {
      const running = pingOnceICMP(
        "example.com",
        { sequence: 2, timeout: 1000, size: 64 },
        "ping",
        "linux",
      );
      child.stdout.emit("data", "ttl=54 time=7.5 ms");
      child.emit("close", 0, null);

      const result = await running;

      expect(spawnMock).toHaveBeenCalledWith(
        "ping",
        ["-c", "1", "-W", "1", "-s", "64", "example.com"],
        expect.objectContaining({ shell: false, windowsHide: true }),
      );
      expect(result).toMatchObject({
        alive: true,
        kind: "icmp",
        method: "native-ping",
        ttl: 54,
        time: 7.5,
        sent: 1,
        received: 1,
        loss: 0,
        metadata: {
          binaryPath: "ping",
          driverFailure: false,
        },
      });
    });

    serialTest("reports native packet loss as target-down, not driver failure", async () => {
      const running = icmpDriver().ping("192.0.2.254", { timeout: 1000 });
      child.stdout.emit("data", "1 packets transmitted, 0 received, 100% packet loss");
      child.emit("close", 1, null);

      const [result] = await running;

      expect(result.alive).toBe(false);
      expect(result.error).toMatchObject({ code: "EXIT_1", category: "command" });
      expect(result.metadata?.driverFailure).toBe(false);
      const commandArguments = result.metadata?.commandArguments as string[];
      expect(commandArguments.at(-1)).toBe("192.0.2.254");
    });

    serialTest("marks spawn errors as driver failures", async () => {
      const running = pingOnceICMP(
        "example.com",
        { sequence: 1, timeout: 1000, size: 64 },
        "missing-ping",
        "linux",
      );
      child.emit(
        "error",
        Object.assign(new Error("spawn missing-ping ENOENT"), { code: "ENOENT" }),
      );
      child.emit("close", null, null);

      const result = await running;
      expect(result).toMatchObject({
        alive: false,
        error: { code: "ENOENT", category: "configuration", phase: "command" },
        metadata: { driverFailure: true },
      });
    });

    serialTest("kills the process and clears its timeout", async () => {
      const running = pingOnceICMP(
        "example.com",
        { sequence: 1, timeout: 1, size: 64 },
        "ping",
        "linux",
      );
      const result = await running;
      expect(child.kill).toHaveBeenCalled();
      expect(result.alive).toBe(false);
      expect(result.error).toMatchObject({ code: "UNPING_TIMEOUT", category: "timeout" });
      expect(result.loss).toBe(1);
    });

    serialTest("allows platform and global binary paths to be configured", () => {
      expect(icmpDriver().options).toEqual({});
      expect(icmpDriver({ binaryPath: "/usr/local/bin/ping" }).options?.binaryPath).toBe(
        "/usr/local/bin/ping",
      );
      expect(
        icmpDriver({ platformBinaryPaths: { linux: "/opt/ping" } }).options?.platformBinaryPaths
          ?.linux,
      ).toBe("/opt/ping");
    });
  });
});

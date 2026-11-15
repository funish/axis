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

class MockSocket extends EventEmitter {
  timeoutCallback?: () => void;
  destroy = vi.fn();
  connect = vi.fn();

  setTimeout(timeout: number, callback: () => void): this {
    expect(timeout).toBe(1000);
    this.timeoutCallback = callback;
    return this;
  }
}

let socket: MockSocket;
const sockets: MockSocket[] = [];
const socketConstructor = vi.fn(function MockSocketConstructor() {
  socket = new MockSocket();
  sockets.push(socket);
  return socket;
});

vi.mock("node:net", () => ({
  Socket: socketConstructor,
}));

const { default: tcpDriver, pingOnceTCP } = await import("../src/drivers/tcp");

beforeEach(() => {
  sockets.length = 0;
  socket = new MockSocket();
  sockets.push(socket);
  socketConstructor.mockClear().mockImplementation(function MockSocketConstructor() {
    socket = new MockSocket();
    sockets.push(socket);
    return socket;
  });
});

describe("TCP driver", () => {
  describe("tcp driver", () => {
    serialTest("reports successful connect timing and metadata", async () => {
      const running = pingOnceTCP("example.com", 443, 1000, 2);
      socket.emit("connect");
      const result = await running;

      expect(socket.connect).toHaveBeenCalledWith(443, "example.com");
      expect(socket.destroy).toHaveBeenCalled();
      expect(result).toMatchObject({
        host: "example.com",
        alive: true,
        sequence: 2,
        kind: "tcp",
        method: "tcp",
        metadata: { port: 443 },
      });
      expect(result.metadata?.connectTime).toBeGreaterThanOrEqual(0);
    });

    serialTest("normalizes connection errors", async () => {
      const running = pingOnceTCP("example.com", 80, 1000, 1);
      socket.emit(
        "error",
        Object.assign(new Error("Connection refused"), { code: "ECONNREFUSED" }),
      );

      const result = await running;
      expect(result).toMatchObject({
        alive: false,
        error: {
          code: "ECONNREFUSED",
          category: "network",
          phase: "connect",
        },
        metadata: { port: 80 },
      });
      expect(socket.destroy).toHaveBeenCalled();
    });

    serialTest("uses the socket timeout and destroys it", async () => {
      const running = pingOnceTCP("example.com", 80, 1000, 1);
      socket.timeoutCallback?.();

      const result = await running;
      expect(result).toMatchObject({
        alive: false,
        time: 1000,
        error: { code: "UNPING_TIMEOUT", category: "timeout", phase: "connect" },
      });
      expect(socket.destroy).toHaveBeenCalled();
    });

    serialTest("returns a normalized driver result", async () => {
      const driver = tcpDriver({ port: 443 });
      const running = driver.ping("example.com", { count: 1, timeout: 1000 });
      socket.emit("connect");
      const [result] = await running;
      expect(result).toMatchObject({
        host: "example.com",
        alive: true,
        sequence: 1,
        timestamp: expect.any(Number),
        metadata: { port: 443 },
      });
    });
  });
});

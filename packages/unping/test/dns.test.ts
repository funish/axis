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

const resolverConstructor = vi.fn(function MockResolverConstructor() {
  return resolver;
});

const resolver = {
  resolve: vi.fn(),
  setServers: vi.fn(),
};

vi.mock("node:dns", () => ({
  promises: {
    Resolver: resolverConstructor,
  },
}));

const { default: dnsDriver } = await import("../src/drivers/dns");

beforeEach(() => {
  resolver.resolve.mockReset();
  resolver.setServers.mockClear();
});

describe("DNS driver", () => {
  describe("dns driver", () => {
    serialTest("returns records and timing metadata", async () => {
      resolver.resolve.mockResolvedValue(["93.184.216.34"]);
      const driver = dnsDriver({ servers: ["192.0.2.53"] });

      const [result] = await driver.ping("example.com");

      expect(resolver.setServers).toHaveBeenCalledWith(["192.0.2.53"]);
      expect(result).toMatchObject({
        host: "example.com",
        alive: true,
        kind: "dns",
        method: "dns",
        sequence: 1,
        metadata: {
          records: ["93.184.216.34"],
          recordType: "A",
        },
      });
    });

    serialTest("preserves DNS failure codes", async () => {
      resolver.resolve.mockRejectedValue(
        Object.assign(new Error("getaddrinfo failed"), { code: "ENOTFOUND" }),
      );

      const [result] = await dnsDriver().ping("missing.example");

      expect(result.alive).toBe(false);
      expect(result.error).toMatchObject({
        code: "ENOTFOUND",
        category: "dns",
        phase: "dns",
      });
      expect(result.metadata?.recordType).toBe("A");
    });

    serialTest("clears the timeout and reports a DNS timeout", async () => {
      resolver.resolve.mockReturnValue(new Promise(() => {}));
      const [result] = await dnsDriver().ping("slow.example", { timeout: 1 });
      expect(result.alive).toBe(false);
      expect(result.error).toMatchObject({ code: "UNPING_TIMEOUT", category: "timeout" });
    });
  });
});

import { afterEach, describe, expect, test, vi } from "vite-plus/test";

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

import { default as webDriver, pingOnceWeb } from "../src/drivers/web";

const fetchMock = vi.fn();

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("Web driver", () => {
  describe("web driver", () => {
    serialTest("builds an HTTPS URL and preserves response status", async () => {
      vi.stubGlobal("fetch", fetchMock);
      fetchMock.mockResolvedValue(new Response("", { status: 404, statusText: "Not Found" }));

      const driver = webDriver({
        https: true,
        port: 8443,
        path: "/health",
        headers: { "x-test": "yes" },
      });
      const [result] = await driver.ping("example.com");

      expect(fetchMock).toHaveBeenCalledWith(
        "https://example.com:8443/health",
        expect.objectContaining({ method: "HEAD", headers: { "x-test": "yes" } }),
      );
      expect(result).toMatchObject({
        host: "example.com",
        alive: false,
        statusCode: 404,
        kind: "web",
        method: "HEAD",
        sent: 1,
        received: 1,
        error: {
          code: "HTTP_404",
          category: "http",
          phase: "request",
        },
      });
      expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(false);
    });

    serialTest("allows application status classification to be configured", async () => {
      vi.stubGlobal("fetch", fetchMock);
      fetchMock.mockResolvedValue(new Response("", { status: 503 }));

      const driver = webDriver({ isSuccess: (statusCode) => statusCode === 503 });
      const [result] = await driver.ping("example.com");

      expect(result.alive).toBe(true);
      expect(result.statusCode).toBe(503);
      expect(result.error).toBeUndefined();
    });

    serialTest("adds successStatuses without replacing the default predicate", async () => {
      vi.stubGlobal("fetch", fetchMock);
      fetchMock.mockResolvedValue(new Response("", { status: 418 }));

      const [result] = await webDriver({ successStatuses: [418] }).ping("example.com");

      expect(result.alive).toBe(true);
    });

    serialTest("normalizes DNS failures differently from TLS failures", async () => {
      vi.stubGlobal("fetch", fetchMock);
      fetchMock.mockRejectedValueOnce(
        Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } }),
      );
      const dnsResult = await pingOnceWeb(
        "missing.example",
        "https",
        443,
        "/",
        "HEAD",
        1000,
        {},
        1,
      );

      fetchMock.mockRejectedValueOnce(
        Object.assign(new TypeError("fetch failed"), { cause: { code: "CERT_HAS_EXPIRED" } }),
      );
      const tlsResult = await pingOnceWeb(
        "badcert.example",
        "https",
        443,
        "/",
        "HEAD",
        1000,
        {},
        1,
      );

      expect(dnsResult.error).toMatchObject({
        code: "ENOTFOUND",
        category: "dns",
        phase: "request",
      });
      expect(tlsResult.error).toMatchObject({
        code: "CERT_HAS_EXPIRED",
        category: "certificate",
        phase: "request",
      });
      expect(dnsResult.received).toBe(0);
      expect(tlsResult.received).toBe(0);
    });

    serialTest("clears the HTTP timeout and reports it separately", async () => {
      vi.stubGlobal("fetch", fetchMock);
      fetchMock.mockImplementation(
        (url, init) =>
          new Promise<Response>((_, reject) => {
            init.signal.addEventListener("abort", () => {
              reject(new DOMException("The operation was aborted.", "AbortError"));
            });
          }),
      );
      const [result] = await webDriver().ping("example.com", { timeout: 10 });
      expect(result.error).toMatchObject({
        code: "UNPING_TIMEOUT",
        category: "timeout",
        phase: "timeout",
      });
    });
  });
});

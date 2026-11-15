import { EventEmitter } from "node:events";
import type { TLSSocket } from "node:tls";

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

class MockTLSSocket extends EventEmitter {
  destroy = vi.fn();
  getPeerCertificate = vi.fn(() => ({
    subject: { CN: "example.com" },
    issuer: { O: "Test CA" },
    valid_from: "2026-01-01T00:00:00Z",
    valid_to: "2027-01-01T00:00:00Z",
    fingerprint256: "fixture-fingerprint",
    serialNumber: "fixture-serial",
  }));
  connectOptions?: Record<string, unknown>;
}

let socket: MockTLSSocket;
const connectMock = vi.fn((options: Record<string, unknown>) => {
  socket.connectOptions = options;
  return socket as unknown as TLSSocket;
});

vi.mock("node:tls", () => ({
  connect: connectMock,
}));

const { default: tlsDriver, pingOnceTLS } = await import("../src/drivers/tls");

beforeEach(() => {
  socket = new MockTLSSocket();
  connectMock.mockClear().mockImplementation((options: Record<string, unknown>) => {
    socket.connectOptions = options;
    return socket as unknown as TLSSocket;
  });
});

describe("TLS driver", () => {
  describe("tls driver", () => {
    serialTest("reports TCP and TLS handshake timing with certificate metadata", async () => {
      const running = pingOnceTLS(
        "example.com",
        { sequence: 1, timeout: 1000 },
        {
          port: 443,
          servername: "example.com",
          rejectUnauthorized: true,
        },
      );

      socket.emit("lookup");
      socket.emit("connect");
      socket.emit("secureConnect");
      const result = await running;

      expect(connectMock).toHaveBeenCalledWith(
        expect.objectContaining({
          host: "example.com",
          port: 443,
          servername: "example.com",
          rejectUnauthorized: true,
        }),
      );
      expect(result).toMatchObject({
        alive: true,
        kind: "tls",
        method: "tls",
        metadata: {
          tcpConnectTime: expect.any(Number),
          tlsHandshakeTime: expect.any(Number),
          certificate: {
            fingerprint256: "fixture-fingerprint",
            serialNumber: "fixture-serial",
          },
        },
      });
      expect(result.metadata?.dnsLookupTime).toBeGreaterThanOrEqual(0);
      expect(result.metadata?.tlsHandshakeTime).toBeGreaterThanOrEqual(0);
      expect(socket.destroy).toHaveBeenCalled();
    });

    serialTest("preserves certificate metadata and normalized TLS error", async () => {
      const running = pingOnceTLS(
        "badcert.example",
        { sequence: 1, timeout: 1000 },
        {
          port: 443,
          servername: "badcert.example",
          rejectUnauthorized: true,
        },
      );

      socket.emit("lookup");
      socket.emit("connect");
      socket.emit(
        "error",
        Object.assign(new Error("certificate expired"), { code: "CERT_HAS_EXPIRED" }),
      );
      const result = await running;

      expect(result.alive).toBe(false);
      expect(result.error).toMatchObject({
        code: "CERT_HAS_EXPIRED",
        category: "certificate",
        phase: "handshake",
      });
      expect(result.metadata?.certificate).toMatchObject({ subject: { CN: "example.com" } });
      expect(socket.destroy).toHaveBeenCalled();
    });

    serialTest(
      "stops at the overall timeout and distinguishes connect from handshake phase",
      async () => {
        vi.useFakeTimers();
        const connectRunning = pingOnceTLS(
          "slowconnect.example",
          { sequence: 1, timeout: 500 },
          {
            port: 443,
            servername: "slowconnect.example",
            rejectUnauthorized: true,
          },
        );
        await vi.advanceTimersByTimeAsync(500);
        const connectResult = await connectRunning;
        expect(connectResult.error?.phase).toBe("connect");

        socket = new MockTLSSocket();
        connectMock.mockImplementation((options: Record<string, unknown>) => {
          socket.connectOptions = options;
          return socket as unknown as TLSSocket;
        });
        const handshakeRunning = pingOnceTLS(
          "slowhandshake.example",
          { sequence: 1, timeout: 500 },
          {
            port: 443,
            servername: "slowhandshake.example",
            rejectUnauthorized: true,
          },
        );
        socket.emit("connect");
        await vi.advanceTimersByTimeAsync(500);
        const handshakeResult = await handshakeRunning;
        expect(handshakeResult.error?.phase).toBe("handshake");

        vi.useRealTimers();
      },
    );

    serialTest("omits SNI for an IP-literal target unless explicitly configured", async () => {
      const driver = tlsDriver();
      const running = driver.ping("192.0.2.10");
      socket.emit("secureConnect");
      await running;

      const options = connectMock.mock.lastCall?.[0] as Record<string, unknown>;
      expect("servername" in options).toBe(false);
    });

    serialTest("removes cyclic issuer certificates from probe metadata", async () => {
      const certificate: Record<string, unknown> = {
        subject: { CN: "example.com" },
        issuer: { O: "Test CA" },
        serialNumber: "fixture-serial",
      };
      const issuer: Record<string, unknown> = { O: "Root CA", issuerCertificate: certificate };
      certificate.issuerCertificate = issuer;
      socket.getPeerCertificate = vi.fn(
        () => certificate,
      ) as unknown as typeof socket.getPeerCertificate;

      const running = pingOnceTLS(
        "example.com",
        { sequence: 1, timeout: 1000 },
        { port: 443, servername: "example.com", rejectUnauthorized: true },
      );
      socket.emit("secureConnect");
      const result = await running;

      expect(() => JSON.stringify(result)).not.toThrow();
      expect(result.metadata?.certificate).toEqual({
        subject: { CN: "example.com" },
        issuer: { O: "Test CA" },
        serialNumber: "fixture-serial",
      });
    });
    serialTest("supports driver connection defaults", async () => {
      const driver = tlsDriver({ port: 8443, rejectUnauthorized: false });
      expect(driver.options).toEqual({ port: 8443, rejectUnauthorized: false });

      const running = driver.ping("example.com");
      socket.emit("secureConnect");
      await running;

      expect(connectMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          port: 8443,
          servername: "example.com",
          rejectUnauthorized: false,
        }),
      );
    });
  });
});

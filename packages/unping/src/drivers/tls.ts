import { isIP } from "node:net";
import { connect } from "node:tls";

import { classifyError, timeoutError } from "../errors";
import type { ProbeContext } from "../probe";
import { runProbeSeries } from "../probe";
import type { PingDriver, PingOptions, PingResult } from "../types";

export interface TLSDriverOptions {
  /** TLS port (default: 443) */
  port?: number;
  /** Overrides the TLS server name (default: target host) */
  servername?: string;
  /** Passed to Node's tls.connect (default: true) */
  rejectUnauthorized?: boolean;
  /** Legacy alias for timeout; request timeout takes precedence */
  connectTimeout?: number;
  /** Extra certificate authority certificates */
  ca?: string | string[];
}

function plainCertificateValue(value: unknown, depth = 0): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (depth >= 4) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.map((item) => plainCertificateValue(item, depth + 1));
  }
  if (typeof value !== "object") {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "issuerCertificate")
      .map(([key, item]) => [key, plainCertificateValue(item, depth + 1)]),
  );
}

function safeCertificate(socket: {
  getPeerCertificate?: () => unknown;
}): Record<string, unknown> | undefined {
  try {
    const certificate = socket.getPeerCertificate?.();
    if (!certificate || typeof certificate !== "object") {
      return undefined;
    }
    return plainCertificateValue(certificate) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

// Exported for reuse and test fixtures.
export async function pingOnceTLS(
  host: string,
  context: ProbeContext,
  options: Required<Pick<TLSDriverOptions, "port" | "rejectUnauthorized">> &
    Pick<TLSDriverOptions, "servername" | "ca">,
): Promise<PingResult> {
  return new Promise((resolve) => {
    const socket = connect({
      host,
      port: options.port,
      ...(options.servername !== undefined && { servername: options.servername }),
      rejectUnauthorized: options.rejectUnauthorized,
      ca: options.ca,
    });

    const startTime = Date.now();
    let settled = false;
    let dnsTime: number | undefined;
    let tcpTime: number | undefined;
    let handshakeTime: number | undefined;
    let timer: NodeJS.Timeout | undefined;

    const finish = (result: PingResult) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(result);
    };

    timer = setTimeout(() => {
      finish({
        host,
        alive: false,
        time: Math.max(context.timeout, Date.now() - startTime),
        sequence: context.sequence,
        kind: "tls",
        method: "tls",
        error: timeoutError(tcpTime === undefined ? "connect" : "handshake", context.timeout),
        metadata: {
          port: options.port,
          servername: options.servername,
          tcpConnectTime: tcpTime,
          dnsLookupTime: dnsTime,
        },
      });
    }, context.timeout);
    timer.unref?.();

    socket.once("lookup", () => {
      dnsTime = Date.now() - startTime;
    });
    socket.once("connect", () => {
      tcpTime = Date.now() - startTime;
    });

    socket.once("secureConnect", () => {
      const now = Date.now();
      handshakeTime = tcpTime === undefined ? now - startTime : now - startTime - tcpTime;

      finish({
        host,
        alive: true,
        time: now - startTime,
        sequence: context.sequence,
        kind: "tls",
        method: "tls",
        metadata: {
          port: options.port,
          servername: options.servername,
          tcpConnectTime: tcpTime,
          dnsLookupTime: dnsTime,
          tlsHandshakeTime: handshakeTime,
          certificate: safeCertificate(socket),
        },
      });
    });

    socket.once("error", (error: Error) => {
      finish({
        host,
        alive: false,
        time: Date.now() - startTime,
        sequence: context.sequence,
        kind: "tls",
        method: "tls",
        error: classifyError(error, tcpTime === undefined ? "connect" : "handshake"),
        metadata: {
          port: options.port,
          servername: options.servername,
          tcpConnectTime: tcpTime,
          dnsLookupTime: dnsTime,
          tlsHandshakeTime: handshakeTime,
          certificate: safeCertificate(socket),
        },
      });
    });
  });
}

export default function tlsDriver(options: TLSDriverOptions = {}): PingDriver<TLSDriverOptions> {
  const { port = 443, servername, rejectUnauthorized = true, connectTimeout = 5000 } = options;

  return {
    name: "tls",
    options,
    ping: (host: string, pingOptions?: PingOptions): Promise<PingResult[]> =>
      runProbeSeries(
        host,
        pingOptions ?? {},
        (target, context) =>
          pingOnceTLS(target, context, {
            port,
            servername: servername ?? (isIP(target) === 0 ? target : undefined),
            rejectUnauthorized,
            ca: options.ca,
          }),
        { timeout: connectTimeout },
      ),
  };
}

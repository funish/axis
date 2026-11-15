import { promises as dnsPromises } from "node:dns";

import { classifyError, timeoutError } from "../errors";
import { runProbeSeries } from "../probe";
import type { PingDriver, PingOptions, PingResult, ProbeErrorInfo } from "../types";

export interface DNSDriverOptions {
  /** DNS record type (default: A) */
  type?: "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "NS";
  /** DNS servers to query instead of the operating-system resolver */
  servers?: string[];
}

async function resolveWithTimeout(
  resolver: dnsPromises.Resolver,
  host: string,
  type: string,
  timeout: number,
): Promise<unknown> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      resolver.resolve(host, type),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("DNS lookup timeout")), timeout);
        timer.unref?.();
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function dnsError(error: unknown, timeout: number): ProbeErrorInfo {
  if (error instanceof Error && error.message === "DNS lookup timeout") {
    return timeoutError("dns", timeout);
  }
  return classifyError(error, "dns");
}

// Exported for reuse and parser-level testing.
export async function pingOnceDNS(
  resolver: dnsPromises.Resolver,
  host: string,
  type: string,
  timeout: number,
  sequence: number,
): Promise<PingResult> {
  const startTime = Date.now();

  try {
    const records = await resolveWithTimeout(resolver, host, type, timeout);

    return {
      host,
      alive: true,
      time: Date.now() - startTime,
      sequence,
      kind: "dns",
      method: "dns",
      metadata: {
        records,
        recordType: type,
      },
    };
  } catch (error) {
    return {
      host,
      alive: false,
      time: Date.now() - startTime,
      sequence,
      kind: "dns",
      method: "dns",
      error: dnsError(error, timeout),
      metadata: {
        recordType: type,
      },
    };
  }
}

export default function dnsDriver(options: DNSDriverOptions = {}): PingDriver<DNSDriverOptions> {
  const { type = "A", servers } = options;
  const resolver = new dnsPromises.Resolver();
  if (servers) {
    resolver.setServers(servers);
  }

  return {
    name: "dns",
    options,
    ping: (host: string, pingOptions?: PingOptions): Promise<PingResult[]> =>
      runProbeSeries(host, pingOptions ?? {}, (target, context) =>
        pingOnceDNS(resolver, target, type, context.timeout, context.sequence),
      ),
  };
}

import { promises as dnsPromises } from "dns";
import type { Driver, DriverOptions, PingResult, PingOptions } from "../types";

export interface DNSDriverOptions extends DriverOptions {
  /** DNS record type (default: A) */
  type?: "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "NS";
  /** DNS servers */
  servers?: string[];
}

// Export pingOnce for reuse
export async function pingOnceDNS(
  resolver: dnsPromises.Resolver,
  host: string,
  type: string,
  timeout: number,
  sequence: number,
): Promise<PingResult> {
  const startTime = Date.now();

  try {
    // Set timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("DNS lookup timeout")), timeout);
    });

    // Resolve with timeout
    await Promise.race([resolver.resolve(host, type), timeoutPromise]);

    return {
      host,
      alive: true,
      time: Date.now() - startTime,
      sequence,
    };
  } catch {
    return {
      host,
      alive: false,
      time: Date.now() - startTime,
      sequence,
    };
  }
}

export default function dnsDriver(options: DNSDriverOptions = {}): Driver {
  const { type = "A", servers } = options;

  // Create resolver
  const resolver = new dnsPromises.Resolver();
  if (servers) {
    resolver.setServers(servers);
  }

  const ping = async (
    host: string,
    opts?: PingOptions,
  ): Promise<PingResult[]> => {
    const count = opts?.count || 1;
    const timeout = opts?.timeout || 5000;
    const results: PingResult[] = [];

    for (let i = 0; i < count; i++) {
      const result = await pingOnceDNS(resolver, host, type, timeout, i + 1);
      results.push(result);

      // Add interval if count > 1
      if (i < count - 1 && opts?.interval) {
        await new Promise((resolve) => setTimeout(resolve, opts.interval));
      }
    }

    return results;
  };

  return {
    name: "dns",
    options,
    ping,
  };
}

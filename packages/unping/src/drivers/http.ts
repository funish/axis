import { ofetch } from "ofetch";
import type { Driver, DriverOptions, PingResult, PingOptions } from "../types";

export interface HTTPDriverOptions extends DriverOptions {
  /** Request method (default: HEAD) */
  method?: "HEAD" | "GET";
  /** Custom port (default: 80/443) */
  port?: number;
  /** Use HTTPS (default: auto detect) */
  https?: boolean;
  /** Request path (default: "/") */
  path?: string;
  /** Custom headers */
  headers?: Record<string, string>;
}

// Export pingOnce for reuse
export async function pingOnceHTTP(
  host: string,
  protocol: string,
  port: number,
  path: string,
  method: string,
  timeout: number,
  headers: Record<string, string>,
  sequence: number,
): Promise<PingResult> {
  const startTime = Date.now();

  try {
    const url = `${protocol}://${host}:${port}${path}`;

    await ofetch(url, {
      method,
      headers,
      timeout,
    });

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

export default function httpDriver(options: HTTPDriverOptions = {}): Driver {
  const { method = "HEAD", path = "/", headers = {} } = options;

  const ping = async (
    host: string,
    opts?: PingOptions,
  ): Promise<PingResult[]> => {
    const count = opts?.count || 1;
    const timeout = opts?.timeout || 5000;
    const results: PingResult[] = [];

    // Determine protocol
    const protocol = (options.https ?? options.port === 443) ? "https" : "http";
    const port = options.port || (protocol === "https" ? 443 : 80);

    for (let i = 0; i < count; i++) {
      const result = await pingOnceHTTP(
        host,
        protocol,
        port,
        path,
        method,
        timeout,
        headers,
        i + 1,
      );
      results.push(result);

      // Add interval if count > 1
      if (i < count - 1 && opts?.interval) {
        await new Promise((resolve) => setTimeout(resolve, opts.interval));
      }
    }

    return results;
  };

  return {
    name: "http",
    options,
    ping,
  };
}

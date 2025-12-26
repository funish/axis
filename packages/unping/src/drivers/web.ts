import { ofetch } from "ofetch";
import type { Driver, DriverOptions, PingResult, PingOptions } from "../types";

/**
 * Web Driver Options
 * Supports both HTTP and HTTPS protocols for host reachability detection
 */
export interface WebDriverOptions extends DriverOptions {
  /** Request method (default: HEAD) */
  method?: "HEAD" | "GET";
  /** Custom port (default: 80/443) */
  port?: number;
  /** Force use HTTPS (default: auto-detect based on port, 443→true, 80→false) */
  https?: boolean;
  /** Request path (default: "/") */
  path?: string;
  /** Custom headers */
  headers?: Record<string, string>;
}

// Export pingOnce for reuse
export async function pingOnceWeb(
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

/**
 * Creates a Web Driver that supports both HTTP and HTTPS protocols
 *
 * @example
 * // Auto-detect protocol based on port
 * webDriver()              // HTTP:80
 * webDriver({ port: 443 }) // HTTPS:443
 *
 * @example
 * // Explicit protocol control
 * webDriver({ https: true })        // HTTPS:443
 * webDriver({ https: true, port: 8443 })  // HTTPS:8443
 * webDriver({ https: false })       // HTTP:80
 *
 * @example
 * // Custom request options
 * webDriver({
 *   method: "GET",
 *   path: "/health",
 *   headers: { "User-Agent": "Custom-Pinger" }
 * })
 */
export default function webDriver(options: WebDriverOptions = {}): Driver {
  const { method = "HEAD", path = "/", headers = {} } = options;

  const ping = async (
    host: string,
    opts?: PingOptions,
  ): Promise<PingResult[]> => {
    const count = opts?.count || 1;
    const timeout = opts?.timeout || 5000;
    const results: PingResult[] = [];

    // Determine protocol: explicit https option takes priority over port-based detection
    const protocol = (options.https ?? options.port === 443) ? "https" : "http";
    const port = options.port || (protocol === "https" ? 443 : 80);

    for (let i = 0; i < count; i++) {
      const result = await pingOnceWeb(
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
    name: "web",
    options,
    ping,
  };
}

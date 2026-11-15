import { classifyError } from "../errors";
import { runProbeSeries } from "../probe";
import type { DriverOptions, PingDriver, PingOptions, PingResult, ProbeErrorInfo } from "../types";

export interface WebDriverOptions extends DriverOptions {
  /** Request method (default: HEAD) */
  method?: "HEAD" | "GET";
  /** Target port (default: 80, or 443 for HTTPS) */
  port?: number;
  /** Force HTTPS instead of deriving it from the port */
  https?: boolean;
  /** Request path (default: "/") */
  path?: string;
  /** Request headers */
  headers?: Record<string, string>;
  /** Statuses treated as success in addition to the default predicate */
  successStatuses?: number[];
  /** Fully replaces the default status predicate */
  isSuccess?: (statusCode: number) => boolean;
}

const DEFAULT_SUCCESS = (statusCode: number) => statusCode >= 200 && statusCode < 400;

function formatUrlHost(host: string): string {
  return host.includes(":") ? `[${host}]` : host;
}

function asErrorInfo(error: unknown, phase: ProbeErrorInfo["phase"]): ProbeErrorInfo {
  const info = classifyError(error, phase);
  if (info.code === "UNPING_TIMEOUT") {
    return { ...info, phase: "timeout" };
  }
  return info;
}

// Exported for reuse and test fixtures.
export async function pingOnceWeb(
  host: string,
  protocol: "http" | "https",
  port: number,
  path: string,
  method: "HEAD" | "GET",
  timeout: number,
  headers: Record<string, string>,
  sequence: number,
  isSuccess: (statusCode: number) => boolean = DEFAULT_SUCCESS,
): Promise<PingResult> {
  const controller = new AbortController();
  const startTime = Date.now();
  let timer: NodeJS.Timeout | undefined;

  const base: Pick<PingResult, "host" | "sequence" | "kind" | "method"> = {
    host,
    sequence,
    kind: "web",
    method,
  };
  const url = `${protocol}://${formatUrlHost(host)}:${port}${path}`;

  try {
    timer = setTimeout(() => controller.abort(), timeout);
    timer.unref?.();
    const response = await fetch(url, {
      method,
      headers,
      redirect: "follow",
      signal: controller.signal,
    });
    if (response.body) void response.body.cancel().catch(() => undefined);

    return {
      ...base,
      alive: isSuccess(response.status),
      time: Date.now() - startTime,
      statusCode: response.status,
      sent: 1,
      received: 1,
      error: isSuccess(response.status)
        ? undefined
        : {
            code: `HTTP_${response.status}`,
            message: response.statusText || `HTTP status ${response.status}`,
            category: "http",
            phase: "request",
          },
      metadata: {
        url,
        redirected: response.redirected,
        port,
      },
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    const errorInfo = aborted
      ? {
          code: "UNPING_TIMEOUT",
          message: `HTTP request timed out after ${timeout}ms`,
          category: "timeout" as const,
          phase: "timeout" as const,
        }
      : asErrorInfo(error, "request");

    return {
      ...base,
      alive: false,
      time: Date.now() - startTime,
      sent: 1,
      received: 0,
      loss: 1,
      error: errorInfo,
      metadata: {
        url,
        port,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Creates a Web driver backed by the global fetch implementation. A response
 * status is always preserved; DNS, TCP, TLS, and HTTP failures include
 * normalized metadata instead of collapsing into a bare false result.
 */
export default function webDriver(options: WebDriverOptions = {}): PingDriver<WebDriverOptions> {
  const {
    method = "HEAD",
    path = "/",
    headers = {},
    successStatuses,
    isSuccess: customIsSuccess,
  } = options;
  const protocol = (options.https ?? options.port === 443) ? "https" : "http";
  const port = options.port ?? (protocol === "https" ? 443 : 80);
  const isSuccess =
    customIsSuccess ??
    ((statusCode: number) =>
      DEFAULT_SUCCESS(statusCode) || successStatuses?.includes(statusCode) === true);

  return {
    name: "web",
    options,
    ping: (host: string, pingOptions?: PingOptions): Promise<PingResult[]> =>
      runProbeSeries(host, pingOptions ?? {}, (target, context) =>
        pingOnceWeb(
          target,
          protocol,
          port,
          path,
          method,
          context.timeout,
          headers,
          context.sequence,
          isSuccess,
        ),
      ),
  };
}

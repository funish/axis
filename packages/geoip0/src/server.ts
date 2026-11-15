/**
 * GeoIP Server
 * Simple GeoIP server implementation using h3
 * Provides HTTP endpoints for geolocation queries
 */

import {
  defineHandler,
  EventHandlerRequest,
  EventHandlerWithFetch,
  H3,
  HTTPError,
  serve,
} from "h3";
import { isValidIP } from "ipdo";

import packageJson from "../package.json";
import { isGeoIPProviderError } from "./errors";
import { createGeoIPManager } from "./geo";
import type { BatchQueryOptions, GeoLocation, QueryOptions, Driver } from "./types";

export type GeoIPServerRequest = {
  request: globalThis.Request;
  ip: string;
  path: string;
};

export type TrustedProxyConfig = boolean | string[] | ((remoteAddress: string) => boolean);

export interface GeoIPCORSOptions {
  /** Omit to use "*" only when no other CORS behavior is customized. */
  origin?: string | string[] | false;
  allowHeaders?: string[];
  allowMethods?: string[];
  credentials?: boolean;
  maxAge?: number;
}

export interface GeoIPServerOptions {
  /**
   * GeoIP driver to use for queries
   */
  driver?: Driver;

  /**
   * Authorization function for requests
   */
  authorize?: (request: GeoIPServerRequest) => void | Promise<void>;

  /**
   * Controls whether forwarding headers may determine the client IP. Defaults
   * to false; direct socket addresses are then always used.
   */
  trustProxy?: TrustedProxyConfig;

  /**
   * Maximum decoded request body accepted by POST /batch.
   */
  maxBodyBytes?: number;

  /**
   * Maximum number of IP addresses accepted by POST /batch.
   */
  maxIps?: number;

  /**
   * Bounds passed to the driver for server-initiated batch requests.
   */
  batchOptions?: BatchQueryOptions;

  /**
   * CORS behavior. By default only GET/HEAD/POST methods are allowed and the
   * origin is "*"; setting allowHeaders without an origin does not force a
   * wildcard origin.
   */
  cors?: boolean | GeoIPCORSOptions;
}

export type FetchHandler = (
  req: globalThis.Request,
) => globalThis.Response | Promise<globalThis.Response>;

export const geoIPVersion = packageJson.version;

const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;
const DEFAULT_MAX_IPS = 100;

function isTrusted(remoteAddress: string, trustProxy: TrustedProxyConfig): boolean {
  if (typeof trustProxy === "function") {
    return trustProxy(remoteAddress);
  }
  if (typeof trustProxy === "boolean") {
    return trustProxy;
  }
  return trustProxy.includes(remoteAddress);
}

function isForwardedIP(value: string): boolean {
  return isValidIP(value);
}

/**
 * Resolve a client IP without trusting forwarding headers by default. When a
 * proxy chain is configured, return the rightmost address outside the trusted
 * proxy list.
 */
export function resolveClientIP(
  headers: Headers,
  remoteAddress: string | undefined,
  trustProxy: TrustedProxyConfig = false,
): string | null {
  const peer = remoteAddress?.trim();
  if (!peer) {
    return null;
  }

  if (!isTrusted(peer, trustProxy)) {
    return peer;
  }

  const forwarded =
    headers
      .get("x-forwarded-for")
      ?.split(",")
      .map((value) => value.trim()) ?? [];
  if (forwarded.length > 0) {
    if (trustProxy === true) {
      return forwarded.find(isForwardedIP) || peer;
    }

    const trusted = Array.isArray(trustProxy) ? trustProxy : null;
    for (let index = forwarded.length - 1; index >= 0; index--) {
      const candidate = forwarded[index]!;
      if (!isForwardedIP(candidate)) {
        continue;
      }
      if (trusted?.includes(candidate)) {
        continue;
      }
      return candidate;
    }
  }

  const realIP = headers.get("x-real-ip")?.trim();
  if (realIP && isForwardedIP(realIP)) {
    return realIP;
  }

  return peer;
}

export function resolveCORSHeaders(
  requestOrigin: string | null,
  options: boolean | GeoIPCORSOptions | undefined,
): Record<string, string> {
  if (options === false) {
    return {};
  }

  const cors = options === true || options === undefined ? {} : options;
  const hasCustomBehavior = Boolean(cors.allowHeaders?.length || cors.allowMethods?.length);
  let origin: string | undefined;

  if (cors.origin === false) {
    origin = undefined;
  } else if (typeof cors.origin === "string") {
    origin = cors.origin;
  } else if (Array.isArray(cors.origin)) {
    origin = requestOrigin && cors.origin.includes(requestOrigin) ? requestOrigin : undefined;
  } else if (cors.credentials) {
    // Wildcard credentials are unsafe and not accepted.
    origin = undefined;
  } else {
    origin = hasCustomBehavior ? undefined : "*";
  }

  const headers: Record<string, string> = {};
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    if (cors.credentials) {
      headers["Access-Control-Allow-Credentials"] = "true";
    }
  }

  headers["Access-Control-Allow-Methods"] = (
    cors.allowMethods?.length ? cors.allowMethods : ["GET", "HEAD", "POST"]
  ).join(", ");
  if (cors.allowHeaders?.length) {
    headers["Access-Control-Allow-Headers"] = cors.allowHeaders.join(", ");
  }
  if (cors.maxAge !== undefined) {
    headers["Access-Control-Max-Age"] = cors.maxAge.toString();
  }

  return headers;
}

/**
 * This function creates a fetch handler for your custom GeoIP server.
 *
 * The GeoIP server will handle GET, POST and HEAD requests:
 * - HEAD: Return metadata about the service
 * - GET: Return geolocation data for IP addresses
 * - POST: Return geolocation data for multiple IP addresses (batch)
 * - /current: Return geolocation data for the client's IP
 * - /{ip}: Return geolocation data for the specified IP address
 * - /batch: Return geolocation data for multiple IP addresses
 * - /help: Return server help information
 */
export function createGeoIPHandler(
  opts: GeoIPServerOptions = {},
): EventHandlerWithFetch<EventHandlerRequest, Promise<GeoLocation | string>> {
  const geoipManager = createGeoIPManager({
    driver: opts.driver || {
      name: "default",
      capabilities: { lookup: false, current: false, batchLookup: false },
    },
  });

  const maxBodyBytes = opts.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const maxIps = opts.maxIps ?? DEFAULT_MAX_IPS;

  const handler = defineHandler(async (event) => {
    const path = event.url.pathname;
    const corsHeaders = resolveCORSHeaders(event.req.headers.get("origin"), opts.cors);

    for (const [name, value] of Object.entries(corsHeaders)) {
      event.res.headers.set(name, value);
    }

    if (event.req.method === "OPTIONS") {
      event.res.status = 204;
      return "";
    }

    // Parse path to extract IP and options
    const { ip, error } = parseGeoIPPath(path);

    if (error) {
      throw new HTTPError({
        status: 400,
        statusText: error,
      });
    }

    // Resolve client IP using the direct peer unless proxy trust is configured.
    const runtime = event.runtime as
      | {
          node?: { req?: { socket?: { remoteAddress?: string } } };
        }
      | undefined;
    const clientIP =
      resolveClientIP(
        event.req.headers,
        runtime?.node?.req?.socket?.remoteAddress,
        opts.trustProxy,
      ) || "127.0.0.1";
    const queryIP = ip || clientIP;

    const request: GeoIPServerRequest = {
      request: event.req as Request,
      ip: queryIP,
      path,
    };

    try {
      await opts.authorize?.(request);
    } catch (caught) {
      throw HTTPError.isError(caught)
        ? caught
        : new HTTPError({
            status: 401,
            statusText: caught instanceof Error ? caught.message : "Unauthorized",
            cause: caught,
          });
    }

    event.res.headers.set("Content-Type", "application/json");

    if (path === "/help" || path === "/") {
      const help = {
        service: "GeoIP Server",
        version: geoIPVersion,
        endpoints: {
          "/": "Server information",
          "/help": "This help information",
          "/current": "Geolocation data for client IP",
          "/{ip}": "Geolocation data for specified IP address",
          "/batch": "Batch geolocation data for multiple IP addresses (POST)",
        },
        examples: [
          "GET /current - Get client IP geolocation",
          "GET /8.8.8.8 - Get geolocation for 8.8.8.8",
          "GET /2001:4860:4860::8888 - Get geolocation for IPv6 address",
          "POST /batch - Get geolocation for multiple IPs",
        ],
        batch_endpoint: {
          method: "POST",
          content_type: "application/json",
          max_ips: maxIps,
          max_body_bytes: maxBodyBytes,
          body: { ips: ["8.8.8.8", "1.1.1.1"] },
          response_note:
            "Results contain only successful lookups and may be fewer or ordered differently",
        },
        query_options: {
          version: "IP version preference: 'ipv4', 'ipv6', 'auto'",
        },
      };

      return JSON.stringify(help, null, 2);
    }

    const url = new URL(event.req.url || "");
    const queryOptions: QueryOptions = {};
    const version = url.searchParams.get("version");
    if (version === "ipv4" || version === "ipv6" || version === "auto") {
      queryOptions.version = version;
    }

    if (path === "/batch") {
      if (event.req.method !== "POST") {
        throw new HTTPError({
          status: 405,
          statusText: "Method not allowed. Use POST for batch requests",
        });
      }

      const contentLength = Number(event.req.headers.get("content-length"));
      if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
        throw new HTTPError({
          status: 413,
          statusText: "Request body too large",
        });
      }

      let body: unknown;
      try {
        const rawBody = await event.req.text();
        const byteLength = new TextEncoder().encode(rawBody).length;
        if (byteLength > maxBodyBytes) {
          throw new HTTPError({ status: 413, statusText: "Request body too large" });
        }
        const parsed: unknown = JSON.parse(rawBody);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          throw new Error("Request body must be an object");
        }
        body = parsed;
      } catch (caught) {
        if (HTTPError.isError(caught)) {
          throw caught;
        }
        throw new HTTPError({ status: 400, statusText: "Invalid JSON in request body" });
      }

      const ips = (body as { ips?: unknown }).ips;
      if (
        !Array.isArray(ips) ||
        ips.some((value) => typeof value !== "string" || value.trim() === "")
      ) {
        throw new HTTPError({
          status: 400,
          statusText: "Invalid request body: 'ips' must be a non-empty string array",
        });
      }

      if (ips.length > maxIps) {
        throw new HTTPError({
          status: 413,
          statusText: `Batch request exceeds ${maxIps} IPs`,
        });
      }

      try {
        const results = await geoipManager.batchLookup(ips as string[], {
          ...queryOptions,
          ...opts.batchOptions,
        });
        return JSON.stringify(results, null, 2);
      } catch (caught) {
        if (isGeoIPProviderError(caught)) {
          throw new HTTPError({
            status: 502,
            statusText: "Provider lookup failed",
            cause: caught,
          });
        }
        throw caught;
      }
    }

    try {
      const data =
        path === "/current"
          ? await geoipManager.current(queryOptions)
          : await geoipManager.lookup(queryIP, queryOptions);

      if (!data) {
        throw new HTTPError({
          status: 404,
          statusText: "Geolocation data not found",
        });
      }

      return JSON.stringify(data, null, 2);
    } catch (caught) {
      if (HTTPError.isError(caught)) {
        throw caught;
      }
      if (isGeoIPProviderError(caught)) {
        throw new HTTPError({
          status: 502,
          statusText: "Provider lookup failed",
          cause: caught,
        });
      }
      throw caught;
    }
  });

  return handler;
}

/**
 * Create GeoIP server with convenience wrapper
 */
export function createGeoIPServer(opts: GeoIPServerOptions = {}): {
  handler: EventHandlerWithFetch<EventHandlerRequest, Promise<GeoLocation | string>>;
  serve: (port?: number) => void;
} {
  const handler = createGeoIPHandler(opts);
  const app = new H3().use("/**", handler);

  return {
    handler,
    serve: (port = 3000) => serve(app, { port }),
  };
}

/**
 * Parse GeoIP path to extract IP address
 */
function parseGeoIPPath(path: string): {
  ip: string;
  error?: string;
} {
  let cleanPath = path.replace(/^\/+|\/+$/g, "");

  try {
    cleanPath = decodeURIComponent(cleanPath);
  } catch {
    return { ip: "", error: "Invalid URL encoding" };
  }

  if (
    cleanPath === "help" ||
    cleanPath === "" ||
    cleanPath === "current" ||
    cleanPath === "batch"
  ) {
    return { ip: "" };
  }

  if (isValidIP(cleanPath)) {
    return { ip: cleanPath };
  }

  return { ip: "", error: "Invalid IP address format" };
}

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
  serve,
} from "h3";
import { HTTPError } from "h3";
import { isValidIP } from "ipdo";
import type { GeoLocation, QueryOptions, Driver } from "./types";
import { createGeoIPManager } from "./geo";

export type GeoIPServerRequest = {
  request: globalThis.Request;
  ip: string;
  path: string;
};

export interface GeoIPServerOptions {
  /**
   * GeoIP driver to use for queries
   */
  driver?: Driver;

  /**
   * Authorization function for requests
   */
  authorize?: (request: GeoIPServerRequest) => void | Promise<void>;
}

export type FetchHandler = (
  req: globalThis.Request,
) => globalThis.Response | Promise<globalThis.Response>;

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
 *
 * @param options GeoIP server configuration options
 * @returns A fetch handler that can be used with h3 or other web frameworks
 */
export function createGeoIPHandler(
  opts: GeoIPServerOptions = {},
): EventHandlerWithFetch<EventHandlerRequest, Promise<GeoLocation | string>> {
  const geoipManager = createGeoIPManager({
    driver: opts.driver || { name: "default" },
  });

  const handler = defineHandler(async (event) => {
    const path = event.url.pathname;

    // Parse path to extract IP and options
    const { ip, error } = parseGeoIPPath(path);

    if (error) {
      throw new HTTPError({
        statusCode: 400,
        statusMessage: error,
      });
    }

    // Get client IP for /current endpoint
    let clientIP = "127.0.0.1";
    if (event.req.headers.get("x-forwarded-for")) {
      clientIP = event.req.headers.get("x-forwarded-for")!.split(",")[0].trim();
    } else if (event.req.headers.get("x-real-ip")) {
      clientIP = event.req.headers.get("x-real-ip")!;
    } else {
      clientIP = event.node?.req?.socket?.remoteAddress || "127.0.0.1";
    }

    const queryIP = ip || clientIP;

    const request: GeoIPServerRequest = {
      request: event.req as Request,
      ip: queryIP,
      path,
    };

    // Authorize request
    try {
      await opts.authorize?.(request);
    } catch (error: any) {
      const httpError = HTTPError.isError(error)
        ? error
        : new HTTPError({
            status: 401,
            statusText: error?.message,
            cause: error,
          });
      throw httpError;
    }

    // Set default response headers
    event.res.headers.set("Content-Type", "application/json");
    event.res.headers.set("Access-Control-Allow-Origin", "*");

    // Handle request
    if (path === "/help" || path === "/") {
      const help = {
        service: "GeoIP Server",
        version: "1.0.0",
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
          body: { ips: ["8.8.8.8", "1.1.1.1"] },
        },
        query_options: {
          version: "IP version preference: 'ipv4', 'ipv6', 'auto'",
        },
      };

      return JSON.stringify(help, null, 2);
    }

    // Parse query parameters
    const url = new URL(event.req.url || "");
    const queryOptions: QueryOptions = {};

    if (url.searchParams.has("version")) {
      const version = url.searchParams.get("version");
      if (version === "ipv4" || version === "ipv6" || version === "auto") {
        queryOptions.version = version;
      }
    }

    // Handle batch endpoint
    if (path === "/batch") {
      if (event.req.method !== "POST") {
        throw new HTTPError({
          statusCode: 405,
          statusMessage: "Method not allowed. Use POST for batch requests",
        });
      }

      try {
        const body = (await event.req.json()) as { ips?: string[] };
        if (!body.ips || !Array.isArray(body.ips)) {
          throw new HTTPError({
            statusCode: 400,
            statusMessage: "Invalid request body: 'ips' array is required",
          });
        }

        const results = await geoipManager.batchLookup(body.ips, queryOptions);
        return JSON.stringify(results, null, 2);
      } catch (error: any) {
        if (error instanceof HTTPError) {
          throw error;
        }
        throw new HTTPError({
          statusCode: 400,
          statusMessage: "Invalid JSON in request body",
        });
      }
    }

    // Use GeoIP driver to get location data
    let data: GeoLocation | null;

    if (path === "/current") {
      data = await geoipManager.current(queryOptions);
    } else {
      data = await geoipManager.lookup(queryIP, queryOptions);
    }

    if (!data) {
      throw new HTTPError({
        statusCode: 404,
        statusMessage: "Geolocation data not found",
      });
    }

    return JSON.stringify(data, null, 2);
  });

  return handler;
}

/**
 * Create GeoIP server with convenience wrapper
 */
export function createGeoIPServer(opts: GeoIPServerOptions = {}): {
  handler: EventHandlerWithFetch<
    EventHandlerRequest,
    Promise<GeoLocation | string>
  >;
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
  // Remove leading/trailing slashes
  const cleanPath = path.replace(/^\/+|\/+$/g, "");

  // Handle help endpoint
  if (cleanPath === "help" || cleanPath === "") {
    return { ip: "" };
  }

  // Handle /current endpoint
  if (cleanPath === "current") {
    return { ip: "" };
  }

  // Handle /batch endpoint
  if (cleanPath === "batch") {
    return { ip: "" };
  }

  // Validate IP using ipdo package
  const ip = cleanPath;
  if (isValidIP(ip)) {
    return { ip };
  }

  return {
    ip: "",
    error: "Invalid IP address format",
  };
}

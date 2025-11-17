/**
 * RDAP Server
 * Simple RDAP server implementation using h3
 * @see https://www.icann.org/rdap
 */

import {
  defineHandler,
  EventHandlerRequest,
  EventHandlerWithFetch,
  H3,
  serve,
} from "h3";
import { HTTPError } from "h3";
import { RdapQueryType, RdapOptions, RdapHelp, RdapResponse } from "./types";
import { getQueryType, convertToAscii } from "./utils";
import { queryRDAP } from "./rdap";

export type RdapServerRequest = {
  request: globalThis.Request;
  query: string;
  type: RdapQueryType;
  path: string;
};

const SupportedMethods = ["GET", "HEAD"];

export interface RdapServerOptions {
  /**
   * Authorization function for requests
   */
  authorize?: (request: RdapServerRequest) => void | Promise<void>;

  /**
   * Path resolver function
   */
  resolvePath?: (event: any) => string;

  /**
   * Custom data provider for RDAP responses
   * If provided, will handle all requests locally
   */
  dataProvider?: (query: string, type: RdapQueryType) => Promise<any>;

  /**
   * Base URL for RDAP queries (passed to queryRDAP)
   */
  baseUrl?: string;

  /**
   * Custom fetch options for queries
   */
  fetchOptions?: RequestInit;
}

export type FetchHandler = (
  req: globalThis.Request,
) => globalThis.Response | Promise<globalThis.Response>;

/**
 * This function creates a fetch handler for your custom RDAP server.
 *
 * The RDAP server will handle GET and HEAD requests according to RFC 7482.
 * - HEAD: Return metadata about RDAP resources
 * - GET: Return RDAP data for domains, IPs, ASNs, nameservers, and entities
 * - /help: Return server capabilities and conformance information
 *
 * The server supports all RDAP query types:
 * - domain: Domain information (/domain/example.com)
 * - nameserver: Nameserver information (/nameserver/ns1.example.com)
 * - ip: IP network information (/ip/8.8.8.8)
 * - autnum: Autonomous system information (/autnum/15169)
 * - entity: Entity information (/entity/ABC123-EXAMPLE)
 * - help: Server help information (/help)
 *
 * @param options RDAP server configuration options
 * @returns A fetch handler that can be used with h3 or other web frameworks
 */
export function createRdapHandler(
  opts: RdapServerOptions = {},
): EventHandlerWithFetch<EventHandlerRequest, Promise<RdapResponse | string>> {
  const handler = defineHandler(async (event) => {
    const path = opts.resolvePath?.(event) ?? event.url.pathname;

    // Parse path to extract query type and value
    const { queryType, query, error, redirect } = parseRdapPath(path);

    if (error) {
      throw new HTTPError({
        statusCode: 400,
        statusMessage: error,
      });
    }

    // Handle redirect case
    if (redirect) {
      throw new HTTPError({
        statusCode: 302,
        statusMessage: "Found",
        headers: {
          Location: redirect,
        },
      });
    }

    const request: RdapServerRequest = {
      request: event.req as Request,
      query,
      type: queryType,
      path,
    };

    // Validate method
    if (!SupportedMethods.includes(event.req.method)) {
      throw new HTTPError({
        statusCode: 405,
        statusMessage: `Method Not Allowed: ${event.req.method}`,
      });
    }

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
    event.res.headers.set("Content-Type", "application/rdap+json");
    event.res.headers.set("Access-Control-Allow-Origin", "*");

    // Handle different methods
    if (event.req.method === "HEAD") {
      return "";
    }

    if (event.req.method === "GET") {
      // Use custom data provider if available
      if (opts.dataProvider) {
        const data = await opts.dataProvider(query, queryType);
        if (!data) {
          throw new HTTPError({
            statusCode: 404,
            statusMessage: "RDAP resource not found",
          });
        }

        // Format the custom data response with indentation
        return JSON.stringify(data, null, 2);
      }

      // Handle help request with custom response
      if (queryType === "help") {
        // Get server URL from request
        const serverUrl = new URL(event.req.url || "");
        const baseUrl = `${serverUrl.protocol}//${serverUrl.host}`;

        const help: RdapHelp = {
          objectClassName: "help",
          rdapConformance: [
            "nro_rdap_profile_0",
            "rdap_level_0",
            "cidr0",
            "nro_rdap_profile_asn_flat_0",
            "arin_originas0",
            "rirSearch1",
            "ips",
            "ipSearchResults",
            "autnums",
            "autnumSearchResults",
            "reverse_search",
          ],
          notices: [
            {
              title: "Terms of Service",
              description: [
                "By using this RDAP service, you are agreeing to the service terms",
              ],
              links: [
                {
                  value: `${baseUrl}/help`,
                  rel: "terms-of-service",
                  type: "text/html",
                  href: `${baseUrl}/terms`,
                },
              ],
            },
            {
              title: "Copyright Notice",
              description: ["Copyright RDAP Server Implementation"],
            },
          ],
          reverse_search_properties: [
            {
              searchableResourceType: "ips",
              relatedResourceType: "entity",
              property: "fn",
            },
            {
              searchableResourceType: "ips",
              relatedResourceType: "entity",
              property: "handle",
            },
            {
              searchableResourceType: "ips",
              relatedResourceType: "entity",
              property: "email",
            },
            {
              searchableResourceType: "ips",
              relatedResourceType: "entity",
              property: "role",
            },
            {
              searchableResourceType: "autnums",
              relatedResourceType: "entity",
              property: "fn",
            },
            {
              searchableResourceType: "autnums",
              relatedResourceType: "entity",
              property: "handle",
            },
            {
              searchableResourceType: "autnums",
              relatedResourceType: "entity",
              property: "email",
            },
            {
              searchableResourceType: "autnums",
              relatedResourceType: "entity",
              property: "role",
            },
          ],
        };

        // Format the help response with indentation
        return JSON.stringify(help, null, 2);
      }

      // Use existing RDAP client functions for other query types
      const rdapOptions: RdapOptions = {
        baseUrl: opts.baseUrl,
        fetchOptions: opts.fetchOptions,
        type: queryType,
      };

      const data = await queryRDAP(query, rdapOptions);

      // Format the JSON response with indentation
      return JSON.stringify(data, null, 2);
    }

    throw new HTTPError({
      statusCode: 405,
      statusMessage: `Method Not Allowed: ${event.req.method}`,
    });
  });

  return handler;
}

/**
 * Create RDAP server with convenience wrapper
 */
export function createRdapServer(opts: RdapServerOptions = {}): {
  handler: EventHandlerWithFetch<
    EventHandlerRequest,
    Promise<RdapResponse | string>
  >;
  serve: (port?: number) => void;
} {
  const handler = createRdapHandler(opts);
  const app = new H3().use("/**", handler);

  return {
    handler,
    serve: (port = 8080) => serve(app, { port }),
  };
}

/**
 * Parse RDAP path to extract query type and value
 */
function parseRdapPath(path: string): {
  queryType: RdapQueryType;
  query: string;
  error?: string;
  redirect?: string;
} {
  // Remove leading/trailing slashes
  const cleanPath = path.replace(/^\/+|\/+$/g, "");

  if (!cleanPath) {
    // Redirect root path to /help
    return {
      queryType: "help",
      query: "help",
      redirect: "/help",
    };
  }

  const parts = cleanPath.split("/");
  const [typePart, ...valueParts] = parts;

  // Handle /help endpoint
  if (typePart === "help" && valueParts.length === 0) {
    return {
      queryType: "help",
      query: "help",
    };
  }

  // Check if it's already a valid RDAP path format
  const validTypes: RdapQueryType[] = [
    "domain",
    "nameserver",
    "entity",
    "ip",
    "autnum",
  ];

  if (validTypes.includes(typePart as RdapQueryType) && valueParts.length > 0) {
    const queryType = typePart as RdapQueryType;
    const query = valueParts.join("/");

    return {
      queryType,
      query: queryType === "domain" ? convertToAscii(query) : query,
    };
  }

  // Auto-detect query type (backward compatibility)
  const queryType = getQueryType(cleanPath);
  return {
    queryType,
    query: cleanPath,
  };
}

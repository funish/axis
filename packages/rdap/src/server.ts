/**
 * RDAP server built on h3
 * @see https://www.icann.org/rdap
 */

import { HTTPError, H3, defineHandler, serve } from "h3";
import type { EventHandlerRequest, EventHandlerWithFetch, H3Event } from "h3";

import { RdapError } from "./error";
import { queryRDAP } from "./rdap";
import type {
  RdapBootstrapOptions,
  RdapHelp,
  RdapNotice,
  RdapOptions,
  RdapQueryType,
  RdapResponse,
} from "./types";
import { convertToAscii, getQueryType, validateQuery } from "./utils";

export type RdapServerRequest = {
  request: globalThis.Request;
  query: string;
  type: RdapQueryType;
  path: string;
};

export interface RdapServerOptions {
  /**
   * Authorization function for requests.
   */
  authorize?: (request: RdapServerRequest) => void | Promise<void>;

  /**
   * Custom path resolver function.
   */
  resolvePath?: (event: H3Event) => string;

  /**
   * Local data provider. When configured, it is used instead of upstream RDAP.
   */
  dataProvider?: (query: string, type: RdapQueryType) => Promise<unknown>;

  /**
   * Upstream RDAP service used when no local data provider is configured.
   */
  baseUrl?: string;

  /**
   * Fetch options for proxied queries.
   */
  fetchOptions?: RequestInit;

  /**
   * Bootstrap refresh and cache options for queries without a baseUrl.
   */
  bootstrap?: RdapBootstrapOptions;
}

export function parseRdapPath(path: string): {
  queryType: RdapQueryType;
  query: string;
  error?: string;
  redirect?: string;
} {
  const cleanPath = path.replace(/^\/+|\/+$/g, "");
  let parts: string[];
  try {
    parts = cleanPath.split("/").map((part) => decodeURIComponent(part));
  } catch {
    return {
      queryType: "help",
      query: "",
      error: "Invalid URL encoding",
    };
  }

  if (!cleanPath) {
    return {
      queryType: "help",
      query: "help",
      redirect: "/help",
    };
  }

  const [typePart, ...valueParts] = parts;

  if (typePart === "help") {
    if (valueParts.length === 0) {
      return {
        queryType: "help",
        query: "help",
      };
    }
    return {
      queryType: "help",
      query: "help",
      error: "The help endpoint does not accept a query value",
    };
  }

  const explicitTypes: RdapQueryType[] = ["domain", "nameserver", "entity", "ip", "autnum"];

  if (explicitTypes.includes(typePart as RdapQueryType)) {
    const queryType = typePart as RdapQueryType;
    if (valueParts.length !== 1 || !valueParts[0]) {
      return {
        queryType,
        query: "",
        error: `The ${queryType} endpoint requires exactly one query value`,
      };
    }

    const query = valueParts[0];
    try {
      validateQuery(query, queryType);
    } catch (error) {
      return {
        queryType,
        query,
        error: error instanceof Error ? error.message : "Invalid query value",
      };
    }

    return {
      queryType,
      query: queryType === "domain" || queryType === "nameserver" ? convertToAscii(query) : query,
    };
  }

  if (valueParts.length !== 0) {
    return {
      queryType: "help",
      query: cleanPath,
      error: `Unknown RDAP path: /${cleanPath}`,
    };
  }

  try {
    const queryType = getQueryType(cleanPath);
    return {
      queryType,
      query: cleanPath,
    };
  } catch (error) {
    return {
      queryType: "help",
      query: cleanPath,
      error: error instanceof Error ? error.message : "Invalid RDAP path",
    };
  }
}

function toHttpError(error: unknown): HTTPError {
  if (HTTPError.isError(error)) {
    return error;
  }
  if (error instanceof RdapError) {
    return new HTTPError({
      status: error.status,
      message: error.message,
      cause: error,
    });
  }
  return new HTTPError({
    status: 500,
    message: "Internal server error",
    cause: error,
  });
}

function sourceNotices(baseUrl: string, hasDataProvider: boolean): RdapNotice[] {
  if (hasDataProvider) {
    return [
      {
        title: "Data source",
        description: ["Responses are supplied by the configured local data provider."],
      },
    ];
  }
  if (baseUrl) {
    return [
      {
        title: "Data source",
        description: [`Responses are proxied from ${baseUrl}.`],
      },
    ];
  }
  return [
    {
      title: "Data source",
      description: ["Responses are resolved with the RDAP bootstrap service for each query."],
    },
  ];
}

function createHelpResponse(requestUrl: string, options: RdapServerOptions): RdapHelp {
  const url = new URL(requestUrl || "http://localhost");
  const serviceUrl = `${url.protocol}//${url.host}/help`;

  return {
    objectClassName: "help",
    rdapConformance: ["rdap_level_0"],
    notices: [
      ...sourceNotices(options.baseUrl ?? "", Boolean(options.dataProvider)),
      {
        title: "Supported methods",
        description: ["This service supports GET and HEAD requests."],
        links: [
          {
            value: serviceUrl,
            rel: "self",
            href: serviceUrl,
            type: "application/rdap+json",
          },
        ],
      },
    ],
  };
}

/**
 * Create an h3 event handler for RDAP requests.
 */
export function createRdapHandler(
  opts: RdapServerOptions = {},
): EventHandlerWithFetch<EventHandlerRequest, Promise<RdapResponse | string>> {
  return defineHandler(async (event) => {
    try {
      const method = event.req.method;
      if (method !== "GET" && method !== "HEAD") {
        throw new HTTPError({
          status: 405,
          message: "Only GET and HEAD requests are supported",
          headers: { Allow: "GET, HEAD" },
        });
      }

      const path = opts.resolvePath?.(event) ?? event.url.pathname;
      const { queryType, query, error, redirect } = parseRdapPath(path);

      if (error) {
        throw new HTTPError({
          status: 400,
          message: error,
        });
      }
      if (redirect) {
        throw new HTTPError({
          status: 302,
          message: "Found",
          headers: { Location: redirect },
        });
      }

      const request: RdapServerRequest = {
        request: event.req,
        query,
        type: queryType,
        path,
      };

      try {
        await opts.authorize?.(request);
      } catch (authorizeError) {
        throw HTTPError.isError(authorizeError)
          ? authorizeError
          : new HTTPError({
              status: 401,
              message:
                authorizeError instanceof Error ? authorizeError.message : "Authorization failed",
              cause: authorizeError,
            });
      }

      event.res.headers.set("Content-Type", "application/rdap+json");
      event.res.headers.set("Access-Control-Allow-Origin", "*");

      if (method === "HEAD") {
        return "";
      }

      if (opts.dataProvider) {
        const data = await opts.dataProvider(query, queryType);
        if (data === undefined || data === null || data === "") {
          throw new HTTPError({
            status: 404,
            message: "RDAP resource not found",
          });
        }
        return JSON.stringify(data, null, 2);
      }

      if (queryType === "help") {
        return JSON.stringify(createHelpResponse(event.req.url, opts), null, 2);
      }

      const rdapOptions: RdapOptions = {
        baseUrl: opts.baseUrl,
        fetchOptions: opts.fetchOptions,
        bootstrap: opts.bootstrap,
        type: queryType,
      };
      const data = await queryRDAP(query, rdapOptions);
      return JSON.stringify(data, null, 2);
    } catch (error) {
      throw toHttpError(error);
    }
  });
}

/**
 * Create an RDAP server and a convenience launcher.
 */
export function createRdapServer(opts: RdapServerOptions = {}): {
  handler: EventHandlerWithFetch<EventHandlerRequest, Promise<RdapResponse | string>>;
  serve: (port?: number) => void;
} {
  const handler = createRdapHandler(opts);
  const app = new H3().use("/**", handler);

  return {
    handler,
    serve: (port = 8080) => serve(app, { port }),
  };
}

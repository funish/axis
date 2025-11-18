/**
 * RDAP (Registration Data Access Protocol) Client
 * A modern implementation of RDAP client following ICANN standards
 * @see https://www.icann.org/rdap
 */

import { ofetch } from "ofetch";
import type { FetchError } from "ofetch";
import { ipInRange } from "ipdo";
import { asn, dns, ipv4, ipv6, objectTags } from "./bootstrap";
import {
  RdapBootstrapType,
  RdapBootstrapMetadata,
  RdapQueryType,
  RdapOptions,
  RdapResponse,
  RdapDomain,
  RdapNameserver,
  RdapEntity,
  RdapIpNetwork,
  RdapAutnum,
  RdapHelp,
} from "./types";
import {
  formatAsn,
  getQueryType,
  getBootstrapType,
  bootstrapTypeToQueryType,
  convertToAscii,
} from "./utils";

/**
 * Get bootstrap metadata from IANA
 */
export async function getBootstrapMetadata(
  type: RdapBootstrapType,
  fetch = false,
): Promise<RdapBootstrapMetadata> {
  try {
    if (!fetch) {
      const metadata: Record<RdapBootstrapType, RdapBootstrapMetadata> = {
        asn,
        dns,
        ipv4,
        ipv6,
        "object-tags": objectTags,
      };
      return metadata[type];
    }

    return await ofetch<RdapBootstrapMetadata>(
      `https://data.iana.org/rdap/${type}.json`,
      {
        parseResponse: JSON.parse,
      },
    );
  } catch (error) {
    throw new Error(
      `Failed to get bootstrap metadata for ${type}: ${String(error)}`,
    );
  }
}

/**
 * Find RDAP server for a query
 */
export async function findBootstrapServer(
  type: RdapBootstrapType,
  query: string,
): Promise<string> {
  try {
    const metadata = await getBootstrapMetadata(type);

    const service = metadata.services.find(([patterns]) =>
      patterns.some((pattern) => {
        try {
          switch (type) {
            case "dns":
              return pattern === query.split(".").pop();
            case "ipv4":
            case "ipv6":
              return ipInRange(pattern, query);
            case "asn": {
              const [start, end] = pattern.split("-").map(Number);
              const queryNum = Number(formatAsn(query));
              return queryNum >= start && queryNum <= end;
            }
            case "object-tags":
              return pattern === query;
            default:
              return false;
          }
        } catch {
          return false;
        }
      }),
    );

    if (!service) {
      throw new Error(`No RDAP server found for ${type} query: ${query}`);
    }

    return service[service.length - 1][0];
  } catch (error) {
    throw new Error(
      `Failed to find RDAP server for ${type} query: ${query}: ${String(error)}`,
    );
  }
}

/**
 * Get server URL for a query
 */
export async function getServerUrl(
  query: string,
  type?: RdapQueryType,
  options?: RdapOptions,
): Promise<string> {
  // If base URL is provided, use it
  if (options?.baseUrl) {
    const baseUrl = options.baseUrl.replace(/\/$/, "");
    const queryType = type ?? getQueryType(query);
    return `${baseUrl}/${queryType}/${query}`;
  }

  // Otherwise, use bootstrap service
  const queryType = type ?? getQueryType(query);

  // Determine bootstrap type based on query type
  let bootstrapType: RdapBootstrapType;
  switch (queryType) {
    case "domain":
    case "nameserver":
      bootstrapType = "dns";
      break;
    case "ip":
      bootstrapType = getBootstrapType(query); // Need to differentiate ipv4/ipv6
      break;
    case "autnum":
      bootstrapType = "asn";
      break;
    case "entity":
      bootstrapType = "object-tags";
      break;
    case "help":
      // Help queries use DNS bootstrap but fixed "help" path
      bootstrapType = "dns";
      break;
    default:
      throw new Error(`Unsupported query type: ${String(queryType)}`);
  }

  const baseUrl = (await findBootstrapServer(bootstrapType, query)).replace(
    /\/$/,
    "",
  );
  const endpointType = bootstrapTypeToQueryType(bootstrapType, queryType);

  return `${baseUrl}/${endpointType}/${query}`;
}

/**
 * Query RDAP data
 */
export async function queryRDAP<T = RdapResponse>(
  query: string,
  options: RdapOptions = {},
): Promise<T> {
  try {
    // Use specified type or auto-detect
    const queryType = options?.type ?? getQueryType(query);
    const normalizedQuery = options?.baseUrl
      ? query
      : queryType === "domain"
        ? convertToAscii(query)
        : query;

    // Get server URL
    const url = await getServerUrl(normalizedQuery, queryType, options);

    // Make request
    const response = await ofetch<T>(url, {
      headers: {
        Accept: "application/rdap+json",
        "User-Agent": "axis-rdap-client/0.0.4",
        "Accept-Language": "en",
      },
      ...options?.fetchOptions,
    });

    return response;
  } catch (error) {
    const fetchError = error as FetchError;
    const statusCode = fetchError?.response?.status;

    // Handle HTTP error status codes according to RFC 7482
    if (statusCode === 404) {
      throw new Error(`RDAP resource not found: ${query}`);
    }
    if (statusCode === 429) {
      throw new Error(`RDAP rate limit exceeded for: ${query}`);
    }
    if (statusCode === 401) {
      throw new Error(`RDAP authentication required for: ${query}`);
    }
    if (statusCode === 403) {
      throw new Error(`RDAP access forbidden for: ${query}`);
    }
    if (statusCode === 400) {
      throw new Error(`RDAP bad request for: ${query}`);
    }
    if (statusCode === 500) {
      throw new Error(`RDAP server error for: ${query}`);
    }

    throw new Error(`RDAP query failed for ${query}: ${String(error)}`);
  }
}

/**
 * Convenience functions for specific query types
 */
export async function queryDomain<T = RdapDomain>(
  domain: string,
  options?: RdapOptions,
): Promise<T> {
  return queryRDAP<T>(domain, { ...options, type: "domain" });
}

export async function queryNameserver<T = RdapNameserver>(
  nameserver: string,
  options?: RdapOptions,
): Promise<T> {
  return queryRDAP<T>(nameserver, { ...options, type: "nameserver" });
}

export async function queryEntity<T = RdapEntity>(
  handle: string,
  options?: RdapOptions,
): Promise<T> {
  return queryRDAP<T>(handle, { ...options, type: "entity" });
}

export async function queryIP<T = RdapIpNetwork>(
  ip: string,
  options?: RdapOptions,
): Promise<T> {
  return queryRDAP<T>(ip, { ...options, type: "ip" });
}

export async function queryASN<T = RdapAutnum>(
  asn: string,
  options?: RdapOptions,
): Promise<T> {
  return queryRDAP<T>(asn, { ...options, type: "autnum" });
}

export async function queryHelp<T = RdapHelp>(
  options?: RdapOptions,
): Promise<T> {
  return queryRDAP<T>("help", { ...options, type: "help" });
}

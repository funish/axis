/**
 * RDAP (Registration Data Access Protocol) Client
 * A modern implementation of RDAP client following ICANN standards
 * @see https://www.icann.org/rdap
 */

import { ofetch } from "ofetch";
import type { FetchError } from "ofetch";
import { ipInRange } from "ipdo";
import { asn, dns, ipv4, ipv6, objectTags } from "./bootstrap/data";
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
  const bootstrapType = getBootstrapType(query);
  const baseUrl = (await findBootstrapServer(bootstrapType, query)).replace(
    /\//,
    "",
  );
  const finalType = bootstrapTypeToQueryType(bootstrapType);

  return `${baseUrl}/${finalType}/${query}`;
}

/**
 * Query RDAP data
 */
export async function queryRDAP<T = RdapResponse>(
  query: string,
  options: RdapOptions = {},
): Promise<T> {
  try {
    // Convert IDN domain to ASCII
    const normalizedQuery = options?.baseUrl ? query : convertToAscii(query);

    // Get server URL
    const url = await getServerUrl(normalizedQuery, undefined, options);

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
export async function queryDomain<T = RdapDomain>(domain: string): Promise<T> {
  return queryRDAP<T>(domain);
}

export async function queryNameserver<T = RdapNameserver>(
  nameserver: string,
): Promise<T> {
  return queryRDAP<T>(nameserver);
}

export async function queryEntity<T = RdapEntity>(handle: string): Promise<T> {
  return queryRDAP<T>(handle);
}

export async function queryIP<T = RdapIpNetwork>(ip: string): Promise<T> {
  return queryRDAP<T>(ip);
}

export async function queryASN<T = RdapAutnum>(asn: string): Promise<T> {
  return queryRDAP<T>(asn);
}

/**
 * Query RDAP help information
 */
export async function queryHelp(): Promise<any> {
  return queryRDAP("help");
}

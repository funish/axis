/**
 * RDAP client following ICANN standards
 * @see https://www.icann.org/rdap
 */

import { ipInRange } from "ipdo";
import { ofetch } from "ofetch";

import { asn, dns, ipv4, ipv6, objectTags } from "./bootstrap";
import { RdapError } from "./error";
import type { RdapErrorDetails } from "./error";
import type {
  RdapAutnum,
  RdapBootstrapMetadata,
  RdapBootstrapOptions,
  RdapBootstrapType,
  RdapDomain,
  RdapEntity,
  RdapHelp,
  RdapIpNetwork,
  RdapNameserver,
  RdapOptions,
  RdapQueryType,
  RdapResponse,
} from "./types";
import {
  bootstrapTypeToQueryType,
  convertToAscii,
  formatAsn,
  getBootstrapType,
  getQueryType,
  validateQuery,
} from "./utils";

const bundledMetadata: Record<RdapBootstrapType, RdapBootstrapMetadata> = {
  asn,
  dns,
  ipv4,
  ipv6,
  "object-tags": objectTags,
};

const DEFAULT_BOOTSTRAP_TTL_MS = 3_600_000;

interface BootstrapCacheEntry {
  metadata: RdapBootstrapMetadata;
  expiresAt: number;
}

const bootstrapCache = new Map<RdapBootstrapType, BootstrapCacheEntry>();

/**
 * Clear fetched bootstrap metadata from the in-memory cache.
 */
export function clearBootstrapCache(): void {
  bootstrapCache.clear();
}

function bootstrapUrl(type: RdapBootstrapType): string {
  return `https://data.iana.org/rdap/${type}.json`;
}

/**
 * Get bootstrap metadata from bundled data or a cached IANA fetch.
 */
export async function getBootstrapMetadata(
  type: RdapBootstrapType,
  fetch = false,
  ttlMs = DEFAULT_BOOTSTRAP_TTL_MS,
): Promise<RdapBootstrapMetadata> {
  const now = Date.now();
  const cached = bootstrapCache.get(type);

  if (!fetch && cached && cached.expiresAt > now) {
    return cached.metadata;
  }

  if (!fetch) {
    return bundledMetadata[type];
  }

  try {
    const metadata = await ofetch<RdapBootstrapMetadata>(bootstrapUrl(type), {
      parseResponse: JSON.parse,
    });
    bootstrapCache.set(type, {
      metadata,
      expiresAt: Date.now() + Math.max(0, ttlMs),
    });
    return metadata;
  } catch {
    if (cached && cached.expiresAt > now) {
      return cached.metadata;
    }
    return bundledMetadata[type];
  }
}

function preferSecureUrl(urls: string[]): string {
  return urls.find((url) => url.startsWith("https://")) ?? urls[0];
}

/**
 * Find an RDAP server with IANA bootstrap data.
 */
export async function findBootstrapServer(
  type: RdapBootstrapType,
  query: string,
  bootstrap: RdapBootstrapOptions = {},
): Promise<string> {
  const queryType = bootstrapTypeToQueryType(type);
  validateQuery(query, queryType);
  const metadata = await getBootstrapMetadata(type, bootstrap.fetch, bootstrap.ttlMs);

  const service = metadata.services.find((service) => {
    const patterns = type === "object-tags" ? service[1] : (service[0] ?? []);
    return patterns.some((pattern) => {
      try {
        switch (type) {
          case "dns":
            return pattern === query.split(".").at(-1);
          case "ipv4":
          case "ipv6":
            return ipInRange(pattern, query);
          case "asn": {
            const [start, end] = pattern.split("-").map(Number);
            const queryNumber = Number(formatAsn(query));
            return queryNumber >= start && queryNumber <= end;
          }
          case "object-tags":
            return pattern === query;
        }
      } catch {
        return false;
      }
    });
  });

  const url = service ? preferSecureUrl(service.at(-1) ?? []) : undefined;
  if (!url) {
    throw new RdapError(`No RDAP server found for ${type} query: ${query}`, {
      code: "BOOTSTRAP_NOT_FOUND",
      status: 404,
      retryable: false,
      bootstrapType: type,
      query,
      queryType,
    });
  }

  return url;
}

function rdapUrl(baseUrl: string, queryType: RdapQueryType, query: string): string {
  try {
    const url = new URL(baseUrl);
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/${queryType}/${encodeURIComponent(query)}`;
    return url.href;
  } catch (error) {
    throw new RdapError(`Invalid RDAP base URL: ${baseUrl}`, {
      code: "CONFIGURATION_ERROR",
      status: 500,
      query,
      queryType,
      cause: error,
    });
  }
}

function normalizeQuery(query: string, queryType: RdapQueryType): string {
  switch (queryType) {
    case "domain":
    case "nameserver":
      return convertToAscii(query);
    case "autnum":
      return formatAsn(query);
    default:
      return query;
  }
}

/**
 * Get the RDAP request URL for a query.
 */
export async function getServerUrl(
  query: string,
  type?: RdapQueryType,
  options?: RdapOptions,
): Promise<string> {
  const queryType = type ?? getQueryType(query);
  const normalizedQuery = normalizeQuery(query, queryType);

  if (options?.baseUrl) {
    return rdapUrl(options.baseUrl, queryType, normalizedQuery);
  }

  if (queryType === "help") {
    throw new RdapError("A baseUrl is required for RDAP help queries", {
      code: "CONFIGURATION_ERROR",
      status: 500,
      query,
      queryType,
    });
  }

  const bootstrapType =
    queryType === "ip"
      ? getBootstrapType(normalizedQuery)
      : queryType === "autnum"
        ? "asn"
        : queryType === "entity"
          ? "object-tags"
          : "dns";
  const baseUrl = await findBootstrapServer(bootstrapType, normalizedQuery, options?.bootstrap);
  const endpointType = bootstrapTypeToQueryType(bootstrapType, queryType);

  return rdapUrl(baseUrl, endpointType, normalizedQuery);
}

function httpErrorDetails(
  error: unknown,
  query: string,
  queryType: RdapQueryType,
): RdapErrorDetails {
  const fetchError = error as { response?: { status?: number } };
  const status = fetchError?.response?.status;

  if (status !== undefined) {
    return {
      code: "HTTP_ERROR",
      status,
      retryable: status === 429 || status >= 500,
      query,
      queryType,
      cause: error,
    };
  }

  return {
    code: "REQUEST_FAILED",
    status: 502,
    retryable: true,
    query,
    queryType,
    cause: error,
  };
}

/**
 * Query RDAP data.
 */
export async function queryRDAP<T = RdapResponse>(
  query: string,
  options: RdapOptions = {},
): Promise<T> {
  const queryType = options.type ?? getQueryType(query);
  validateQuery(query, queryType);
  const normalizedQuery = normalizeQuery(query, queryType);
  const url = await getServerUrl(normalizedQuery, queryType, options);

  let response: T;
  try {
    const headers = new Headers(options.fetchOptions?.headers);
    if (!headers.has("Accept")) {
      headers.set("Accept", "application/rdap+json");
    }
    response = await ofetch<T>(url, {
      ...options.fetchOptions,
      headers,
    });
  } catch (error) {
    throw new RdapError(
      `RDAP query failed for ${query} with ${httpErrorDetails(error, query, queryType).status}`,
      httpErrorDetails(error, normalizedQuery, queryType),
    );
  }

  return response;
}

/**
 * Convenience functions for specific query types.
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

export async function queryIP<T = RdapIpNetwork>(ip: string, options?: RdapOptions): Promise<T> {
  return queryRDAP<T>(ip, { ...options, type: "ip" });
}

export async function queryASN<T = RdapAutnum>(asn: string, options?: RdapOptions): Promise<T> {
  return queryRDAP<T>(asn, { ...options, type: "autnum" });
}

export async function queryHelp<T = RdapHelp>(options?: RdapOptions): Promise<T> {
  return queryRDAP<T>("help", { ...options, type: "help" });
}

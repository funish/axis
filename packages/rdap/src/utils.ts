/**
 * RDAP utility functions
 */

import { isIPv4, isIPv6, isValidIP } from "ipdo";

import { RdapError } from "./error";
import type { RdapBootstrapType, RdapQueryType } from "./types";

const DOMAIN_LABEL_PATTERN = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const ENTITY_PATTERN = /^[a-z0-9][a-z0-9_.:@-]{0,254}$/i;

/**
 * Convert a domain name to its ASCII form (Punycode).
 */
export function convertToAscii(domain: string): string {
  if (!isDomain(domain)) {
    throw new RdapError(`Invalid domain name: ${domain}`, {
      code: "INVALID_QUERY",
      status: 400,
      query: domain,
      queryType: "domain",
    });
  }

  return new URL(`http://${domain}`).hostname;
}

/**
 * Convert a bootstrap service type to its RDAP query type.
 */
export function bootstrapTypeToQueryType(
  type: RdapBootstrapType,
  queryType?: RdapQueryType,
): RdapQueryType {
  if (queryType) {
    return queryType;
  }

  switch (type) {
    case "asn":
      return "autnum";
    case "dns":
      return "domain";
    case "ipv4":
    case "ipv6":
      return "ip";
    case "object-tags":
      return "entity";
  }
}

/**
 * Check whether a string is a valid ASN.
 */
export function isAsn(value: string): boolean {
  if (/^AS\d+$/i.test(value)) {
    return Number(value.slice(2)) <= 4_294_967_295;
  }
  return /^\d+$/.test(value) && Number(value) <= 4_294_967_295;
}

/**
 * Remove the AS prefix from an ASN.
 */
export function formatAsn(value: string): string {
  return /^AS\d+$/i.test(value) ? value.slice(2) : value;
}

/**
 * Check whether a string is a valid DNS label sequence supported by RDAP.
 */
export function isDomain(value: string): boolean {
  if (!value || value.length > 253 || value.endsWith(".")) {
    return false;
  }

  let hostname: string;
  try {
    hostname = new URL(`http://${value}`).hostname;
  } catch {
    return false;
  }

  const labels = hostname.split(".");
  return labels.length > 1 && labels.every((label) => DOMAIN_LABEL_PATTERN.test(label));
}

/**
 * Check whether a string is plausible as an RDAP entity handle.
 */
export function isEntity(value: string): boolean {
  return ENTITY_PATTERN.test(value);
}

/**
 * Detect an RDAP query type from its input format.
 */
export function getQueryType(query: string): RdapQueryType {
  if (isAsn(query)) {
    return "autnum";
  }
  if (isValidIP(query)) {
    return "ip";
  }
  if (query === "help") {
    return "help";
  }
  if (isDomain(query)) {
    return "domain";
  }
  if (isEntity(query)) {
    return "entity";
  }

  throw new RdapError(`Invalid RDAP query: ${query}`, {
    code: "INVALID_QUERY",
    status: 400,
    query,
  });
}

/**
 * Get the bootstrap service type used to discover a query's RDAP server.
 */
export function getBootstrapType(query: string): RdapBootstrapType {
  if (isAsn(query)) {
    return "asn";
  }
  if (isIPv4(query)) {
    return "ipv4";
  }
  if (isIPv6(query)) {
    return "ipv6";
  }
  if (isDomain(query)) {
    return "dns";
  }
  if (isEntity(query)) {
    return "object-tags";
  }

  throw new RdapError(`Invalid RDAP query: ${query}`, {
    code: "INVALID_QUERY",
    status: 400,
    query,
  });
}

/**
 * Validate a query for an explicitly selected RDAP query type.
 */
export function validateQuery(query: string, type: RdapQueryType): string {
  if (type === "help") {
    return query;
  }

  const valid =
    type === "domain" || type === "nameserver"
      ? isDomain(query)
      : type === "ip"
        ? isValidIP(query)
        : type === "autnum"
          ? isAsn(query)
          : isEntity(query);

  if (!valid) {
    throw new RdapError(`Invalid ${type} query: ${query}`, {
      code: "INVALID_QUERY",
      status: 400,
      query,
      queryType: type,
    });
  }

  return query;
}

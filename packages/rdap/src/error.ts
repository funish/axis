/**
 * Typed RDAP errors
 */

import type { RdapBootstrapType, RdapQueryType } from "./types";

export type RdapErrorCode =
  | "INVALID_QUERY"
  | "UNSUPPORTED_QUERY"
  | "BOOTSTRAP_NOT_FOUND"
  | "BOOTSTRAP_UNAVAILABLE"
  | "CONFIGURATION_ERROR"
  | "HTTP_ERROR"
  | "REQUEST_FAILED";

export interface RdapErrorDetails {
  code: RdapErrorCode;
  status?: number;
  retryable?: boolean;
  queryType?: RdapQueryType;
  query?: string;
  bootstrapType?: RdapBootstrapType;
  cause?: unknown;
}

export class RdapError extends Error {
  readonly code: RdapErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly queryType?: RdapQueryType;
  readonly query?: string;
  readonly bootstrapType?: RdapBootstrapType;

  constructor(message: string, details: RdapErrorDetails) {
    super(message, { cause: details.cause });
    this.name = "RdapError";
    this.code = details.code;
    this.status = details.status ?? 500;
    this.retryable = details.retryable ?? false;
    this.queryType = details.queryType;
    this.query = details.query;
    this.bootstrapType = details.bootstrapType;
  }
}

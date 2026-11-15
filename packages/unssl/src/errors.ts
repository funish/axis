export type SSLErrorCode =
  | "invalid_request"
  | "unauthorized"
  | "not_found"
  | "rate_limited"
  | "challenge_failed"
  | "not_supported"
  | "network"
  | "provider_error"
  | "key_storage"
  | "disposed";

export interface SSLErrorOptions {
  code: SSLErrorCode;
  provider?: string;
  status?: number;
  retryable?: boolean;
  details?: unknown;
  cause?: unknown;
  nonce?: string;
}

export class SSLError extends Error {
  readonly code: SSLErrorCode;
  readonly provider?: string;
  readonly status?: number;
  readonly retryable: boolean;
  readonly details?: unknown;
  readonly nonce?: string;

  constructor(message: string, options: SSLErrorOptions) {
    super(message, { cause: options.cause });
    this.name = "SSLError";
    this.code = options.code;
    this.provider = options.provider;
    this.status = options.status;
    this.retryable =
      options.retryable ?? (options.code === "network" || options.code === "rate_limited");
    this.details = options.details;
    this.nonce = options.nonce;
  }
}

export function notSupported(operation: string, provider?: string): SSLError {
  return new SSLError(`Operation is not supported: ${operation}`, {
    code: "not_supported",
    provider,
  });
}

export function classifyHttpError(
  status: number,
  provider: string,
  details?: unknown,
  nonce?: string,
): SSLError {
  const code =
    status === 400
      ? "invalid_request"
      : status === 401 || status === 403
        ? "unauthorized"
        : status === 404
          ? "not_found"
          : status === 429
            ? "rate_limited"
            : "provider_error";

  const problem = details as { detail?: string; type?: string } | undefined;
  return new SSLError(problem?.detail || `Provider request failed with status ${status}`, {
    code,
    provider,
    status,
    details,
    nonce,
    retryable: status === 429 || status >= 500,
  });
}

export function wrapUnknownError(error: unknown, provider?: string): SSLError {
  if (error instanceof SSLError) {
    return error;
  }
  return new SSLError(error instanceof Error ? error.message : String(error), {
    code: "provider_error",
    provider,
    cause: error,
  });
}

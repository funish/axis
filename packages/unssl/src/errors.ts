export type UnsslErrorCode =
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

export interface UnsslErrorOptions {
  code: UnsslErrorCode;
  provider?: string;
  status?: number;
  retryable?: boolean;
  details?: unknown;
  cause?: unknown;
}

export class UnsslError extends Error {
  readonly code: UnsslErrorCode;
  readonly provider?: string;
  readonly status?: number;
  readonly retryable: boolean;
  readonly details?: unknown;

  constructor(message: string, options: UnsslErrorOptions) {
    super(message, { cause: options.cause });
    this.name = "UnsslError";
    this.code = options.code;
    this.provider = options.provider;
    this.status = options.status;
    this.retryable =
      options.retryable ??
      (options.code === "network" || options.code === "rate_limited");
    this.details = options.details;
  }
}

export function notSupported(operation: string, provider?: string): UnsslError {
  return new UnsslError(`Operation is not supported: ${operation}`, {
    code: "not_supported",
    provider,
  });
}

export function classifyHttpError(
  status: number,
  provider: string,
  details?: unknown,
): UnsslError {
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

  return new UnsslError(`Provider request failed with status ${status}`, {
    code,
    provider,
    status,
    details,
    retryable: status === 429 || status >= 500,
  });
}

export function wrapUnknownError(
  error: unknown,
  provider?: string,
): UnsslError {
  if (error instanceof UnsslError) {
    return error;
  }
  return new UnsslError(
    error instanceof Error ? error.message : String(error),
    {
      code: "provider_error",
      provider,
      cause: error,
    },
  );
}

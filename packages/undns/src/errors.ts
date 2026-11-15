export const UNDNS_ERROR_CODES = {
  unsupportedOperation: "unsupported_operation",
  unsupportedRecordType: "unsupported_record_type",
  zoneNotFound: "zone_not_found",
  recordNotFound: "record_not_found",
  nameNotFound: "name_not_found",
  providerError: "provider_error",
  invalidProviderResponse: "invalid_provider_response",
  invalidDnsMessage: "invalid_dns_message",
  batchPartialFailure: "batch_partial_failure",
} as const;

export type UndnsErrorCode = (typeof UNDNS_ERROR_CODES)[keyof typeof UNDNS_ERROR_CODES];

export interface UndnsErrorOptions extends ErrorOptions {
  /** Provider that produced the wrapped failure, when known. */
  provider?: string;
  /** HTTP or DNS status returned by the provider, when available. */
  status?: number;
  /** The provider's unchanged message, when available. */
  providerMessage?: string;
  /** Stable, provider-specific metadata useful to callers. */
  details?: Record<string, unknown>;
}

export class UndnsError extends Error {
  readonly code: UndnsErrorCode;
  readonly provider?: string;
  readonly status?: number;
  readonly providerMessage?: string;
  readonly details?: Record<string, unknown>;

  constructor(code: UndnsErrorCode, message: string, options: UndnsErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "UndnsError";
    this.code = code;
    this.provider = options.provider;
    this.status = options.status;
    this.providerMessage = options.providerMessage;
    this.details = options.details;
  }
}

function statusOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const candidate = error as { status?: unknown; statusCode?: unknown };
  const status = typeof candidate.status === "number" ? candidate.status : candidate.statusCode;
  return typeof status === "number" && Number.isFinite(status) ? status : undefined;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : String(error);
}

export function isUndnsError(error: unknown): error is UndnsError {
  return error instanceof UndnsError;
}

/** Wrap an unknown provider failure without losing its message, status, or cause. */
export function toUndnsError(
  error: unknown,
  fallbackMessage: string,
  options: { code?: UndnsErrorCode; provider?: string; details?: Record<string, unknown> } = {},
): UndnsError {
  if (error instanceof UndnsError) return error;

  const providerMessage = messageOf(error);
  const status = statusOf(error);
  const message = options.provider
    ? `${options.provider}: ${providerMessage || fallbackMessage}`
    : providerMessage || fallbackMessage;

  return new UndnsError(options.code ?? UNDNS_ERROR_CODES.providerError, message, {
    cause: error,
    provider: options.provider,
    status,
    providerMessage: providerMessage || undefined,
    details: options.details,
  });
}

/**
 * Provider errors are distinct from successful responses with missing fields.
 */

export class GeoIPProviderError extends Error {
  readonly provider: string;

  constructor(provider: string, message?: string, cause?: unknown) {
    super(message || `${provider} request failed`);
    this.name = "GeoIPProviderError";
    this.provider = provider;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

export function createProviderError(provider: string, error: unknown): GeoIPProviderError {
  if (error instanceof GeoIPProviderError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  return new GeoIPProviderError(provider, message, error);
}

export function isGeoIPProviderError(error: unknown): error is GeoIPProviderError {
  return error instanceof GeoIPProviderError;
}

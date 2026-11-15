import { classifyHttpError, SSLError } from "../errors";
import type {
  CertificateRequest,
  DriverOptions,
  HttpFetch,
  IssuedCertificate,
  SSLDriver,
} from "../types";

export interface CloudflareOriginCaDriverOptions extends DriverOptions {
  /** API token with Zone > SSL and Certificates > Edit permission. */
  apiToken?: string;
  /** Legacy Cloudflare Origin CA key, beginning with v1.0-. */
  originCaKey?: string;
  baseUrl?: string;
  fetch?: HttpFetch;
  requestType?: "origin-rsa" | "origin-ecc" | "keyless-certificate";
  requestedValidity?: 7 | 30 | 90 | 365 | 730 | 1095 | 5475;
}

interface CloudflareResponse<T> {
  success: boolean;
  result?: T;
  errors?: Array<{ code?: number; message: string }>;
  messages?: string[];
}

interface CloudflareOriginCertificate {
  id: string;
  certificate: string;
  csr?: string;
  hostnames: string[];
  expires_on: string;
  request_type: string;
  requested_validity: number;
}

const allowedValidity = [7, 30, 90, 365, 730, 1095, 5475] as const;
export default function cloudflareOriginCaDriver(
  options: CloudflareOriginCaDriverOptions,
): SSLDriver<CloudflareOriginCaDriverOptions> {
  const provider = "cloudflare-origin-ca";
  const baseUrl = options.baseUrl || "https://api.cloudflare.com/client/v4";
  const fetch = options.fetch || globalThis.fetch;

  if (!options.apiToken && !options.originCaKey) {
    throw new SSLError("Cloudflare Origin CA driver requires apiToken or originCaKey", {
      code: "invalid_request",
      provider,
    });
  }

  function headers(body: unknown): RequestInit {
    return {
      method: body === undefined ? "GET" : "POST",
      headers: {
        accept: "application/json",
        ...(options.apiToken && { authorization: `Bearer ${options.apiToken}` }),
        ...(options.originCaKey && { "x-auth-user-service-key": options.originCaKey }),
        ...(body !== undefined && { "content-type": "application/json" }),
      } as Record<string, string>,
      ...(body !== undefined && { body: JSON.stringify(body) }),
    };
  }

  async function apiRequest<T>(path: string, body?: unknown, method?: string): Promise<T> {
    const init = headers(body);
    if (method) init.method = method;
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, init);
    } catch (error) {
      throw new SSLError(`Unable to connect to Cloudflare: ${path}`, {
        code: "network",
        provider,
        cause: error,
        retryable: true,
      });
    }

    const text = await response.text();
    let payload: CloudflareResponse<T>;
    try {
      payload = JSON.parse(text) as CloudflareResponse<T>;
    } catch (error) {
      throw new SSLError("Cloudflare returned an invalid JSON response", {
        code: "provider_error",
        provider,
        cause: error,
        details: text,
      });
    }

    const providerError = payload.errors?.[0];
    if (!response.ok || !payload.success) {
      const classified = classifyHttpError(response.status, provider, payload.errors);
      throw new SSLError(providerError?.message || classified.message, {
        code: classified.code,
        provider,
        status: response.status,
        retryable: classified.retryable,
        details: payload,
      });
    }
    if (!payload.result) {
      throw new SSLError("Cloudflare response has no result", {
        code: "provider_error",
        provider,
        details: payload,
      });
    }
    return payload.result;
  }

  function validityDays(
    request: CertificateRequest,
  ): CloudflareOriginCaDriverOptions["requestedValidity"] {
    const requested = options.requestedValidity || request.validityDays || 90;
    return allowedValidity.reduce((best, current) =>
      Math.abs(current - requested) < Math.abs(best - requested) ? current : best,
    );
  }

  function mapCertificate(certificate: CloudflareOriginCertificate): IssuedCertificate {
    return {
      id: certificate.id,
      certificatePem: certificate.certificate,
      privateKeyRef: `cloudflare-origin-key-${certificate.id}`,
      identifiers: certificate.hostnames,
      status: "issued",
      expiresAt: certificate.expires_on,
      metadata: {
        provider,
        requestType: certificate.request_type,
        requestedValidity: String(certificate.requested_validity),
      },
    };
  }

  async function issue(request: CertificateRequest): Promise<IssuedCertificate> {
    if (!request.identifiers.length) {
      throw new SSLError("At least one Cloudflare hostname is required", {
        code: "invalid_request",
        provider,
      });
    }
    const certificate = await apiRequest<CloudflareOriginCertificate>("/certificates", {
      csr: request.csrPem,
      hostnames: request.identifiers,
      request_type: options.requestType || "origin-rsa",
      requested_validity: validityDays(request),
    });
    return mapCertificate(certificate);
  }

  function requireRenewalCsr(request?: Partial<CertificateRequest>): string {
    if (!request?.csrPem) {
      throw new SSLError("Cloudflare Origin CA renewal requires a new CSR", {
        code: "invalid_request",
        provider,
      });
    }
    return request.csrPem;
  }

  return {
    name: provider,
    options,

    issue,

    async renew(certificate, request) {
      return issue({
        identifiers: request?.identifiers || certificate.identifiers,
        csrPem: requireRenewalCsr(request),
        validityDays: request?.validityDays,
        metadata: { ...certificate.metadata, ...request?.metadata },
      });
    },

    async revoke(request) {
      if (!request.certificateId) {
        throw new SSLError("Cloudflare revocation requires certificateId", {
          code: "invalid_request",
          provider,
        });
      }
      const reason = request.reason || "unspecified";
      if (
        reason !== "unspecified" &&
        reason !== "keyCompromise" &&
        reason !== "cessationOfOperation"
      ) {
        throw new SSLError("Cloudflare Origin CA revocation does not accept this reason", {
          code: "invalid_request",
          provider,
          details: { reason },
        });
      }
      await apiRequest<{ id: string }>(
        `/certificates/${encodeURIComponent(request.certificateId)}`,
        undefined,
        "DELETE",
      );
    },

    async getDeploymentMetadata(certificateId) {
      const certificate = await apiRequest<CloudflareOriginCertificate>(
        `/certificates/${encodeURIComponent(certificateId)}`,
      );
      return {
        certificateId: certificate.id,
        provider,
        properties: {
          hostnames: certificate.hostnames.join(","),
          requestType: certificate.request_type,
          requestedValidity: String(certificate.requested_validity),
        },
      };
    },

    async dispose() {},
  };
}

import { classifyHttpError, UnsslError } from "../errors";
import type {
  CertificateChallenge,
  CertificateRequest,
  DnsCnameValidationChallenge,
  DriverOptions,
  HttpFetch,
  HttpFileValidationChallenge,
  IssuedCertificate,
  RevokeReason,
  UnsslDriver,
} from "../types";

export interface ZeroSslDriverOptions extends DriverOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: HttpFetch;
  strictDomains?: boolean;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

interface ZeroSslError {
  code?: number;
  type?: string;
  detail?: string;
}

interface ZeroSslValidation {
  file_validation_url_http?: string;
  file_validation_url_https?: string;
  file_validation_content?: string[];
  cname_validation_p1?: string;
  cname_validation_p2?: string;
}

interface ZeroSslCertificate {
  id: string;
  common_name: string;
  additional_domains?: string;
  created?: string;
  expires?: string;
  status: "draft" | "pending_validation" | "issued" | "cancelled" | "revoked" | "expired";
  validation?: {
    other_methods?: Record<string, ZeroSslValidation>;
  };
}

interface ZeroSslDownload {
  "certificate.crt": string;
  "ca_bundle.crt": string;
}

const reasonNames: Record<RevokeReason, string> = {
  unspecified: "Unspecified",
  keyCompromise: "keyCompromise",
  caCompromise: "caCompromise",
  affiliationChanged: "affiliationChanged",
  superseded: "Superseded",
  cessationOfOperation: "cessationOfOperation",
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeDate(value?: string): string | undefined {
  if (!value) return undefined;
  return new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`).toISOString();
}

function parseJson<T>(provider: string, body: string): T {
  try {
    return JSON.parse(body) as T;
  } catch (error) {
    throw new UnsslError("Provider returned an invalid JSON response", {
      code: "provider_error",
      provider,
      cause: error,
      details: body,
    });
  }
}

function certificateChallenges(certificate: ZeroSslCertificate): CertificateChallenge[] {
  const methods = certificate.validation?.other_methods || {};
  const challenges: CertificateChallenge[] = [];

  for (const [identifier, validation] of Object.entries(methods)) {
    if (validation.file_validation_url_http && validation.file_validation_content) {
      const url = new URL(validation.file_validation_url_http);
      challenges.push({
        type: "http-file",
        identifier,
        url: validation.file_validation_url_http,
        path: url.pathname,
        content: validation.file_validation_content.join("\n"),
      } satisfies HttpFileValidationChallenge);
    }
    if (validation.cname_validation_p1 && validation.cname_validation_p2) {
      challenges.push({
        type: "dns-cname",
        identifier,
        recordName: validation.cname_validation_p1,
        recordValue: validation.cname_validation_p2,
      } satisfies DnsCnameValidationChallenge);
    }
  }
  return challenges;
}

function mapCertificate(certificate: ZeroSslCertificate, provider: string): IssuedCertificate {
  const status: IssuedCertificate["status"] =
    certificate.status === "issued"
      ? "issued"
      : certificate.status === "revoked"
        ? "revoked"
        : certificate.status === "expired"
          ? "expired"
          : "pending";

  return {
    id: certificate.id,
    certificatePem: "",
    privateKeyRef: `zerossl-key-${certificate.id}`,
    identifiers: [
      certificate.common_name,
      ...(certificate.additional_domains || "").split(","),
    ].filter(Boolean),
    status,
    expiresAt: normalizeDate(certificate.expires),
    metadata: { provider, status: certificate.status },
  };
}

export default function zeroSslDriver(
  options: ZeroSslDriverOptions,
): UnsslDriver<ZeroSslDriverOptions> {
  const provider = "zerossl";
  const baseUrl = options.baseUrl || "https://api.zerossl.com";
  const fetch = options.fetch || globalThis.fetch;
  const intervalMs = options.pollIntervalMs || 2000;
  const timeoutMs = options.timeoutMs || 600_000;

  async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
          authorization: `ApiKey ${options.apiKey}`,
          ...(init?.body && { "content-type": "application/json" }),
        },
      });
    } catch (error) {
      throw new UnsslError(`Unable to connect to ZeroSSL: ${path}`, {
        code: "network",
        provider,
        cause: error,
        retryable: true,
      });
    }

    const body = await response.text();
    const parsed = parseJson<Record<string, unknown> | { error?: ZeroSslError }>(provider, body);
    if (!response.ok || (parsed as { success?: boolean })?.success === false) {
      const error = (parsed as { error?: ZeroSslError }).error;
      const classified = classifyHttpError(response.status, provider, error || parsed);
      throw new UnsslError(error?.detail || classified.message, {
        code: classified.code,
        provider,
        status: response.status,
        retryable: classified.retryable,
        details: parsed,
        cause: error,
      });
    }
    return parsed as T;
  }

  async function getCertificate(id: string): Promise<ZeroSslCertificate> {
    return apiRequest<ZeroSslCertificate>(`/certificates/${encodeURIComponent(id)}`);
  }

  async function download(id: string): Promise<{ certificatePem: string; chainPem: string }> {
    const result = await apiRequest<ZeroSslDownload>(
      `/certificates/${encodeURIComponent(id)}/download/json`,
    );
    return {
      certificatePem: result["certificate.crt"],
      chainPem: result["ca_bundle.crt"],
    };
  }

  async function waitForCertificate(id: string): Promise<ZeroSslCertificate> {
    const started = Date.now();
    let certificate = await getCertificate(id);

    while (!["issued", "revoked", "expired", "cancelled"].includes(certificate.status)) {
      if (Date.now() - started > timeoutMs) {
        throw new UnsslError("Timed out waiting for ZeroSSL validation", {
          code: "challenge_failed",
          provider,
          details: certificate,
        });
      }
      await sleep(intervalMs);
      certificate = await getCertificate(id);
    }

    if (certificate.status !== "issued") {
      throw new UnsslError(`ZeroSSL certificate status is ${certificate.status}`, {
        code:
          certificate.status === "pending_validation" || certificate.status === "draft"
            ? "challenge_failed"
            : "provider_error",
        provider,
        details: certificate,
      });
    }
    return certificate;
  }

  async function issueCertificate(request: CertificateRequest): Promise<IssuedCertificate> {
    const validityDays = request.validityDays || 90;
    if (![90, 200, 365].includes(validityDays)) {
      throw new UnsslError("ZeroSSL supports validity periods of 90, 200, or 365 days", {
        code: "invalid_request",
        provider,
        details: { validityDays },
      });
    }

    const certificate = await apiRequest<ZeroSslCertificate>("/certificates", {
      method: "POST",
      body: JSON.stringify({
        certificate_domains: request.identifiers.join(","),
        certificate_csr: request.csrPem,
        certificate_validity_days: validityDays,
        strict_domains: options.strictDomains ? 1 : undefined,
        replacement_for_certificate: request.metadata?.replacementFor,
      }),
    });

    const validationOptions = request.validation || {};
    const challenges = certificateChallenges(certificate);
    const preferred = validationOptions.method || "http-file";
    const selected = challenges.filter((challenge) =>
      preferred === "dns-cname" ? challenge.type === "dns-cname" : challenge.type === "http-file",
    );

    if (selected.length === 0) {
      throw new UnsslError("ZeroSSL did not return HTTP-file or DNS-CNAME validation data", {
        code: "provider_error",
        provider,
        details: certificate.validation,
      });
    }
    if (!validationOptions.onValidation) {
      throw new UnsslError(
        "request.validation.onValidation is required by the ZeroSSL REST driver",
        {
          code: "invalid_request",
          provider,
        },
      );
    }

    await validationOptions.onValidation(selected);
    await apiRequest<{ success: number }>(`/certificates/${certificate.id}/challenges`, {
      method: "POST",
      body: JSON.stringify({
        validation_method: preferred === "dns-cname" ? "CNAME_CSR_HASH" : "HTTP_CSR_HASH",
      }),
    });
    const issued = await waitForCertificate(certificate.id);
    const downloaded = await download(certificate.id);
    await validationOptions.onValidationComplete?.(selected);

    return {
      ...mapCertificate(issued, provider),
      certificatePem: downloaded.certificatePem,
      chainPem: downloaded.chainPem,
      metadata: {
        ...request.metadata,
        provider,
        status: issued.status,
        ...(request.metadata?.replacementFor && {
          replacementFor: request.metadata.replacementFor,
        }),
      },
    };
  }

  function requireRenewalCsr(request?: Partial<CertificateRequest>): string {
    if (!request?.csrPem) {
      throw new UnsslError("ZeroSSL renewal requires a new CSR", {
        code: "invalid_request",
        provider,
      });
    }
    return request.csrPem;
  }

  return {
    name: provider,
    options,

    issue: issueCertificate,

    async renew(certificate, request) {
      return issueCertificate({
        identifiers: request?.identifiers || certificate.identifiers,
        csrPem: requireRenewalCsr(request),
        validityDays: request?.validityDays || 90,
        metadata: {
          ...certificate.metadata,
          ...request?.metadata,
          replacementFor: request?.metadata?.replacementFor || certificate.id,
        },
        validation: request?.validation,
      });
    },

    async revoke(request) {
      if (!request.certificateId) {
        throw new UnsslError("ZeroSSL revocation requires certificateId", {
          code: "invalid_request",
          provider,
        });
      }
      await apiRequest<{ success: number }>(`/certificates/${request.certificateId}/revoke`, {
        method: "POST",
        body: JSON.stringify({ reason: reasonNames[request.reason || "unspecified"] }),
      });
    },

    async getDeploymentMetadata(certificateId) {
      const certificate = await getCertificate(certificateId);
      return {
        certificateId: certificate.id,
        provider,
        properties: {
          status: certificate.status,
          commonName: certificate.common_name,
          additionalDomains: certificate.additional_domains || "",
          expiresAt: normalizeDate(certificate.expires) || "",
        },
      };
    },

    async dispose() {},
  };
}

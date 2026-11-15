import { createHash } from "node:crypto";

import { AcmeClient, accountJwkThumbprint, createChallengeFromKeyAuthorization } from "../acme";
import { UnsslError } from "../errors";
import type {
  AcmeAuthorization,
  AcmeChallenge,
  AcmeExternalAccountBinding,
  CertificateChallenge,
  CertificateRequest,
  ChallengeRequest,
  ChallengeType,
  DriverOptions,
  HttpFetch,
  IssuedCertificate,
  JwsSigner,
  NonceStore,
  RevokeRequest,
  UnsslDriver,
} from "../types";

export interface AcmeDriverOptions extends DriverOptions {
  provider: string;
  directoryUrl: string;
  fetch?: HttpFetch;
  signer?: JwsSigner;
  nonceStore?: NonceStore;
  accountUrl?: string;
  accountJwk?: Record<string, unknown>;
  contacts?: string[];
  externalAccount?: AcmeExternalAccountBinding;
  preferredChallenge?: ChallengeType;
  privateKeyRef?: string;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isKnownChallenge(
  challenge: AcmeChallenge,
): challenge is AcmeChallenge & { type: ChallengeType } {
  return challenge.type === "http-01" || challenge.type === "dns-01";
}

function selectChallenge(
  authorization: AcmeAuthorization,
  preferred: ChallengeType,
): AcmeChallenge & { type: ChallengeType } {
  const known = (authorization.challenges || []).filter(isKnownChallenge);
  const challenge =
    known.find((candidate) => candidate.type === preferred) ||
    (authorization.wildcard ? known.find((candidate) => candidate.type === "dns-01") : undefined) ||
    known[0];

  if (!challenge) {
    throw new UnsslError(
      `No supported HTTP-01 or DNS-01 challenge for ${authorization.identifier.value}`,
      { code: "challenge_failed", provider: "acme", details: authorization },
    );
  }
  return challenge;
}

async function waitFor<T>(
  initial: T,
  refresh: () => Promise<T>,
  read: (value: T) => { status?: string; error?: { type?: string; detail?: string } },
  options: { intervalMs: number; timeoutMs: number; provider: string; label: string },
): Promise<T> {
  const started = Date.now();
  let current = initial;
  let status = read(current).status;

  while (status !== "valid" && status !== "invalid") {
    if (Date.now() - started > options.timeoutMs) {
      throw new UnsslError(`Timed out waiting for ${options.label}`, {
        code: "challenge_failed",
        provider: options.provider,
        details: current,
      });
    }
    await sleep(options.intervalMs);
    current = await refresh();
    status = read(current).status;
  }

  const failure = read(current).error;
  if (status === "invalid") {
    throw new UnsslError(`${options.label} failed`, {
      code: "challenge_failed",
      provider: options.provider,
      details: current,
      ...(failure && {
        cause: new Error(`${failure.type}: ${failure.detail || "authorization error"}`),
      }),
    });
  }
  return current;
}

export default function acmeDriver(options: AcmeDriverOptions): UnsslDriver<AcmeDriverOptions> {
  const client = new AcmeClient({
    directoryUrl: options.directoryUrl,
    provider: options.provider,
    fetch: options.fetch,
    signer: options.signer,
    nonceStore: options.nonceStore,
    accountUrl: options.accountUrl,
    accountJwk: options.accountJwk,
    contacts: options.contacts,
    externalAccount: options.externalAccount,
  });

  async function issueCertificate(
    request: CertificateRequest,
    renewalOf?: string,
  ): Promise<IssuedCertificate> {
    if (!options.signer || !options.accountJwk) {
      throw new UnsslError("ACME issuance requires signer and accountJwk", {
        code: "invalid_request",
        provider: options.provider,
      });
    }

    const issueOptions = request.acme || {};
    const preferred = issueOptions.preferredChallenge || options.preferredChallenge || "http-01";
    const intervalMs = issueOptions.pollIntervalMs || options.pollIntervalMs || 1000;
    const timeoutMs = issueOptions.timeoutMs || options.timeoutMs || 120_000;

    let order = await client.newOrder({ identifiers: request.identifiers });
    const authorizationUrls = order.authorizations || [];

    for (const authorizationUrl of authorizationUrls) {
      let authorization = await client.getAuthorization(authorizationUrl);
      if (authorization.status === "valid") continue;
      const selected = selectChallenge(authorization, preferred);
      const keyAuthorization = createChallengeFromKeyAuthorization(
        authorization.identifier.value,
        selected.type,
        `${selected.token}.${accountJwkThumbprint(options.accountJwk || {})}`,
      );

      if (!issueOptions.onChallenge) {
        throw new UnsslError(
          "request.acme.onChallenge is required for pending ACME authorizations",
          {
            code: "invalid_request",
            provider: options.provider,
          },
        );
      }

      await issueOptions.onChallenge(keyAuthorization);
      await client.updateChallenge(selected.url);
      authorization = await waitFor(
        authorization,
        () => client.getAuthorization(authorizationUrl),
        (value) => value,
        {
          intervalMs,
          timeoutMs,
          provider: options.provider,
          label: `${selected.type} authorization for ${authorization.identifier.value}`,
        },
      );
      await issueOptions.onChallengeComplete?.(keyAuthorization);
    }

    order = await client.refreshOrder(order);
    if (order.status === "ready") {
      order = await client.finalizeOrder(order, request.csrPem);
    }

    order = await waitFor(
      order,
      () => client.refreshOrder(order),
      (value) => value,
      { intervalMs, timeoutMs, provider: options.provider, label: "certificate order" },
    );

    const certificatePem = await client.certificate(order);
    const id = createHash("sha256").update(certificatePem).digest("hex").slice(0, 32);
    const privateKeyRef =
      options.privateKeyRef || request.metadata?.privateKeyRef || `acme-key-${id}`;

    return {
      id,
      certificatePem,
      privateKeyRef,
      identifiers: request.identifiers,
      status: "issued",
      expiresAt: order.expires,
      metadata: {
        ...request.metadata,
        provider: options.provider,
        directoryUrl: options.directoryUrl,
        orderUrl: order.url || "",
        ...(renewalOf && { renewalOf }),
      },
    };
  }

  function requireRenewalCsr(request?: Partial<CertificateRequest>): string {
    if (!request?.csrPem) {
      throw new UnsslError("ACME renewal requires a new CSR", {
        code: "invalid_request",
        provider: options.provider,
      });
    }
    return request.csrPem;
  }

  return {
    name: options.provider,
    options,

    async issue(request) {
      return issueCertificate(request);
    },

    async renew(certificate, request) {
      return issueCertificate(
        {
          identifiers: request?.identifiers || certificate.identifiers,
          csrPem: requireRenewalCsr(request),
          validityDays: request?.validityDays,
          metadata: { ...certificate.metadata, ...request?.metadata },
          acme: request?.acme,
        },
        certificate.id,
      );
    },

    async revoke(request: RevokeRequest) {
      if (!request.certificatePem) {
        throw new UnsslError("ACME revocation requires certificatePem", {
          code: "invalid_request",
          provider: options.provider,
        });
      }
      await client.revoke(request.certificatePem, request.reason);
    },

    async createChallenge(request: ChallengeRequest): Promise<CertificateChallenge> {
      if (request.keyAuthorization) {
        return createChallengeFromKeyAuthorization(
          request.identifier,
          request.type,
          request.keyAuthorization,
        );
      }
      if (!request.token || !options.accountJwk) {
        throw new UnsslError(
          "ACME challenge derivation requires keyAuthorization or token and accountJwk",
          {
            code: "invalid_request",
            provider: options.provider,
          },
        );
      }
      return createChallengeFromKeyAuthorization(
        request.identifier,
        request.type,
        `${request.token}.${accountJwkThumbprint(options.accountJwk)}`,
      );
    },

    async dispose() {},
  };
}

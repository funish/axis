import { createHash, createHmac } from "node:crypto";

import { classifyHttpError, UnsslError } from "./errors";
import type {
  AcmeAuthorization,
  AcmeChallenge,
  AcmeDirectory,
  AcmeExternalAccountBinding,
  AcmeJws,
  AcmeOrder,
  AcmeProtectedHeader,
  ChallengeType,
  CertificateChallenge,
  HttpFetch,
  JwsSigner,
  NonceStore,
  RevokeReason,
} from "./types";

export function encodeBase64Url(value: string | Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

export function dns01RecordName(identifier: string): string {
  return `_acme-challenge.${identifier.replace(/\.$/, "")}`;
}

export function dns01RecordValue(keyAuthorization: string): string {
  return createHash("sha256").update(keyAuthorization).digest("base64url");
}

export function pemToBase64UrlDer(pem: string): string {
  const base64 = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  if (!base64) {
    throw new UnsslError("PEM input does not contain DER data", {
      code: "invalid_request",
      provider: "acme",
    });
  }
  return Buffer.from(base64, "base64").toString("base64url");
}

export function http01Path(keyAuthorization: string): string {
  return `/.well-known/acme-challenge/${keyAuthorization.split(".")[0]}`;
}

export function createChallengeFromKeyAuthorization(
  identifier: string,
  type: ChallengeType,
  keyAuthorization: string,
): CertificateChallenge {
  const cleanIdentifier = identifier.replace(/\.$/, "");
  const token = keyAuthorization.split(".")[0];
  if (type === "http-01") {
    return {
      type,
      identifier: cleanIdentifier,
      token,
      keyAuthorization,
      content: keyAuthorization,
      path: http01Path(keyAuthorization),
    };
  }
  return {
    type,
    identifier: cleanIdentifier,
    token,
    keyAuthorization,
    recordName: dns01RecordName(cleanIdentifier),
    recordValue: dns01RecordValue(keyAuthorization),
  };
}

export function accountJwkThumbprint(accountJwk: Record<string, unknown>): string {
  const keys = Object.keys(accountJwk)
    .filter((key) => ["crv", "e", "kty", "n", "x", "y"].includes(key))
    .sort();
  if (keys.length === 0) {
    throw new UnsslError(
      "accountJwk must contain EC (crv/x/y) or RSA (e/kty/n) fields for ACME challenges",
      { code: "invalid_request", provider: "acme" },
    );
  }
  const canonical: Record<string, unknown> = {};
  for (const key of keys) canonical[key] = accountJwk[key];
  return createHash("sha256").update(JSON.stringify(canonical)).digest("base64url");
}

export class MemoryNonceStore implements NonceStore {
  #nonces: string[] = [];

  async take(): Promise<string | undefined> {
    return this.#nonces.shift();
  }

  async put(nonce: string): Promise<void> {
    this.#nonces.push(nonce);
  }
}

export interface AcmeClientOptions {
  directoryUrl: string;
  fetch?: HttpFetch;
  signer?: JwsSigner;
  nonceStore?: NonceStore;
  accountUrl?: string;
  accountJwk?: Record<string, unknown>;
  contacts?: string[];
  externalAccount?: AcmeExternalAccountBinding;
  provider?: string;
}

const revokeReasonCodes: Record<RevokeReason, number> = {
  unspecified: 0,
  keyCompromise: 1,
  caCompromise: 2,
  affiliationChanged: 3,
  superseded: 4,
  cessationOfOperation: 5,
};

const hmacAlgorithms = {
  HS256: "sha256",
  HS384: "sha384",
  HS512: "sha512",
} as const;

export class AcmeClient {
  readonly directoryUrl: string;
  readonly provider: string;
  readonly nonceStore: NonceStore;
  readonly contacts: string[];
  readonly externalAccount?: AcmeExternalAccountBinding;
  #fetch: HttpFetch;
  #signer?: JwsSigner;
  #accountUrl?: string;
  #accountJwk?: Record<string, unknown>;
  #directory?: AcmeDirectory;

  constructor(options: AcmeClientOptions) {
    this.directoryUrl = options.directoryUrl;
    this.provider = options.provider || "acme";
    this.nonceStore = options.nonceStore || new MemoryNonceStore();
    this.contacts = options.contacts || [];
    this.externalAccount = options.externalAccount;
    this.#fetch = options.fetch || globalThis.fetch;
    this.#signer = options.signer;
    this.#accountUrl = options.accountUrl;
    this.#accountJwk = options.accountJwk;
  }

  get accountUrl(): string | undefined {
    return this.#accountUrl;
  }

  private async request(
    url: string,
    init?: RequestInit,
    expectedStatus?: number[],
  ): Promise<Response> {
    let response: Response;
    try {
      response = await this.#fetch(url, init);
    } catch (error) {
      throw new UnsslError(`Unable to connect to ACME endpoint: ${url}`, {
        code: "network",
        provider: this.provider,
        cause: error,
        retryable: true,
      });
    }

    if (!response.ok || (expectedStatus && !expectedStatus.includes(response.status))) {
      let details: unknown;
      try {
        details = await response.json();
      } catch {
        details = await response.text();
      }
      const problem = details as { type?: string } | undefined;
      const isBadNonce =
        typeof problem?.type === "string" &&
        (problem.type === "urn:ietf:params:acme:error:badNonce" ||
          problem.type.endsWith(":badNonce"));
      const replayNonce = response.headers.get("replay-nonce") || undefined;
      if (isBadNonce) {
        throw classifyHttpError(response.status, this.provider, details, replayNonce);
      }
      throw classifyHttpError(response.status, this.provider, details);
    }
    return response;
  }

  async directory(): Promise<AcmeDirectory> {
    if (this.#directory) return this.#directory;
    const response = await this.request(this.directoryUrl, { method: "GET" });
    const directory = (await response.json()) as AcmeDirectory;
    if (!directory.newNonce || !directory.newAccount || !directory.newOrder) {
      throw new UnsslError("ACME directory is missing required endpoints", {
        code: "provider_error",
        provider: this.provider,
        details: directory,
      });
    }
    this.#directory = directory;
    return directory;
  }

  async newNonce(): Promise<string> {
    const directory = await this.directory();
    const response = await this.request(directory.newNonce, { method: "HEAD" });
    const nonce = response.headers.get("replay-nonce");
    if (!nonce) {
      throw new UnsslError("ACME nonce response did not include Replay-Nonce", {
        code: "provider_error",
        provider: this.provider,
        status: response.status,
      });
    }
    return nonce;
  }

  async #postAsGet(url: string): Promise<Response> {
    return this.signedRequest(url, {}, { expectedStatus: [200] });
  }

  private async signedRequest(
    url: string,
    payload: object,
    options: { accountKey?: boolean; expectedStatus?: number[] } = {},
  ): Promise<Response> {
    if (!this.#signer) {
      throw new UnsslError("ACME requests require an injected JWS signer", {
        code: "not_supported",
        provider: this.provider,
      });
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      const nonce = (await this.nonceStore.take()) || (await this.newNonce());
      const header: AcmeProtectedHeader = { alg: this.#signer.alg, nonce, url };
      if (options.accountKey) {
        if (!this.#accountJwk) {
          throw new UnsslError("New ACME account requests require accountJwk", {
            code: "invalid_request",
            provider: this.provider,
          });
        }
        header.jwk = this.#accountJwk;
      } else {
        await this.account();
        if (!this.#accountUrl) {
          throw new UnsslError("ACME account URL is unavailable", {
            code: "provider_error",
            provider: this.provider,
          });
        }
        header.kid = this.#accountUrl;
      }

      const payloadJson = JSON.stringify(payload);
      const signature = await this.#signer.sign(header, payloadJson);
      const jws: AcmeJws = {
        protected: encodeBase64Url(JSON.stringify(header)),
        payload: encodeBase64Url(payloadJson),
        signature: signature.signature,
      };

      let response: Response;
      try {
        response = await this.request(
          url,
          {
            method: "POST",
            headers: { "content-type": "application/jose+json" },
            body: JSON.stringify(jws),
          },
          options.expectedStatus,
        );
      } catch (error) {
        const nonce = error instanceof UnsslError ? error.nonce : undefined;
        if (nonce && attempt < 2) {
          await this.nonceStore.put(nonce);
          continue;
        }
        throw error;
      }
      const nextNonce = response.headers.get("replay-nonce");
      if (nextNonce) await this.nonceStore.put(nextNonce);
      return response;
    }

    throw new UnsslError("ACME server repeatedly rejected the replay nonce", {
      code: "provider_error",
      provider: this.provider,
    });
  }

  async account(): Promise<string> {
    if (this.#accountUrl) return this.#accountUrl;
    const directory = await this.directory();
    if (!this.#signer || !this.#accountJwk) {
      throw new UnsslError("ACME account registration requires signer and accountJwk", {
        code: "invalid_request",
        provider: this.provider,
      });
    }

    const payload: Record<string, unknown> = {
      termsOfServiceAgreed: true,
      onlyReturnExisting: false,
      ...(this.contacts.length > 0 && {
        contact: this.contacts.map((contact) =>
          contact.startsWith("mailto:") ? contact : `mailto:${contact}`,
        ),
      }),
    };

    if (this.externalAccount) {
      const { keyId, hmacKey, alg = "HS256" } = this.externalAccount;
      const url = directory.newAccount;
      const protectedHeader = {
        alg,
        kid: keyId,
        url,
      };
      const encodedProtected = encodeBase64Url(JSON.stringify(protectedHeader));
      const encodedPayload = encodeBase64Url(JSON.stringify(this.#accountJwk));
      const signature = createHmac(hmacAlgorithms[alg], hmacKey)
        .update(`${encodedProtected}.${encodedPayload}`)
        .digest("base64url");
      payload.externalAccountBinding = {
        protected: encodedProtected,
        payload: encodedPayload,
        signature,
      };
    }

    const response = await this.signedRequest(directory.newAccount, payload, {
      accountKey: true,
      expectedStatus: [200, 201],
    });
    const location = response.headers.get("location");
    if (!location) {
      throw new UnsslError("ACME account response did not include Location", {
        code: "provider_error",
        provider: this.provider,
        status: response.status,
      });
    }
    this.#accountUrl = location;
    return location;
  }

  async newOrder(request: {
    identifiers: string[];
    notBefore?: string;
    notAfter?: string;
  }): Promise<AcmeOrder> {
    const directory = await this.directory();
    await this.account();
    const response = await this.signedRequest(
      directory.newOrder,
      {
        identifiers: request.identifiers.map((value) => ({ type: "dns", value })),
        ...(request.notBefore && { notBefore: request.notBefore }),
        ...(request.notAfter && { notAfter: request.notAfter }),
      },
      { expectedStatus: [201] },
    );
    const order = (await response.json()) as AcmeOrder;
    const location = response.headers.get("location");
    return { ...order, url: order.url || location || undefined };
  }

  async getAuthorization(url: string): Promise<AcmeAuthorization> {
    const response = await this.#postAsGet(url);
    return (await response.json()) as AcmeAuthorization;
  }

  async updateChallenge(challengeUrl: string): Promise<AcmeChallenge> {
    const response = await this.signedRequest(challengeUrl, {}, { expectedStatus: [200] });
    return (await response.json()) as AcmeChallenge;
  }

  async refreshOrder(order: AcmeOrder): Promise<AcmeOrder> {
    if (!order.url) {
      throw new UnsslError("ACME order has no URL for polling", {
        code: "invalid_request",
        provider: this.provider,
        details: order,
      });
    }
    const response = await this.#postAsGet(order.url);
    const refreshed = (await response.json()) as AcmeOrder;
    return { ...refreshed, url: refreshed.url || order.url };
  }

  async finalizeOrder(order: AcmeOrder, csrPem: string): Promise<AcmeOrder> {
    if (!order.finalize) {
      throw new UnsslError("ACME order has no finalize URL", {
        code: "invalid_request",
        provider: this.provider,
        details: order,
      });
    }
    const response = await this.signedRequest(
      order.finalize,
      { csr: pemToBase64UrlDer(csrPem) },
      { expectedStatus: [200] },
    );
    const finalized = (await response.json()) as AcmeOrder;
    return { ...finalized, url: finalized.url || order.url };
  }

  async certificate(order: AcmeOrder): Promise<string> {
    if (!order.certificate) {
      throw new UnsslError("ACME order has no certificate URL", {
        code: "invalid_request",
        provider: this.provider,
        details: order,
      });
    }
    const response = await this.#postAsGet(order.certificate);
    return response.text();
  }

  async revoke(certificatePem: string, reason: RevokeReason = "unspecified"): Promise<void> {
    const directory = await this.directory();
    if (!directory.revokeCert) {
      throw new UnsslError("ACME directory does not expose revocation", {
        code: "not_supported",
        provider: this.provider,
      });
    }
    await this.signedRequest(
      directory.revokeCert,
      {
        certificate: pemToBase64UrlDer(certificatePem),
        reason: revokeReasonCodes[reason],
      },
      { expectedStatus: [200] },
    );
  }
}

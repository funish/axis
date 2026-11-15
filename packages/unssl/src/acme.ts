import { createHash } from "node:crypto";
import { classifyHttpError, UnsslError } from "./errors";
import type {
  AcmeDirectory,
  AcmeJws,
  AcmeOrder,
  AcmeProtectedHeader,
  ChallengeType,
  HttpFetch,
  JwsSigner,
  NonceStore,
  RevokeReason,
} from "./types";

export function encodeBase64Url(value: string | Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

export function dns01RecordName(identifier: string): string {
  const domain = identifier.replace(/\.$/, "");
  return `_acme-challenge.${domain}`;
}

export function dns01RecordValue(keyAuthorization: string): string {
  return createHash("sha256").update(keyAuthorization).digest("base64url");
}

export function http01Path(keyAuthorization: string): string {
  const token = keyAuthorization.split(".")[0];
  return `/.well-known/acme-challenge/${token}`;
}

export function challengeResponse(keyAuthorization: string): string {
  return keyAuthorization;
}

export function createChallengeFromKeyAuthorization(
  identifier: string,
  type: ChallengeType,
  keyAuthorization: string,
): import("./types").CertificateChallenge {
  if (type === "http-01") {
    return {
      type,
      identifier,
      token: keyAuthorization.split(".")[0],
      keyAuthorization,
      content: challengeResponse(keyAuthorization),
      path: http01Path(keyAuthorization),
    };
  }
  return {
    type,
    identifier,
    token: keyAuthorization.split(".")[0],
    keyAuthorization,
    recordName: dns01RecordName(identifier),
    recordValue: dns01RecordValue(keyAuthorization),
  };
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

export class AcmeClient {
  readonly directoryUrl: string;
  readonly provider: string;
  readonly nonceStore: NonceStore;
  #fetch: HttpFetch;
  #signer?: JwsSigner;
  #accountUrl?: string;
  #accountJwk?: Record<string, unknown>;
  #directory?: AcmeDirectory;

  constructor(options: AcmeClientOptions) {
    this.directoryUrl = options.directoryUrl;
    this.provider = options.provider || "acme";
    this.nonceStore = options.nonceStore || new MemoryNonceStore();
    this.#fetch = options.fetch || globalThis.fetch;
    this.#signer = options.signer;
    this.#accountUrl = options.accountUrl;
    this.#accountJwk = options.accountJwk;
  }

  private async request(
    url: string,
    init?: RequestInit,
    expectedStatus?: number,
  ): Promise<Response> {
    let response: Response;
    try {
      response = await this.#fetch(url, init);
    } catch (error) {
      throw new UnsslError(`Unable to connect to ACME directory: ${url}`, {
        code: "network",
        provider: this.provider,
        cause: error,
        retryable: true,
      });
    }

    if (
      !response.ok ||
      (expectedStatus && response.status !== expectedStatus)
    ) {
      let details: unknown;
      try {
        details = await response.json();
      } catch {
        details = await response.text();
      }
      throw classifyHttpError(response.status, this.provider, details);
    }
    return response;
  }

  async directory(): Promise<AcmeDirectory> {
    if (this.#directory) {
      return this.#directory;
    }
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

  private async signedRequest(
    url: string,
    payload: object,
    options: { useAccountKey?: boolean; expectedStatus?: number } = {},
  ): Promise<Response> {
    if (!this.#signer) {
      throw new UnsslError("ACME requests require an injected JWS signer", {
        code: "not_supported",
        provider: this.provider,
      });
    }

    const nonce = (await this.nonceStore.take()) || (await this.newNonce());
    const header: AcmeProtectedHeader = {
      alg: this.#signer.alg,
      nonce,
      url,
    };
    if (options.useAccountKey) {
      if (!this.#accountJwk) {
        throw new UnsslError("New account requests require accountJwk", {
          code: "invalid_request",
          provider: this.provider,
        });
      }
      header.jwk = this.#accountJwk;
    } else {
      if (!this.#accountUrl) {
        throw new UnsslError("ACME requests require accountUrl", {
          code: "invalid_request",
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

    const response = await this.request(
      url,
      {
        method: "POST",
        headers: {
          "content-type": "application/jose+json",
        },
        body: JSON.stringify(jws),
      },
      options.expectedStatus,
    );

    const nextNonce = response.headers.get("replay-nonce");
    if (nextNonce) {
      await this.nonceStore.put(nextNonce);
    }
    return response;
  }

  async newOrder(request: {
    identifiers: string[];
    notBefore?: string;
    notAfter?: string;
  }): Promise<AcmeOrder> {
    const directory = await this.directory();
    const response = await this.signedRequest(
      directory.newOrder,
      {
        identifiers: request.identifiers.map((value) => ({
          type: "dns",
          value,
        })),
        ...(request.notBefore && { notBefore: request.notBefore }),
        ...(request.notAfter && { notAfter: request.notAfter }),
      },
      { expectedStatus: 201 },
    );
    return (await response.json()) as AcmeOrder;
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
      { csr: csrPem },
      { expectedStatus: 200 },
    );
    return (await response.json()) as AcmeOrder;
  }

  async certificate(order: AcmeOrder): Promise<string> {
    if (!order.certificate) {
      throw new UnsslError("ACME order has no certificate URL", {
        code: "invalid_request",
        provider: this.provider,
        details: order,
      });
    }
    const response = await this.request(order.certificate, { method: "GET" });
    return response.text();
  }

  async revoke(
    certificatePem: string,
    reason: RevokeReason = "unspecified",
  ): Promise<void> {
    const directory = await this.directory();
    if (!directory.revokeCert) {
      throw new UnsslError("ACME directory does not expose revocation", {
        code: "not_supported",
        provider: this.provider,
      });
    }
    await this.signedRequest(
      directory.revokeCert,
      { certificate: certificatePem, reason: revokeReasonCodes[reason] },
      { expectedStatus: 200 },
    );
  }
}

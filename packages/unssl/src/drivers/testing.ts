import { createHash } from "node:crypto";

import { UnsslError } from "../errors";
import type {
  CertificateChallenge,
  CertificateRequest,
  ChallengeRequest,
  DeploymentMetadata,
  DriverOptions,
  IssuedCertificate,
  RevokeRequest,
  UnsslDriver,
} from "../types";

export interface TestingDriverOptions extends DriverOptions {
  certificates?: IssuedCertificate[];
  validityDays?: number;
}

export default function testingDriver(
  options: TestingDriverOptions = {},
): UnsslDriver<TestingDriverOptions> {
  const certificates = new Map<string, IssuedCertificate>();
  let sequence = 0;
  let disposed = false;

  for (const certificate of options.certificates || []) {
    certificates.set(certificate.id, structuredClone(certificate));
    sequence = Math.max(sequence, Number.parseInt(certificate.id, 10) || 0);
  }

  function assertAvailable(): void {
    if (disposed) {
      throw new UnsslError("Testing certificate driver has been disposed", {
        code: "disposed",
        provider: "testing",
      });
    }
  }

  function createCertificate(request: CertificateRequest, renewalOf?: string): IssuedCertificate {
    assertAvailable();
    if (!request.identifiers.length) {
      throw new UnsslError("At least one DNS identifier is required", {
        code: "invalid_request",
        provider: "testing",
      });
    }
    if (!request.csrPem.includes("BEGIN CERTIFICATE REQUEST")) {
      throw new UnsslError("A PEM-encoded CSR is required", {
        code: "invalid_request",
        provider: "testing",
      });
    }

    sequence += 1;
    const id = String(sequence);
    const validityDays = request.validityDays || options.validityDays || 90;
    const issued: IssuedCertificate = {
      id,
      certificatePem: [
        "-----BEGIN CERTIFICATE-----",
        Buffer.from(JSON.stringify({ id, identifiers: request.identifiers, renewalOf })).toString(
          "base64",
        ),
        "-----END CERTIFICATE-----",
      ].join("\n"),
      privateKeyRef: `testing-key-${id}`,
      identifiers: request.identifiers,
      status: "issued",
      expiresAt: new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000).toISOString(),
      metadata: { ...request.metadata, ...(renewalOf && { renewalOf }) },
    };
    certificates.set(id, issued);
    return structuredClone(issued);
  }

  const driver: UnsslDriver<TestingDriverOptions> = {
    name: "testing",
    options,

    async issue(request) {
      return createCertificate(request);
    },

    async renew(certificate, request) {
      const existing = certificates.get(certificate.id);
      if (!existing) {
        throw new UnsslError(`Certificate not found: ${certificate.id}`, {
          code: "not_found",
          provider: "testing",
        });
      }
      return createCertificate(
        {
          identifiers: request?.identifiers || existing.identifiers,
          csrPem: request?.csrPem || existing.certificatePem,
          validityDays: request?.validityDays,
          metadata: { ...existing.metadata, ...request?.metadata },
        },
        existing.id,
      );
    },

    async revoke(request: RevokeRequest) {
      const certificateId = request.certificateId;
      if (!certificateId) {
        throw new UnsslError("certificateId is required by the testing driver", {
          code: "invalid_request",
          provider: "testing",
        });
      }
      const certificate = certificates.get(certificateId);
      if (!certificate) {
        throw new UnsslError(`Certificate not found: ${certificateId}`, {
          code: "not_found",
          provider: "testing",
        });
      }
      certificate.status = "revoked";
    },

    async getDeploymentMetadata(certificateId): Promise<DeploymentMetadata> {
      const certificate = certificates.get(certificateId);
      if (!certificate) {
        throw new UnsslError(`Certificate not found: ${certificateId}`, {
          code: "not_found",
          provider: "testing",
        });
      }
      return {
        certificateId,
        provider: "testing",
        location: "memory",
        properties: { identifiers: certificate.identifiers.join(",") },
      };
    },

    async createChallenge(request: ChallengeRequest): Promise<CertificateChallenge> {
      assertAvailable();
      sequence += 1;
      const keyAuthorization = request.keyAuthorization || `test-token-${sequence}.test-thumbprint`;
      const identifier = request.identifier.replace(/\.$/, "");
      const token = keyAuthorization.split(".")[0];

      if (request.type === "http-01") {
        return {
          type: "http-01",
          identifier,
          token,
          keyAuthorization,
          content: keyAuthorization,
          path: `/.well-known/acme-challenge/${token}`,
        };
      }

      return {
        type: "dns-01",
        identifier,
        token,
        keyAuthorization,
        recordName: `_acme-challenge.${identifier}`,
        recordValue: createHash("sha256").update(keyAuthorization).digest("base64url"),
      };
    },

    async dispose() {
      if (!disposed) {
        disposed = true;
        certificates.clear();
      }
    },
  };

  return driver;
}

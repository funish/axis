import { createHash } from "node:crypto";

import { UnsslError } from "../errors";
import type { CertificateChallenge, ChallengeRequest, DriverOptions, UnsslDriver } from "../types";

export interface LetsEncryptDriverOptions extends DriverOptions {
  staging?: boolean;
}

/**
 * RFC 8555 driver boundary. Protocol framing and challenge naming are enabled;
 * account and CSR completion remain the caller's responsibility.
 */
export default function letsEncryptDriver(
  options: LetsEncryptDriverOptions = {},
): UnsslDriver<LetsEncryptDriverOptions> {
  let disposed = false;

  return {
    name: "letsencrypt",
    options,

    async createChallenge(request: ChallengeRequest): Promise<CertificateChallenge> {
      if (disposed) {
        throw new UnsslError("Let's Encrypt driver has been disposed", {
          code: "disposed",
          provider: "letsencrypt",
        });
      }
      if (!request.keyAuthorization) {
        throw new UnsslError(
          "keyAuthorization is required until order authorizations are integrated",
          { code: "invalid_request", provider: "letsencrypt" },
        );
      }
      const identifier = request.identifier.replace(/\.$/, "");
      const token = request.keyAuthorization.split(".")[0];
      if (request.type === "http-01") {
        return {
          type: "http-01",
          identifier,
          token,
          keyAuthorization: request.keyAuthorization,
          content: request.keyAuthorization,
          path: `/.well-known/acme-challenge/${token}`,
        };
      }
      return {
        type: "dns-01",
        identifier,
        token,
        keyAuthorization: request.keyAuthorization,
        recordName: `_acme-challenge.${identifier}`,
        recordValue: createHash("sha256").update(request.keyAuthorization).digest("base64url"),
      };
    },

    async dispose() {
      disposed = true;
    },
  };
}

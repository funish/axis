import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from "node:crypto";
import type { KeyObject } from "node:crypto";

import { SSLError } from "./errors";
import type { JwsSigner } from "./types";

export interface Es256AccountKey {
  privateKeyPem: string;
  publicKeyPem: string;
  publicJwk: Record<string, unknown>;
}

export interface Es256SignerOptions {
  privateKeyPem: string;
  privateKeyPassphrase?: string;
}

export interface Es256JwsSigner extends JwsSigner {
  accountJwk: Record<string, unknown>;
}

export interface Es256GenerateOptions {
  passphrase?: string;
}

function importPrivateKey(privateKeyPem: string, passphrase?: string): KeyObject {
  const pkcs8 = /-----BEGIN (ENCRYPTED )?PRIVATE KEY-----/.test(privateKeyPem);
  try {
    return createPrivateKey({
      key: privateKeyPem,
      format: "pem",
      type: pkcs8 ? "pkcs8" : "sec1",
      passphrase,
    });
  } catch (error) {
    throw new SSLError("Unable to load the ES256 account private key", {
      code: "key_storage",
      provider: "acme",
      cause: error,
    });
  }
}

function publicJwk(key: KeyObject): Record<string, unknown> {
  const value = createPublicKey(key).export({ format: "jwk" }) as Record<string, unknown>;
  if (value.kty !== "EC" || value.crv !== "P-256") {
    throw new SSLError("ES256 account keys must use an EC P-256 key", {
      code: "key_storage",
      provider: "acme",
    });
  }
  return {
    crv: value.crv,
    kty: value.kty,
    x: value.x,
    y: value.y,
  };
}

function encodeBase64Url(value: string | Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

function derInteger(input: Uint8Array): Buffer {
  const value = input[0] & 128 ? Buffer.concat([Buffer.from([0]), input]) : Buffer.from(input);
  return Buffer.concat([Buffer.from([2, value.length]), value]);
}

function rawSignatureToDer(signature: Buffer): Buffer {
  if (signature.length !== 64) {
    throw new SSLError("ES256 signatures must contain 32-byte r and s values", {
      code: "invalid_request",
      provider: "acme",
    });
  }
  const body = Buffer.concat([
    derInteger(signature.subarray(0, 32)),
    derInteger(signature.subarray(32)),
  ]);
  return Buffer.concat([Buffer.from([48, body.length]), body]);
}

function derSignatureToRaw(signature: Buffer): Buffer {
  let offset = 0;
  if (signature[offset] !== 48) {
    throw new SSLError("Invalid DER ECDSA signature", {
      code: "invalid_request",
      provider: "acme",
    });
  }
  offset += 1;
  if (signature[offset] & 128) offset += signature[offset] & 127;
  offset += 1;
  if (signature[offset] !== 2) {
    throw new SSLError("Invalid DER ECDSA signature", {
      code: "invalid_request",
      provider: "acme",
    });
  }
  const rLength = signature[offset + 1];
  const r = signature.subarray(offset + 2, offset + 2 + rLength);
  offset += 2 + rLength;
  if (signature[offset] !== 2) {
    throw new SSLError("Invalid DER ECDSA signature", {
      code: "invalid_request",
      provider: "acme",
    });
  }
  const sLength = signature[offset + 1];
  const s = signature.subarray(offset + 2, offset + 2 + sLength);
  if (offset + 2 + sLength !== signature.length) {
    throw new SSLError("Invalid DER ECDSA signature", {
      code: "invalid_request",
      provider: "acme",
    });
  }

  const fixed = (value: Buffer): Buffer => {
    const unsigned = value[0] === 0 ? value.subarray(1) : value;
    if (unsigned.length > 32) {
      throw new SSLError("Invalid ES256 signature integer length", {
        code: "invalid_request",
        provider: "acme",
      });
    }
    return Buffer.concat([Buffer.alloc(32 - unsigned.length), unsigned]);
  };
  return Buffer.concat([fixed(r), fixed(s)]);
}

export function generateEs256AccountKey(options: Es256GenerateOptions = {}): Es256AccountKey {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const privateKeyPem = privateKey.export({
    type: "pkcs8",
    format: "pem",
    ...(options.passphrase && {
      passphrase: options.passphrase,
      cipher: "aes-256-cbc",
    }),
  }) as string;
  return {
    privateKeyPem,
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }) as string,
    publicJwk: publicJwk(privateKey),
  };
}

export function es256PublicJwk(
  privateKeyPem: string,
  privateKeyPassphrase?: string,
): Record<string, unknown> {
  return publicJwk(importPrivateKey(privateKeyPem, privateKeyPassphrase));
}

export async function es256Sign(
  protectedBase64Url: string,
  payloadBase64Url: string,
  privateKeyPem: string,
  privateKeyPassphrase?: string,
): Promise<string> {
  const key = importPrivateKey(privateKeyPem, privateKeyPassphrase);
  const signingInput = Buffer.from(`${protectedBase64Url}.${payloadBase64Url}`);
  const signature = sign("sha256", signingInput, key);
  return derSignatureToRaw(signature).toString("base64url");
}

export function es256Verify(
  protectedBase64Url: string,
  payloadBase64Url: string,
  signature: string,
  publicKeyPemOrJwk: string | Record<string, unknown>,
): boolean {
  const key = createPublicKey(
    typeof publicKeyPemOrJwk === "string"
      ? { key: publicKeyPemOrJwk, format: "pem", type: "spki" }
      : { key: publicKeyPemOrJwk, format: "jwk" },
  );
  const raw = Buffer.from(signature, "base64url");
  return verify(
    "sha256",
    Buffer.from(`${protectedBase64Url}.${payloadBase64Url}`),
    key,
    rawSignatureToDer(raw),
  );
}

export function jwkThumbprint(accountJwk: Record<string, unknown>): string {
  const canonical = Object.keys(accountJwk)
    .filter((key) => ["crv", "e", "kty", "n", "x", "y"].includes(key))
    .sort()
    .reduce((value: Record<string, unknown>, key) => {
      value[key] = accountJwk[key];
      return value;
    }, {});
  if (Object.keys(canonical).length === 0) {
    throw new SSLError(
      "accountJwk must contain EC (crv/x/y) or RSA (e/kty/n) fields for ACME challenges",
      { code: "invalid_request", provider: "acme" },
    );
  }
  return createHash("sha256").update(JSON.stringify(canonical)).digest("base64url");
}

export function createEs256JwsSigner(options: Es256SignerOptions): Es256JwsSigner {
  const key = importPrivateKey(options.privateKeyPem, options.privateKeyPassphrase);
  const accountJwk = publicJwk(key);
  return {
    alg: "ES256",
    accountJwk,
    async sign(header, payload) {
      if (header.alg !== "ES256") {
        throw new SSLError("ES256 signer received a different JWS algorithm", {
          code: "invalid_request",
          provider: "acme",
        });
      }
      const encodedProtected = encodeBase64Url(JSON.stringify(header));
      const encodedPayload = encodeBase64Url(payload);
      return {
        signature: await es256Sign(
          encodedProtected,
          encodedPayload,
          options.privateKeyPem,
          options.privateKeyPassphrase,
        ),
      };
    },
  };
}

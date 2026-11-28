import { createHash } from "node:crypto";

import { SSLError } from "./errors";
import { createEs256JwsSigner, generateEs256AccountKey, es256PublicJwk } from "./jws";
import type { AcmeAccountContext, MaybePromise } from "./types";

export interface EncryptedStoredKey {
  ciphertext: string;
  metadata?: Record<string, string>;
}

export interface EncryptedKeyStorage {
  get(reference: string): MaybePromise<EncryptedStoredKey | null>;
  put(reference: string, key: EncryptedStoredKey): MaybePromise<void>;
  delete(reference: string): MaybePromise<void>;
}

export type AcmeKeyEncryptionPhase = "primary" | "rotation";

export interface AcmeKeyEncryptionContext {
  directoryUrl: string;
  reference: string;
  phase: AcmeKeyEncryptionPhase;
  data?: Record<string, unknown>;
}

export interface KeyEncryption {
  encrypt(plaintext: string, context: AcmeKeyEncryptionContext): MaybePromise<string>;
  decrypt(ciphertext: string, context: AcmeKeyEncryptionContext): MaybePromise<string>;
}

export interface GeneratedAcmeAccountKey {
  privateKeyPem: string;
  accountJwk: Record<string, unknown>;
}

export interface AcmeAccountKeyServiceOptions {
  storage: EncryptedKeyStorage;
  encryption: KeyEncryption;
  generate?: (context: AcmeKeyEncryptionContext) => MaybePromise<GeneratedAcmeAccountKey>;
  /** Passed to the default ES256 generator and available in encryption context data. */
  passphrase?: string;
}

export interface AcmeAccountKeyService {
  getOrCreate(directoryUrl: string, phase?: AcmeKeyEncryptionPhase): Promise<AcmeAccountContext>;
  load(directoryUrl: string, phase?: AcmeKeyEncryptionPhase): Promise<AcmeAccountContext | null>;
  setAccountUrl(
    directoryUrl: string,
    accountUrl: string,
    phase?: AcmeKeyEncryptionPhase,
  ): Promise<void>;
  createRotation(directoryUrl: string): Promise<AcmeAccountContext>;
  activateRotation(directoryUrl: string): Promise<AcmeAccountContext>;
  discardRotation(directoryUrl: string): Promise<void>;
}

function referenceFor(directoryUrl: string, phase: AcmeKeyEncryptionPhase): string {
  const primary = createHash("sha256")
    .update("unssl-acme-account-key\0")
    .update(directoryUrl)
    .digest("base64url");
  return phase === "rotation" ? `${primary}.rotation` : primary;
}

function storedAccountKey(entry: EncryptedStoredKey): GeneratedAcmeAccountKey {
  const accountJwk = entry.metadata?.accountJwk
    ? (JSON.parse(entry.metadata.accountJwk) as Record<string, unknown>)
    : undefined;
  if (!accountJwk) {
    throw new SSLError("Stored ACME account key is missing its public JWK", {
      code: "key_storage",
      provider: "acme",
    });
  }
  return { privateKeyPem: entry.ciphertext, accountJwk };
}

export function createAcmeAccountKeyService(
  options: AcmeAccountKeyServiceOptions,
): AcmeAccountKeyService {
  const generating = new Map<string, Promise<AcmeAccountContext>>();

  function encryptionContext(
    directoryUrl: string,
    phase: AcmeKeyEncryptionPhase,
  ): AcmeKeyEncryptionContext {
    const reference = referenceFor(directoryUrl, phase);
    return {
      directoryUrl,
      reference,
      phase,
      ...(options.passphrase !== undefined && { data: { hasPassphrase: true } }),
    };
  }

  function createAccountContext(
    key: GeneratedAcmeAccountKey,
    directoryUrl: string,
    phase: AcmeKeyEncryptionPhase,
    accountUrl?: string,
  ): AcmeAccountContext {
    const signer = createEs256JwsSigner({ privateKeyPem: key.privateKeyPem });
    const reference = referenceFor(directoryUrl, phase);
    return {
      alg: "ES256",
      sign: signer.sign.bind(signer),
      accountJwk: key.accountJwk,
      ...(accountUrl && { accountUrl }),
      privateKeyRef: reference,
      onAccountUrl: async (nextAccountUrl) => {
        const { key, metadata } = await loadKey(directoryUrl, phase);
        await putWithMetadata(directoryUrl, phase, key, {
          ...metadata,
          accountUrl: nextAccountUrl,
          directoryUrl,
          phase,
        });
      },
    };
  }

  async function read(
    directoryUrl: string,
    phase: AcmeKeyEncryptionPhase,
  ): Promise<AcmeAccountContext | null> {
    const reference = referenceFor(directoryUrl, phase);
    const entry = await options.storage.get(reference);
    if (!entry) return null;
    const context = encryptionContext(directoryUrl, phase);
    try {
      const privateKeyPem = await options.encryption.decrypt(entry.ciphertext, context);
      const accountJwk = entry.metadata?.accountJwk
        ? (JSON.parse(entry.metadata.accountJwk) as Record<string, unknown>)
        : es256PublicJwk(privateKeyPem);
      return createAccountContext(
        { privateKeyPem, accountJwk },
        directoryUrl,
        phase,
        entry.metadata?.accountUrl,
      );
    } catch (error) {
      if (error instanceof SSLError) throw error;
      throw new SSLError("Unable to decrypt the stored ACME account key", {
        code: "key_storage",
        provider: "acme",
        cause: error,
      });
    }
  }

  async function getOrCreate(
    directoryUrl: string,
    phase: AcmeKeyEncryptionPhase = "primary",
  ): Promise<AcmeAccountContext> {
    const existing = await read(directoryUrl, phase);
    if (existing) return existing;

    const reference = referenceFor(directoryUrl, phase);
    const pending = generating.get(reference);
    if (pending) return pending;

    const created = (async () => {
      const context = encryptionContext(directoryUrl, phase);
      const generated =
        (await options.generate?.(context)) ||
        generateEs256AccountKey({ ...(options.passphrase && { passphrase: options.passphrase }) });
      const key: GeneratedAcmeAccountKey =
        "accountJwk" in generated
          ? generated
          : { privateKeyPem: generated.privateKeyPem, accountJwk: generated.publicJwk };
      const ciphertext = await options.encryption.encrypt(key.privateKeyPem, context);
      await options.storage.put(reference, {
        ciphertext,
        metadata: {
          accountJwk: JSON.stringify(key.accountJwk),
          directoryUrl,
          phase,
        },
      });
      return createAccountContext(key, directoryUrl, phase);
    })();
    generating.set(reference, created);
    try {
      return await created;
    } finally {
      generating.delete(reference);
    }
  }

  async function putWithMetadata(
    directoryUrl: string,
    phase: AcmeKeyEncryptionPhase,
    key: GeneratedAcmeAccountKey,
    metadata: Record<string, string>,
  ): Promise<void> {
    const context = encryptionContext(directoryUrl, phase);
    const ciphertext = await options.encryption.encrypt(key.privateKeyPem, context);
    await options.storage.put(referenceFor(directoryUrl, phase), {
      ciphertext,
      metadata,
    });
  }

  async function loadKey(
    directoryUrl: string,
    phase: AcmeKeyEncryptionPhase,
  ): Promise<{ key: GeneratedAcmeAccountKey; metadata: Record<string, string> }> {
    const reference = referenceFor(directoryUrl, phase);
    const entry = await options.storage.get(reference);
    if (!entry) {
      throw new SSLError("ACME account key does not exist", {
        code: "key_storage",
        provider: "acme",
        details: { reference },
      });
    }
    const context = encryptionContext(directoryUrl, phase);
    try {
      const privateKeyPem = await options.encryption.decrypt(entry.ciphertext, context);
      return {
        key: storedAccountKey({ ...entry, ciphertext: privateKeyPem }),
        metadata: entry.metadata || {},
      };
    } catch (error) {
      if (error instanceof SSLError) throw error;
      throw new SSLError("Unable to decrypt the stored ACME account key", {
        code: "key_storage",
        provider: "acme",
        cause: error,
      });
    }
  }

  return {
    getOrCreate,

    load(directoryUrl, phase = "primary") {
      return read(directoryUrl, phase);
    },

    async setAccountUrl(directoryUrl, accountUrl, phase = "primary") {
      const { key, metadata } = await loadKey(directoryUrl, phase);
      await putWithMetadata(directoryUrl, phase, key, {
        ...metadata,
        accountUrl,
        directoryUrl,
        phase,
      });
    },

    async createRotation(directoryUrl) {
      return getOrCreate(directoryUrl, "rotation");
    },

    async activateRotation(directoryUrl) {
      const rotation = await loadKey(directoryUrl, "rotation");
      const metadata: Record<string, string> = {
        ...rotation.metadata,
        phase: "primary",
      };
      await putWithMetadata(directoryUrl, "primary", rotation.key, metadata);
      await options.storage.delete(referenceFor(directoryUrl, "rotation"));
      return createAccountContext(rotation.key, directoryUrl, "primary", metadata.accountUrl);
    },

    async discardRotation(directoryUrl) {
      await options.storage.delete(referenceFor(directoryUrl, "rotation"));
    },
  };
}

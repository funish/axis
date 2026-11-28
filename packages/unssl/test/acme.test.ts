import { describe, expect, test, vi } from "vite-plus/test";

import {
  AcmeClient,
  MemoryNonceStore,
  changeAcmeAccountKey,
  createAcmeAccountKeyService,
  createEs256JwsSigner,
  generateEs256AccountKey,
  jwkThumbprint,
  es256Sign,
  es256Verify,
  type AcmeProtectedHeader,
  type EncryptedKeyStorage,
  type EncryptedStoredKey,
  type HttpFetch,
  type JwsSigner,
  type KeyEncryption,
} from "../src";
import acmeDriver from "../src/drivers/acme";

const csr = [
  "-----BEGIN CERTIFICATE REQUEST-----",
  "Zml4dHVyZS1jc3ItcGxhaW50ZXh0",
  "-----END CERTIFICATE REQUEST-----",
].join("\n");

const rfc7515Protected = "eyJhbGciOiJFUzI1NiJ9";
const rfc7515Payload =
  "eyJpc3MiOiJqb2UiLA0KICJleHAiOjEzMDA4MTkzODAsDQogImh0dHA6Ly9leGFtcGxlLmNvbS9pc19yb290Ijp0cnVlfQ";
const rfc7515Signature =
  "DtEhU3ljbEg8L38VWAfUAqOyKAM6-Xx-F4GawxaepmXFCgfTjDxw5djxLa8ISlSApmWQxfKTUJqPP3-Kg6NU1Q";
const rfc7515PrivateJwk = {
  crv: "P-256",
  d: "jpsQnnGQmL-YBIffH1136cspYG6-0iY7X1fCE9-E9LI",
  kty: "EC",
  x: "f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU",
  y: "x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0",
};
const rfc7638Jwk = {
  crv: "P-256",
  kty: "EC",
  x: "MKBCTNIcKUSDii11ySs3526iDZ8AiTo7Tu6KPAqv7D4",
  y: "4Etl6SRW2YiLUrN5vfvVHuhp7x8PxltmWWlbbM4IFyM",
};

function memoryStorage(): EncryptedKeyStorage & { entries: Map<string, EncryptedStoredKey> } {
  const entries = new Map<string, EncryptedStoredKey>();
  return {
    entries,
    async get(reference) {
      return entries.get(reference) || null;
    },
    async put(reference, key) {
      entries.set(reference, key);
    },
    async delete(reference) {
      entries.delete(reference);
    },
  };
}

function reversibleEncryption(): KeyEncryption {
  const xor = (value: string, phase: string) => {
    const input = Buffer.from(value);
    const seed = Buffer.from(`seed:${phase}`);
    return Buffer.from(input.map((byte, index) => byte ^ seed[index % seed.length]));
  };
  return {
    async encrypt(plaintext, context) {
      return xor(plaintext, context.phase).toString("base64");
    },
    async decrypt(ciphertext, context) {
      return xor(Buffer.from(ciphertext, "base64").toString("binary"), context.phase).toString(
        "binary",
      );
    },
  };
}

function fixtureSigner(signature = "fixture-signature"): JwsSigner {
  return { alg: "ES256", sign: async () => ({ signature }) };
}

describe("ACME ES256 account keys", () => {
  test("canonicalizes RFC 7638 EC JWKs", () => {
    expect(jwkThumbprint(rfc7638Jwk)).toBe("cn-I_WNMClehiVp51i_0VpOENW1upEerA8sEam5hn-s");
  });

  test("verifies the RFC 7515 ES256 vector and produces verifiable raw signatures", async () => {
    const key = generateEs256AccountKey();
    const signer = createEs256JwsSigner({ privateKeyPem: key.privateKeyPem });
    const header: AcmeProtectedHeader = {
      alg: "ES256",
      nonce: "fixture-nonce",
      url: "https://ca.example/acme/new-account",
    };
    const payload = JSON.stringify({ termsOfServiceAgreed: true });

    expect(signer.accountJwk).toEqual(key.publicJwk);
    const { signature } = await signer.sign(header, payload);
    const encodedProtected = Buffer.from(JSON.stringify(header)).toString("base64url");
    const encodedPayload = Buffer.from(payload).toString("base64url");
    expect(Buffer.from(signature, "base64url")).toHaveLength(64);
    expect(es256Verify(encodedProtected, encodedPayload, signature, key.publicJwk)).toBe(true);

    expect(
      es256Verify(rfc7515Protected, rfc7515Payload, rfc7515Signature, {
        crv: rfc7515PrivateJwk.crv,
        kty: rfc7515PrivateJwk.kty,
        x: rfc7515PrivateJwk.x,
        y: rfc7515PrivateJwk.y,
      }),
    ).toBe(true);
    const signed = await es256Sign(rfc7515Protected, rfc7515Payload, key.privateKeyPem);
    expect(es256Verify(rfc7515Protected, rfc7515Payload, signed, key.publicJwk)).toBe(true);

    const encryptedKey = generateEs256AccountKey({ passphrase: "fixture-passphrase" });
    expect(encryptedKey.privateKeyPem).toContain("ENCRYPTED PRIVATE KEY");
    const encryptedSigner = createEs256JwsSigner({
      privateKeyPem: encryptedKey.privateKeyPem,
      privateKeyPassphrase: "fixture-passphrase",
    });
    const encryptedSignature = await encryptedSigner.sign(header, payload);
    expect(
      es256Verify(
        encodedProtected,
        encodedPayload,
        encryptedSignature.signature,
        encryptedKey.publicJwk,
      ),
    ).toBe(true);
  });

  test("encrypts, reuses, rotates, and persists account URLs by directory", async () => {
    const storage = memoryStorage();
    const service = createAcmeAccountKeyService({
      storage,
      encryption: reversibleEncryption(),
    });
    const primary = await service.getOrCreate("https://ca.example/directory");
    expect(primary.privateKeyRef).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(primary.onAccountUrl).toBeTypeOf("function");
    const ciphertext = storage.entries.get(primary.privateKeyRef!)?.ciphertext || "";
    expect(ciphertext).not.toContain(primary.accountJwk!.x);
    expect(Buffer.from(ciphertext, "base64").toString()).not.toContain("PRIVATE KEY");

    await primary.onAccountUrl?.("https://ca.example/acme/acct/1");
    const restored = await service.load("https://ca.example/directory");
    expect(restored?.accountUrl).toBe("https://ca.example/acme/acct/1");
    expect(restored?.accountJwk).toEqual(primary.accountJwk);
    expect(await service.load("https://other.example/directory")).toBeNull();

    const rotation = await service.createRotation("https://ca.example/directory");
    expect(rotation.accountJwk).not.toEqual(primary.accountJwk);
    await service.setAccountUrl(
      "https://ca.example/directory",
      "https://ca.example/acme/acct/1",
      "rotation",
    );
    const activated = await service.activateRotation("https://ca.example/directory");
    expect(activated.accountJwk).toEqual(rotation.accountJwk);
    expect(activated.accountUrl).toBe("https://ca.example/acme/acct/1");
    const stored = [...storage.entries.values()][0];
    expect(stored?.metadata?.phase).toBe("primary");
    await service.discardRotation("https://ca.example/directory");
    expect(storage.entries.size).toBe(1);
  });
});

describe("ACME account provider lifecycle", () => {
  const directory = {
    newNonce: "https://ca.example/acme/new-nonce",
    newAccount: "https://ca.example/acme/new-account",
    newOrder: "https://ca.example/acme/new-order",
  };

  test("creates the account key lazily and reuses the persisted account URL", async () => {
    const storage = memoryStorage();
    const service = createAcmeAccountKeyService({
      storage,
      encryption: reversibleEncryption(),
    });
    const first = await service.getOrCreate("https://ca.example/directory");
    await service.setAccountUrl("https://ca.example/directory", "https://ca.example/acme/acct/1");
    const persisted = await service.load("https://ca.example/directory");
    expect(persisted?.accountUrl).toBe("https://ca.example/acme/acct/1");
    let providerCalls = 0;
    const requests: string[] = [];
    const fetch: HttpFetch = async (url, init) => {
      requests.push(`${init?.method || "GET"} ${url}`);
      if (url.endsWith("/directory")) return Response.json(directory);
      if (init?.method === "HEAD") {
        return new Response(null, { headers: { "replay-nonce": "nonce-1" } });
      }
      return Response.json(
        { status: "pending", identifiers: [{ type: "dns", value: "example.com" }] },
        { status: 201, headers: { "replay-nonce": "nonce-2" } },
      );
    };
    const client = new AcmeClient({
      directoryUrl: "https://ca.example/directory",
      fetch,
      nonceStore: new MemoryNonceStore(),
      account: async () => {
        providerCalls += 1;
        const restored = await service.load("https://ca.example/directory");
        console.log("provider restored", restored);
        return restored!;
      },
    });

    const clientContext = await client.accountContext();
    expect(clientContext.accountUrl).toBe("https://ca.example/acme/acct/1");
    expect(client.accountUrl).toBe("https://ca.example/acme/acct/1");
    await client.newOrder({ identifiers: ["example.com"] });
    expect(providerCalls).toBe(1);
    expect(client.accountUrl).toBe("https://ca.example/acme/acct/1");
    const lastRequest = requests.at(-1);
    expect(lastRequest).toBe("POST https://ca.example/acme/new-order");
    expect(first.privateKeyRef).toBe(
      (await service.load("https://ca.example/directory"))?.privateKeyRef,
    );
  });
});

describe("ACME retry and state machines", () => {
  const directory = {
    newNonce: "https://ca.example/acme/new-nonce",
    newAccount: "https://ca.example/acme/new-account",
    newOrder: "https://ca.example/acme/new-order",
    keyChange: "https://ca.example/acme/key-change",
  };

  test("waits exponentially between badNonce retries and honors the retry limit", async () => {
    let posts = 0;
    let requestedNonce = "";
    const fetch: HttpFetch = async (_url, init) => {
      if (init?.method === "GET") return Response.json(directory);
      if (init?.method === "HEAD") {
        requestedNonce = `nonce-${posts + 1}`;
        return new Response(null, { headers: { "replay-nonce": requestedNonce } });
      }
      posts += 1;
      if (posts < 3) {
        return new Response(JSON.stringify({ type: "urn:ietf:params:acme:error:badNonce" }), {
          status: 400,
          headers: { "replay-nonce": `replay-${posts}` },
        });
      }
      return Response.json(
        { status: "pending", identifiers: [{ type: "dns", value: "example.com" }] },
        { status: 201, headers: { "replay-nonce": "next-nonce" } },
      );
    };
    const client = new AcmeClient({
      directoryUrl: "https://ca.example/directory",
      fetch,
      signer: fixtureSigner(),
      nonceStore: new MemoryNonceStore(),
      accountUrl: "https://ca.example/acme/acct/1",
      nonceRetryLimit: 3,
      nonceRetryBaseMs: 10,
      nonceRetryMaxMs: 30,
    });

    vi.useFakeTimers();
    const succeeded = client.newOrder({ identifiers: ["example.com"] });
    await vi.advanceTimersByTimeAsync(31);
    await expect(succeeded).resolves.toMatchObject({ status: "pending" });
    vi.useRealTimers();

    posts = 0;
    const limited = new AcmeClient({
      directoryUrl: "https://ca.example/directory",
      fetch,
      signer: fixtureSigner(),
      nonceStore: new MemoryNonceStore(),
      accountUrl: "https://ca.example/acme/acct/1",
      nonceRetryLimit: 2,
      nonceRetryBaseMs: 0,
    });
    await expect(limited.newOrder({ identifiers: ["example.com"] })).rejects.toMatchObject({
      code: "invalid_request",
      nonce: "replay-2",
    });
    expect(posts).toBe(2);
  });

  test("changes an account key with RFC 8555 inner and outer JWS framing", async () => {
    const requests: Array<{ url: string; outer?: any; inner?: any }> = [];
    const oldJwk = { kty: "EC", crv: "P-256", x: "old-x", y: "old-y" };
    const newJwk = { kty: "EC", crv: "P-256", x: "new-x", y: "new-y" };
    const accountUrl = "https://ca.example/acme/acct/1";
    const fetch: HttpFetch = async (url, init) => {
      if (url.endsWith("/directory")) return Response.json(directory);
      if (init?.method === "HEAD") {
        return new Response(null, { headers: { "replay-nonce": "outer-nonce" } });
      }
      if (url === directory.keyChange) {
        const outer = JSON.parse(init?.body as string);
        requests.push({
          url,
          outer,
          inner: JSON.parse(Buffer.from(outer.payload, "base64url").toString()),
        });
        return new Response(null, { status: 200, headers: { "replay-nonce": "new-nonce" } });
      }
      throw new Error(`Unexpected request: ${init?.method} ${url}`);
    };
    const oldClient = new AcmeClient({
      directoryUrl: "https://ca.example/directory",
      fetch,
      signer: fixtureSigner("old-signature"),
      accountJwk: oldJwk,
      accountUrl,
      nonceStore: new MemoryNonceStore(),
    });
    const newClient = new AcmeClient({
      directoryUrl: "https://ca.example/directory",
      fetch,
      signer: fixtureSigner("new-signature"),
      accountJwk: newJwk,
      nonceStore: new MemoryNonceStore(),
    });

    await changeAcmeAccountKey(oldClient, newClient);
    expect(newClient.accountUrl).toBe(accountUrl);
    const request = requests[0];
    const outerProtected = JSON.parse(
      Buffer.from(request.outer.protected, "base64url").toString(),
    ) as AcmeProtectedHeader;
    expect(outerProtected).toEqual({
      alg: "ES256",
      nonce: "outer-nonce",
      url: directory.keyChange,
      kid: accountUrl,
    });
    expect(request.outer.signature).toBe("old-signature");
    expect(request.inner).toEqual({
      protected: expect.any(String),
      payload: expect.any(String),
      signature: "new-signature",
    });
    const innerProtected = JSON.parse(
      Buffer.from(request.inner.protected, "base64url").toString(),
    ) as AcmeProtectedHeader;
    expect(innerProtected).toEqual({
      alg: "ES256",
      jwk: newJwk,
      url: directory.keyChange,
    });
    expect(JSON.parse(Buffer.from(request.inner.payload, "base64url").toString())).toEqual({
      account: accountUrl,
      oldKey: oldJwk,
    });
  });

  test("classifies invalid authorization and order terminal states", async () => {
    const fetch: HttpFetch = async (url, init) => {
      if (url.endsWith("/directory")) return Response.json(directory);
      if (init?.method === "HEAD") {
        return new Response(null, { headers: { "replay-nonce": "nonce" } });
      }
      if (url === directory.newOrder) {
        return Response.json(
          {
            status: "pending",
            finalize: "https://ca.example/acme/order/1/finalize",
            authorizations: ["https://ca.example/acme/authz/1"],
            identifiers: [{ type: "dns", value: "example.com" }],
          },
          { status: 201 },
        );
      }
      return Response.json({
        identifier: { type: "dns", value: "example.com" },
        status: "invalid",
        error: { type: "urn:ietf:params:acme:error:dns", detail: "no matching DNS record" },
        challenges: [
          {
            type: "http-01",
            url: "https://ca.example/acme/challenge/1",
            token: "token",
            status: "invalid",
          },
        ],
      });
    };
    const driver = acmeDriver({
      provider: "fixture-ca",
      directoryUrl: "https://ca.example/directory",
      fetch,
      signer: fixtureSigner(),
      accountJwk: { kty: "EC", crv: "P-256", x: "fixture-x", y: "fixture-y" },
      accountUrl: "https://ca.example/acme/acct/1",
      pollIntervalMs: 0,
    });

    await expect(acmeDriverIssue(driver)).rejects.toMatchObject({
      code: "challenge_failed",
    });

    const invalidOrderFetch: HttpFetch = async (url, init) => {
      if (url.endsWith("/directory")) return Response.json(directory);
      if (init?.method === "HEAD") {
        return new Response(null, { headers: { "replay-nonce": "nonce" } });
      }
      if (url === directory.newOrder) {
        return Response.json(
          {
            status: "invalid",
            error: { type: "urn:ietf:params:acme:error:rejectedIdentifier" },
            identifiers: [{ type: "dns", value: "example.com" }],
          },
          { status: 201 },
        );
      }
      throw new Error(`Unexpected request: ${init?.method} ${url}`);
    };
    const invalidOrderDriver = acmeDriver({
      provider: "fixture-ca",
      directoryUrl: "https://ca.example/directory",
      fetch: invalidOrderFetch,
      signer: fixtureSigner(),
      accountJwk: { kty: "EC", crv: "P-256", x: "fixture-x", y: "fixture-y" },
      accountUrl: "https://ca.example/acme/acct/1",
      pollIntervalMs: 0,
    });
    await expect(acmeDriverIssue(invalidOrderDriver)).rejects.toMatchObject({
      code: "challenge_failed",
      message: "certificate order failed",
    });
  });
});

async function acmeDriverIssue(driver: ReturnType<typeof acmeDriver>) {
  return driver.issue?.({ identifiers: ["example.com"], csrPem: csr });
}

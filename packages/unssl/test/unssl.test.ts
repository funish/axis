/* eslint-disable no-floating-promises */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  AcmeClient,
  MemoryNonceStore,
  UnsslError,
  createUnsslManager,
  dns01RecordName,
  dns01RecordValue,
  http01Path,
  type DnsRecord,
  type DnsRecordInput,
  type DnsRecordOperations,
  type HttpFetch,
  type JwsSigner,
} from "unssl";
import testingDriver from "unssl/drivers/testing";
import letsEncryptDriver from "unssl/drivers/letsencrypt";
import zeroSslDriver from "unssl/drivers/zerossl";
import cloudflareSslDriver from "unssl/drivers/cloudflare";

const csr = [
  "-----BEGIN CERTIFICATE REQUEST-----",
  "Zml4dHVyZS1jc3ItcGxhaW50ZXh0",
  "-----END CERTIFICATE REQUEST-----",
].join("\n");

function createDnsOperations(): DnsRecordOperations & {
  records: Map<string, DnsRecord[]>;
} {
  const records = new Map<string, DnsRecord[]>();
  const localName = (name: string, domain: string) =>
    name === domain || name === "@"
      ? "@"
      : name.replace(new RegExp(`\\.${domain}$`), "");

  return {
    records,
    async getRecords(domain, options) {
      const stored = records.get(domain) || [];
      const queryName = options?.name
        ? localName(options.name, domain)
        : undefined;
      return stored.filter(
        (record) =>
          (!queryName || localName(record.name || "@", domain) === queryName) &&
          (!options?.type || record.type === options.type),
      );
    },
    async setRecord(domain, record: DnsRecordInput) {
      const stored = records.get(domain) || [];
      const result = { ...record, id: `record-${stored.length + 1}` };
      stored.push(result);
      records.set(domain, stored);
      return result;
    },
    async removeRecord(domain, record) {
      const stored = records.get(domain) || [];
      records.set(
        domain,
        stored.filter((candidate) => candidate.id !== record.id),
      );
    },
  };
}

describe("unssl manager", () => {
  test("issues, renews, revokes, and exposes deployment metadata", async () => {
    const manager = createUnsslManager({ driver: testingDriver() });

    const issued = await manager.issue({
      identifiers: ["example.com", "www.example.com"],
      csrPem: csr,
    });
    assert.equal(issued.id, "1");
    assert.ok(issued.certificatePem.includes("BEGIN CERTIFICATE"));

    const renewed = await manager.renew(issued, {
      csrPem: csr,
      metadata: { reason: "rotation" },
    });
    assert.equal(renewed.id, "2");
    assert.equal(renewed.metadata?.renewalOf, issued.id);

    await manager.revoke({ certificateId: issued.id, reason: "superseded" });
    const metadata = await manager.getDeploymentMetadata(renewed.id);
    assert.equal(metadata.certificateId, "2");
    assert.equal(metadata.provider, "testing");

    await manager.dispose();
    await manager.dispose();

    await assert.rejects(
      manager.issue({ identifiers: ["example.com"], csrPem: csr }),
      (error: unknown) => {
        assert.ok(error instanceof UnsslError);
        assert.equal(error.code, "disposed");
        return true;
      },
    );
  });

  test("rejects operations missing from the optional-method contract", async () => {
    const manager = createUnsslManager({ driver: zeroSslDriver() });

    await assert.rejects(
      manager.issue({ identifiers: ["example.com"], csrPem: csr }),
      (error: unknown) => {
        assert.ok(error instanceof UnsslError);
        assert.equal(error.code, "not_supported");
        return true;
      },
    );
    assert.deepEqual(cloudflareSslDriver().options, {});
  });

  test("uses injected DNS operations without coupling UnSSL to a provider", async () => {
    const dns = createDnsOperations();
    const manager = createUnsslManager({
      driver: testingDriver(),
      dns,
    });
    const challenge = await manager.createChallenge({
      type: "dns-01",
      identifier: "www.example.com",
      keyAuthorization: "test-token.test-thumbprint",
    });
    assert.equal(challenge.type, "dns-01");
    if (challenge.type !== "dns-01")
      throw new Error("Expected DNS-01 challenge");
    assert.equal(challenge.recordName, "_acme-challenge.www.example.com");
    assert.equal(
      challenge.recordValue,
      "304jAPwCcBqnD9Rm0ihBOAkZ5SvDCl1QEFlc5qfKeqQ",
    );

    await manager.putDns01Challenge(challenge);
    assert.equal(dns.records.get("www.example.com")?.length, 1);
    await manager.removeDns01Challenge(challenge);
    assert.equal(dns.records.get("www.example.com")?.length, 0);
  });
});

describe("ACME protocol fixtures", () => {
  const directory = {
    newNonce: "https://ca.example/acme/new-nonce",
    newAccount: "https://ca.example/acme/new-account",
    newOrder: "https://ca.example/acme/new-order",
    revokeCert: "https://ca.example/acme/revoke-cert",
  };

  test("derives RFC 8555 challenge values", () => {
    const keyAuthorization = "test-token.test-thumbprint";
    assert.equal(
      dns01RecordName("www.example.com"),
      "_acme-challenge.www.example.com",
    );
    assert.equal(
      dns01RecordValue(keyAuthorization),
      "304jAPwCcBqnD9Rm0ihBOAkZ5SvDCl1QEFlc5qfKeqQ",
    );
    assert.equal(
      http01Path(keyAuthorization),
      "/.well-known/acme-challenge/test-token",
    );
  });

  test("sends RFC 8555 directory, nonce, and JWS request framing", async () => {
    const requests: Array<{ url: string; method?: string; body?: unknown }> =
      [];
    const fetch: HttpFetch = async (url, init) => {
      requests.push({ url, method: init?.method, body: init?.body });
      if (init?.method === "HEAD") {
        return new Response(null, {
          status: 200,
          headers: { "replay-nonce": "nonce-1" },
        });
      }
      if (url === "https://ca.example/acme/directory") {
        return Response.json(directory);
      }
      return new Response(
        JSON.stringify({
          status: "pending",
          identifiers: [{ type: "dns", value: "example.com" }],
          finalize: "https://ca.example/acme/order/1/finalize",
        }),
        {
          status: 201,
          headers: { "replay-nonce": "nonce-2" },
        },
      );
    };
    const signer: JwsSigner = {
      alg: "ES256",
      sign: async () => ({ signature: "fixture-signature" }),
    };

    const client = new AcmeClient({
      directoryUrl: "https://ca.example/acme/directory",
      fetch,
      signer,
      nonceStore: new MemoryNonceStore(),
      accountUrl: "https://ca.example/acme/account/1",
    });
    const order = await client.newOrder({ identifiers: ["example.com"] });

    assert.deepEqual(
      requests.map((request) => request.method),
      ["GET", "HEAD", "POST"],
    );
    assert.equal(requests[2].url, directory.newOrder);

    const jws = JSON.parse(String(requests[2].body));
    assert.equal(jws.signature, "fixture-signature");
    assert.equal(
      Buffer.from(jws.payload, "base64url").toString(),
      '{"identifiers":[{"type":"dns","value":"example.com"}]}',
    );
    const protectedHeader = JSON.parse(
      Buffer.from(jws.protected, "base64url").toString(),
    );
    assert.deepEqual(protectedHeader, {
      alg: "ES256",
      nonce: "nonce-1",
      url: directory.newOrder,
      kid: "https://ca.example/acme/account/1",
    });
    assert.equal(order.finalize, "https://ca.example/acme/order/1/finalize");
  });

  test("maps HTTP failures to the unified error taxonomy", async () => {
    const fetch: HttpFetch = async () =>
      new Response(JSON.stringify({ detail: "too many requests" }), {
        status: 429,
      });
    const client = new AcmeClient({
      directoryUrl: "https://ca.example/acme/directory",
      fetch,
    });

    await assert.rejects(client.directory(), (error: unknown) => {
      assert.ok(error instanceof UnsslError);
      assert.equal(error.code, "rate_limited");
      assert.equal(error.retryable, true);
      return true;
    });
  });

  test("letsencrypt driver derives an injected challenge and omits issuance", async () => {
    const driver = letsEncryptDriver();
    const manager = createUnsslManager({ driver });
    const challenge = await manager.createChallenge({
      type: "http-01",
      identifier: "example.com",
      keyAuthorization: "test-token.test-thumbprint",
    });
    assert.equal(challenge.type, "http-01");
    if (challenge.type !== "http-01")
      throw new Error("Expected HTTP-01 challenge");
    assert.equal(challenge.path, "/.well-known/acme-challenge/test-token");

    await assert.rejects(
      manager.issue({ identifiers: ["example.com"], csrPem: csr }),
      (error: unknown) => {
        assert.ok(error instanceof UnsslError);
        assert.equal(error.code, "not_supported");
        return true;
      },
    );
    await manager.dispose();
  });
});

test(
  "loads the public Let's Encrypt directory when live ACME access is enabled",
  { skip: !process.env.UNSSL_TEST_LIVE_ACME },
  async () => {
    const client = new AcmeClient({
      directoryUrl: "https://acme-staging-v02.api.letsencrypt.org/directory",
    });
    const directory = await client.directory();
    assert.match(directory.newNonce, /^https:\/\//);
    assert.match(directory.newAccount, /^https:\/\//);
    assert.match(directory.newOrder, /^https:\/\//);
  },
);

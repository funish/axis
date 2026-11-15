import { describe, expect, test } from "vite-plus/test";

import {
  AcmeClient,
  MemoryNonceStore,
  createSSLManager,
  dns01RecordName,
  dns01RecordValue,
  http01Path,
  type DnsRecord,
  type DnsRecordInput,
  type DnsRecordOperations,
  type HttpFetch,
  type JwsSigner,
} from "../src";
import cloudflareSslDriver from "../src/drivers/cloudflare";
import letsEncryptDriver from "../src/drivers/letsencrypt";
import testingDriver from "../src/drivers/testing";
import zeroSslDriver from "../src/drivers/zerossl";

const csr = [
  "-----BEGIN CERTIFICATE REQUEST-----",
  "Zml4dHVyZS1jc3ItcGxhaW50ZXh0",
  "-----END CERTIFICATE REQUEST-----",
].join("\n");

function createDnsOperations(): DnsRecordOperations & { records: Map<string, DnsRecord[]> } {
  const records = new Map<string, DnsRecord[]>();
  const localName = (name: string, domain: string) =>
    name === domain || name === "@" ? "@" : name.replace(new RegExp(`\\.${domain}$`), "");

  return {
    records,
    async getRecords(domain, options) {
      const stored = records.get(domain) || [];
      const queryName = options?.name ? localName(options.name, domain) : undefined;
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
    const manager = createSSLManager({ driver: testingDriver() });

    const issued = await manager.issue({
      identifiers: ["example.com", "www.example.com"],
      csrPem: csr,
    });
    expect(issued.id).toBe("1");
    expect(issued.certificatePem).toContain("BEGIN CERTIFICATE");

    const renewed = await manager.renew(issued, {
      csrPem: csr,
      metadata: { reason: "rotation" },
    });
    expect(renewed.id).toBe("2");
    expect(renewed.metadata?.renewalOf).toBe(issued.id);

    await manager.revoke({ certificateId: issued.id, reason: "superseded" });
    expect(await manager.getDeploymentMetadata(renewed.id)).toMatchObject({
      certificateId: "2",
      provider: "testing",
    });

    await manager.dispose();
    await manager.dispose();

    await expect(
      manager.issue({ identifiers: ["example.com"], csrPem: csr }),
    ).rejects.toMatchObject({ code: "disposed" });
  });

  test("rejects operations missing from the optional-method contract", async () => {
    const manager = createSSLManager({ driver: zeroSslDriver() });

    await expect(
      manager.issue({ identifiers: ["example.com"], csrPem: csr }),
    ).rejects.toMatchObject({ code: "not_supported" });
    expect(cloudflareSslDriver().options).toEqual({});
  });

  test("uses injected DNS operations without coupling UnSSL to a provider", async () => {
    const dns = createDnsOperations();
    const manager = createSSLManager({
      driver: testingDriver(),
      dns,
    });
    const challenge = await manager.createChallenge({
      type: "dns-01",
      identifier: "www.example.com",
      keyAuthorization: "test-token.test-thumbprint",
    });
    expect(challenge.type).toBe("dns-01");
    if (challenge.type !== "dns-01") throw new Error("Expected DNS-01 challenge");
    expect(challenge.recordName).toBe("_acme-challenge.www.example.com");
    expect(challenge.recordValue).toBe("304jAPwCcBqnD9Rm0ihBOAkZ5SvDCl1QEFlc5qfKeqQ");

    await manager.putDns01Challenge(challenge);
    expect(dns.records.get("www.example.com")).toHaveLength(1);
    await manager.removeDns01Challenge(challenge);
    expect(dns.records.get("www.example.com")).toHaveLength(0);
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
    expect(dns01RecordName("www.example.com")).toBe("_acme-challenge.www.example.com");
    expect(dns01RecordValue(keyAuthorization)).toBe("304jAPwCcBqnD9Rm0ihBOAkZ5SvDCl1QEFlc5qfKeqQ");
    expect(http01Path(keyAuthorization)).toBe("/.well-known/acme-challenge/test-token");
  });

  test("sends RFC 8555 directory, nonce, and JWS request framing", async () => {
    const requests: Array<{ url: string; method?: string; body?: unknown }> = [];
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

    expect(requests.map((request) => request.method)).toEqual(["GET", "HEAD", "POST"]);
    expect(requests[2].url).toBe(directory.newOrder);

    const jws = JSON.parse(String(requests[2].body));
    expect(jws.signature).toBe("fixture-signature");
    expect(Buffer.from(jws.payload, "base64url").toString()).toBe(
      '{"identifiers":[{"type":"dns","value":"example.com"}]}',
    );
    const protectedHeader = JSON.parse(Buffer.from(jws.protected, "base64url").toString());
    expect(protectedHeader).toEqual({
      alg: "ES256",
      nonce: "nonce-1",
      url: directory.newOrder,
      kid: "https://ca.example/acme/account/1",
    });
    expect(order.finalize).toBe("https://ca.example/acme/order/1/finalize");
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

    await expect(client.directory()).rejects.toMatchObject({
      code: "rate_limited",
      retryable: true,
    });
  });

  test("letsencrypt driver derives an injected challenge and omits issuance", async () => {
    const driver = letsEncryptDriver();
    const manager = createSSLManager({ driver });
    const challenge = await manager.createChallenge({
      type: "http-01",
      identifier: "example.com",
      keyAuthorization: "test-token.test-thumbprint",
    });
    expect(challenge.type).toBe("http-01");
    if (challenge.type !== "http-01") throw new Error("Expected HTTP-01 challenge");
    expect(challenge.path).toBe("/.well-known/acme-challenge/test-token");

    await expect(
      manager.issue({ identifiers: ["example.com"], csrPem: csr }),
    ).rejects.toMatchObject({ code: "not_supported" });
    await manager.dispose();
  });
});

test.skipIf(!process.env.UNSSL_TEST_LIVE_ACME)(
  "loads the public Let's Encrypt directory when live ACME access is enabled",
  async () => {
    const client = new AcmeClient({
      directoryUrl: "https://acme-staging-v02.api.letsencrypt.org/directory",
    });
    const directory = await client.directory();
    expect(directory.newNonce).toMatch(/^https:\/\//);
    expect(directory.newAccount).toMatch(/^https:\/\//);
    expect(directory.newOrder).toMatch(/^https:\/\//);
  },
);

import { createHmac } from "node:crypto";

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
  type AcmeProtectedHeader,
  type HttpFetch,
  type JwsSigner,
  type CertificateChallenge,
  type UnsslDriver,
} from "../src";
import acmeDriver from "../src/drivers/acme";
import actalisDriver from "../src/drivers/actalis";
import awsPrivateCaDriver from "../src/drivers/aws-private-ca";
import certiNextDriver from "../src/drivers/certinext";
import certumDriver from "../src/drivers/certum";
import cloudflareOriginCaDriver from "../src/drivers/cloudflare";
import digiCertDriver from "../src/drivers/digicert";
import entrustDriver from "../src/drivers/entrust";
import globalSignDriver from "../src/drivers/globalsign";
import googleTrustServicesDriver from "../src/drivers/googletrustservices";
import haricaDriver from "../src/drivers/harica";
import letsEncryptDriver from "../src/drivers/letsencrypt";
import sectigoDriver from "../src/drivers/sectigo";
import sslComDriver from "../src/drivers/sslcom";
import swissSignDriver from "../src/drivers/swisssign";
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
    const driver: UnsslDriver = { name: "empty", dispose: async () => {} };
    const manager = createSSLManager({ driver });

    await expect(
      manager.issue({ identifiers: ["example.com"], csrPem: csr }),
    ).rejects.toMatchObject({ code: "not_supported" });
    expect(cloudflareOriginCaDriver({ apiToken: "fixture" }).options).toMatchObject({
      apiToken: "fixture",
    });
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

  test("retries a badNonce response with the supplied Replay-Nonce", async () => {
    const requests: Array<{ url: string; method?: string; protectedHeader?: AcmeProtectedHeader }> =
      [];
    let postCount = 0;
    const fetch: HttpFetch = async (url, init) => {
      const method = init?.method;
      requests.push({
        url,
        method,
        ...(method === "POST" &&
          init?.body && {
            protectedHeader: JSON.parse(
              Buffer.from(
                (JSON.parse(init.body as string) as { protected: string }).protected,
                "base64url",
              ).toString(),
            ) as AcmeProtectedHeader,
          }),
      });
      if (method === "GET") return Response.json(directory);
      if (method === "HEAD") {
        return new Response(null, { status: 200, headers: { "replay-nonce": "stale-nonce" } });
      }
      postCount += 1;
      if (postCount === 1) {
        return new Response(
          JSON.stringify({
            type: "urn:ietf:params:acme:error:badNonce",
            detail: "JWS has an unaccepted anti-replay nonce",
          }),
          { status: 400, headers: { "replay-nonce": "fresh-nonce" } },
        );
      }
      return Response.json(
        { status: "pending", identifiers: [{ type: "dns", value: "example.com" }] },
        { status: 201, headers: { "replay-nonce": "next-nonce" } },
      );
    };
    const client = new AcmeClient({
      directoryUrl: "https://ca.example/acme/directory",
      fetch,
      signer: { alg: "ES256", sign: async () => ({ signature: "fixture-signature" }) },
      nonceStore: new MemoryNonceStore(),
      accountUrl: "https://ca.example/acme/account/1",
    });

    await client.newOrder({ identifiers: ["example.com"] });
    expect(requests.map((request) => request.method)).toEqual(["GET", "HEAD", "POST", "POST"]);
    expect(requests[2].protectedHeader?.nonce).toBe("stale-nonce");
    expect(requests[3].protectedHeader?.nonce).toBe("fresh-nonce");
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

  test("letsencrypt driver derives a challenge and requires account setup for issue", async () => {
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
    ).rejects.toMatchObject({ code: "invalid_request" });
    await manager.dispose();
  });
});

describe("SSL vendor drivers", () => {
  test("ZeroSSL REST creates validation, verifies, polls, and downloads", async () => {
    const calls: Array<{ url: string; method?: string; body?: unknown; authorization?: string }> =
      [];
    const certificate = {
      id: "zerossl-id",
      common_name: "example.com",
      additional_domains: "www.example.com",
      status: "pending_validation",
      expires: "2026-12-31 00:00:00",
      validation: {
        other_methods: {
          "example.com": {
            file_validation_url_http: "http://example.com/.well-known/pki-validation/file.txt",
            file_validation_content: ["hash", "comodoca.com", "bundle"],
            cname_validation_p1: "_hash.example.com",
            cname_validation_p2: "target.zerossl.com",
          },
        },
      },
    };
    const fetch: HttpFetch = async (url, init) => {
      calls.push({
        url: String(url),
        method: init?.method,
        body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
        authorization: new Headers(init?.headers).get("authorization") ?? undefined,
      });
      const path = new URL(String(url)).pathname;
      if (path === "/certificates") return Response.json(certificate, { status: 201 });
      if (path === "/certificates/zerossl-id/challenges") return Response.json({ success: 1 });
      if (path === "/certificates/zerossl-id") {
        return Response.json({ ...certificate, status: "issued" });
      }
      if (path === "/certificates/zerossl-id/download/json") {
        return Response.json({
          "certificate.crt": "-----BEGIN CERTIFICATE-----\nleaf\n-----END CERTIFICATE-----",
          "ca_bundle.crt": "-----BEGIN CERTIFICATE-----\nchain\n-----END CERTIFICATE-----",
        });
      }
      throw new Error(`Unexpected ZeroSSL request: ${path}`);
    };

    const driver = zeroSslDriver({ apiKey: "fixture-key", fetch, pollIntervalMs: 0 });
    const manager = createSSLManager({ driver });
    const deployed: CertificateChallenge[] = [];
    const issued = await manager.issue({
      identifiers: ["example.com", "www.example.com"],
      csrPem: csr,
      validityDays: 90,
      validation: {
        method: "http-file",
        onValidation: async (values) => {
          deployed.push(...values);
        },
      },
    });

    expect(calls[0].authorization).toBe("ApiKey fixture-key");
    expect(calls[0].body).toMatchObject({
      certificate_domains: "example.com,www.example.com",
      certificate_validity_days: 90,
    });
    expect(deployed).toHaveLength(1);
    expect(deployed[0]).toMatchObject({
      type: "http-file",
      identifier: "example.com",
      path: "/.well-known/pki-validation/file.txt",
    });
    expect(issued.status).toBe("issued");
    expect(issued.certificatePem).toContain("leaf");
    expect(issued.chainPem).toContain("chain");
    await manager.dispose();
  });

  test("Cloudflare Origin CA creates, inspects, and revokes certificates", async () => {
    const calls: Array<{ url: string; method?: string; authorization?: string }> = [];
    const result = {
      id: "cf-id",
      certificate: "-----BEGIN CERTIFICATE-----\norigin\n-----END CERTIFICATE-----",
      hostnames: ["example.com", "*.example.com"],
      expires_on: "2041-01-01T00:00:00Z",
      request_type: "origin-rsa",
      requested_validity: 5475,
    };
    const fetch: HttpFetch = async (url, init) => {
      calls.push({
        url: String(url),
        method: init?.method,
        authorization: new Headers(init?.headers).get("authorization") ?? undefined,
      });
      const path = new URL(String(url)).pathname;
      if (path === "/client/v4/certificates" && init?.method === "POST") {
        return Response.json({ success: true, result }, { status: 201 });
      }
      if (path === "/client/v4/certificates/cf-id" && init?.method === "GET") {
        return Response.json({ success: true, result });
      }
      if (path === "/client/v4/certificates/cf-id" && init?.method === "DELETE") {
        return Response.json({ success: true, result: { id: "cf-id" } });
      }
      throw new Error(`Unexpected Cloudflare request: ${init?.method} ${path}`);
    };

    const manager = createSSLManager({
      driver: cloudflareOriginCaDriver({ apiToken: "fixture-token", fetch }),
    });
    const issued = await manager.issue({
      identifiers: ["example.com", "*.example.com"],
      csrPem: csr,
      validityDays: 5475,
    });
    const metadata = await manager.getDeploymentMetadata("cf-id");
    await manager.revoke({ certificateId: "cf-id", reason: "keyCompromise" });

    expect(calls[0].authorization).toBe("Bearer fixture-token");
    expect(issued.certificatePem).toContain("origin");
    expect(metadata.properties?.hostnames).toBe("example.com,*.example.com");
    expect(calls[2].method).toBe("DELETE");
    await manager.dispose();
  });

  test("generic ACME issues through account, authorization, challenge, finalize, and download", async () => {
    const directory = {
      newNonce: "https://ca.example/new-nonce",
      newAccount: "https://ca.example/new-account",
      newOrder: "https://ca.example/new-order",
      revokeCert: "https://ca.example/revoke-cert",
    };
    const accountJwk = { kty: "EC", crv: "P-256", x: "fixture-x", y: "fixture-y" };
    const calls: Array<{ url: string; method?: string; body?: unknown }> = [];
    let nonceCount = 0;
    let authorizationPolls = 0;
    const fetch: HttpFetch = async (url, init) => {
      calls.push({
        url: String(url),
        method: init?.method,
        body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      });
      nonceCount += 1;
      const replay = { "replay-nonce": `nonce-${nonceCount}` };
      const path = new URL(String(url)).pathname;
      if (init?.method === "HEAD") return new Response(null, { status: 200, headers: replay });
      if (path === "/directory") return Response.json(directory);
      if (path === "/new-account") {
        return new Response(JSON.stringify({ status: "valid" }), {
          status: 201,
          headers: { ...replay, location: "https://ca.example/account/1" },
        });
      }
      if (path === "/new-order") {
        return Response.json(
          {
            status: "pending",
            url: "https://ca.example/order/1",
            finalize: "https://ca.example/order/1/finalize",
            identifiers: [{ type: "dns", value: "example.com" }],
            authorizations: ["https://ca.example/authz/1"],
          },
          { status: 201, headers: replay },
        );
      }
      if (path === "/authz/1") {
        authorizationPolls += 1;
        return Response.json(
          {
            identifier: { type: "dns", value: "example.com" },
            status: authorizationPolls === 1 ? "pending" : "valid",
            challenges: [{ type: "dns-01", url: "https://ca.example/challenge/1", token: "token" }],
          },
          { headers: replay },
        );
      }
      if (path === "/challenge/1") return Response.json({ status: "pending" }, { headers: replay });
      if (path === "/order/1/finalize") {
        return Response.json(
          {
            status: "valid",
            url: "https://ca.example/order/1",
            certificate: "https://ca.example/cert/1",
          },
          { headers: replay },
        );
      }
      if (path === "/order/1") {
        return Response.json(
          {
            status: "ready",
            url: "https://ca.example/order/1",
            finalize: "https://ca.example/order/1/finalize",
            certificate: "https://ca.example/cert/1",
          },
          { headers: replay },
        );
      }
      if (path === "/cert/1") {
        return new Response("-----BEGIN CERTIFICATE-----\nacme\n-----END CERTIFICATE-----", {
          status: 200,
        });
      }
      throw new Error(`Unexpected ACME request: ${init?.method} ${path}`);
    };

    const driver = acmeDriver({
      provider: "fixture-ca",
      directoryUrl: "https://ca.example/directory",
      fetch,
      signer: { alg: "ES256", sign: async () => ({ signature: "fixture-signature" }) },
      nonceStore: new MemoryNonceStore(),
      accountJwk,
      contacts: ["ops@example.com"],
      externalAccount: { keyId: "eab-kid", hmacKey: "Zml4dHVyZS1obWFjLWtleQ", alg: "HS256" },
      preferredChallenge: "dns-01",
    });
    const manager = createSSLManager({ driver });
    let deployed: CertificateChallenge | undefined;
    const issued = await manager.issue({
      identifiers: ["example.com"],
      csrPem: csr,
      acme: {
        preferredChallenge: "dns-01",
        pollIntervalMs: 0,
        onChallenge: async (challenge) => {
          deployed = challenge;
        },
      },
    });

    const accountCall = calls.find((call) => call.url === directory.newAccount);
    const accountJws = accountCall?.body as { payload: string };
    const accountPayload = JSON.parse(Buffer.from(accountJws.payload, "base64url").toString()) as {
      contact: string[];
      externalAccountBinding: { protected: string; payload: string; signature: string };
    };
    const encodedProtected = accountPayload.externalAccountBinding.protected;
    const encodedPayload = accountPayload.externalAccountBinding.payload;
    const expectedSignature = createHmac("sha256", "Zml4dHVyZS1obWFjLWtleQ")
      .update(`${encodedProtected}.${encodedPayload}`)
      .digest("base64url");

    expect(JSON.parse(Buffer.from(encodedProtected, "base64url").toString())).toEqual({
      alg: "HS256",
      kid: "eab-kid",
      url: directory.newAccount,
    });
    expect(accountPayload.externalAccountBinding.signature).toBe(expectedSignature);
    expect(accountPayload.contact).toEqual(["mailto:ops@example.com"]);
    const authorizationCall = calls.find((call) => call.url === "https://ca.example/authz/1");
    if (!authorizationCall) throw new Error("Missing authorization call");
    expect(authorizationCall.method).toBe("POST");
    expect(
      Buffer.from((authorizationCall.body as { payload: string }).payload, "base64url").toString(),
    ).toBe("{}");
    const finalizeCall = calls.find((call) => call.url === "https://ca.example/order/1/finalize");
    if (!finalizeCall) throw new Error("Missing finalize call");
    expect(
      JSON.parse(
        Buffer.from((finalizeCall.body as { payload: string }).payload, "base64url").toString(),
      ),
    ).toEqual({ csr: "Zml4dHVyZS1jc3ItcGxhaW50ZXh0" });
    const certificateCall = calls.find((call) => call.url === "https://ca.example/cert/1");
    if (!certificateCall) throw new Error("Missing certificate call");
    expect(certificateCall.method).toBe("POST");
    expect(deployed?.type).toBe("dns-01");
    expect(issued.certificatePem).toContain("acme");
    await manager.dispose();
  });

  test("exposes documented ACME directory presets", async () => {
    const staging = letsEncryptDriver({ staging: true });
    const sslComRsa = sslComDriver({ algorithm: "rsa" });
    const digiCertUs = digiCertDriver({
      externalAccount: { keyId: "fixture", hmacKey: "fixture" },
    });
    const digiCertEu = digiCertDriver({
      region: "eu",
      externalAccount: { keyId: "fixture", hmacKey: "fixture" },
    });
    const entrust = entrustDriver({
      externalAccount: { keyId: "fixture", hmacKey: "fixture" },
    });
    const certum = certumDriver({
      externalAccount: { keyId: "fixture", hmacKey: "fixture" },
    });
    const harica = haricaDriver({
      directoryUrl: "https://acme-v02.harica.gr/acme/fixture-endpoint/directory",
      externalAccount: { keyId: "fixture", hmacKey: "fixture" },
    });
    const swissSign = swissSignDriver({
      directoryUrl: "https://horizon.example/acme/fixture-profile/directory",
    });
    const awsPrivateCa = awsPrivateCaDriver({
      directoryUrl: "https://acm.example.amazonaws.com/acme/directory",
      externalAccount: { keyId: "fixture", hmacKey: "fixture" },
    });
    const sectigoOv = sectigoDriver({
      validationType: "OV",
      externalAccount: { keyId: "fixture", hmacKey: "fixture" },
    });
    const certiNextSandbox = certiNextDriver({
      environment: "sandbox",
      externalAccount: { keyId: "fixture", hmacKey: "fixture" },
    });

    expect(staging.options?.directoryUrl).toBe(
      "https://acme-staging-v02.api.letsencrypt.org/directory",
    );
    expect(sslComRsa.options?.directoryUrl).toBe("https://acme.ssl.com/sslcom-dv-rsa");
    expect(digiCertUs.options?.directoryUrl).toBe(
      "https://one.us.digicert.com/mpki/api/v1/acme/v2/directory",
    );
    expect(digiCertEu.options?.directoryUrl).toBe(
      "https://one.nl.digicert.com/mpki/api/v1/acme/v2/directory",
    );
    expect(entrust.options?.directoryUrl).toBe("https://acme.entrust.net/acme2/directory");
    expect(certum.options?.directoryUrl).toBe("https://acme.certum.pl/directory");
    expect(harica.options?.directoryUrl).toBe(
      "https://acme-v02.harica.gr/acme/fixture-endpoint/directory",
    );
    expect(swissSign.options?.directoryUrl).toBe(
      "https://horizon.example/acme/fixture-profile/directory",
    );
    expect(awsPrivateCa.options?.directoryUrl).toBe(
      "https://acm.example.amazonaws.com/acme/directory",
    );
    expect(sectigoOv.options?.directoryUrl).toBe("https://acme.sectigo.com/v2/OV");
    expect(certiNextSandbox.options?.directoryUrl).toBe(
      "https://sandbox-us-acme.certinext.io/v1/directory",
    );
    expect(
      googleTrustServicesDriver({
        staging: true,
        externalAccount: { keyId: "fixture", hmacKey: "fixture" },
      }).options?.directoryUrl,
    ).toBe("https://dv.acme-v02.test-api.pki.goog/directory");
    expect(
      globalSignDriver({ externalAccount: { keyId: "k", hmacKey: "h" } }).options?.directoryUrl,
    ).toBe("https://emea.acme.atlas.globalsign.com/directory");
    expect(
      actalisDriver({ externalAccount: { keyId: "k", hmacKey: "h" } }).options?.directoryUrl,
    ).toBe("https://acme-api.actalis.com/acme/directory");
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

# unssl

Unified TLS certificate lifecycle orchestration with vendor-specific drivers and injected dependencies.

## Driver contract

Drivers follow the repository's optional-method pattern: implement only the operations the provider actually supports. `createSSLManager` rejects unsupported calls with a stable `SSLError` instead of relying on duplicated metadata.

Supported operations are:

- `issue`
- `renew`
- `revoke`
- `getDeploymentMetadata`
- `createChallenge` for HTTP-01 and DNS-01
- `dispose`

## Generic ACME

`drivers/acme` implements RFC 8555 directory discovery, nonce handling and `badNonce` retry, JWS requests, account creation, External Account Binding (EAB), authorization/challenge polling, order finalization, POST-as-GET certificate download, and revocation. PEM CSR and certificate inputs are converted to the base64url DER representations required by ACME.

```typescript
import { createSSLManager } from "unssl";
import acmeDriver from "unssl/drivers/acme";

const ssl = createSSLManager({
  driver: acmeDriver({
    provider: "custom-acme",
    directoryUrl: "https://acme.example.com/directory",
    accountJwk, // account public JWK; account private keys stay in your signer
    signer,
    contacts: ["ops@example.com"],
    externalAccount: { keyId, hmacKey, alg: "HS256" },
    preferredChallenge: "dns-01",
  }),
  dns,
});

const certificate = await ssl.issue({
  identifiers: ["example.com"],
  csrPem,
  acme: {
    preferredChallenge: "dns-01",
    onChallenge: async (challenge) => {
      // Serve HTTP-01 content or place DNS-01 through the injected dns adapter.
    },
    onChallengeComplete: async (challenge) => {
      // Remove or deactivate the challenge after authorization becomes valid.
    },
  },
});
```

The callback receives either an HTTP-01 challenge with `path` and `content`, or a DNS-01 challenge with `recordName` and `recordValue`. `manager.putDns01Challenge` and `manager.removeDns01Challenge` can use an injected `DnsRecordOperations` adapter.

After every pending authorization is valid, the driver polls the order through `ready`, sends finalize once, and then polls `processing` until `valid`. An order already in `processing` or `valid` is never finalized again.

Polling uses 1 second by default. Set `pollIntervalMs` at driver level or per issue; `0` means poll without delay, while omitting it uses the next configured value or the default.

## ACME provider drivers

Provider presets map documented endpoints and account/profile-specific directory URLs to the generic driver:

| Driver                | Endpoint model                                           | Notes                                                      |
| --------------------- | -------------------------------------------------------- | ---------------------------------------------------------- |
| `letsencrypt`         | Production or `staging: true` directory                  | No EAB                                                     |
| `zerossl-acme`        | `https://acme.zerossl.com/v2/DV90`                       | EAB required                                               |
| `googletrustservices` | Production or staging directory                          | EAB required                                               |
| `sslcom`              | ECC or RSA directory                                     | EAB normally required                                      |
| `sectigo`             | `DV` or `OV` directory                                   | EAB required                                               |
| `digicert`            | Regional `us`, `eu`, or `jp` directory; product override | EAB credentials are generated per certificate type         |
| `globalsign`          | Atlas ACME directory                                     | ACME/EAB account setup required                            |
| `certinext`           | Production or sandbox directory                          | EAB required                                               |
| `actalis`             | Fixed directory                                          | EAB required                                               |
| `entrust`             | `https://acme.entrust.net/acme2/directory`               | EAB credentials required                                   |
| `certum`              | `https://acme.certum.pl/directory`                       | EAB credentials required                                   |
| `harica`              | Account endpoint-specific directory URL                  | Endpoint and EAB created in HARICA CertManager             |
| `swisssign`           | Horizon tenant/profile directory URL                     | Endpoint format: `https://<host>/acme/<profile>/directory` |
| `aws-private-ca`      | ACM-created endpoint-specific directory URL              | EAB required                                               |

```typescript
import digiCertDriver from "unssl/drivers/digicert";
import haricaDriver from "unssl/drivers/harica";
import letsEncryptDriver from "unssl/drivers/letsencrypt";

const letsEncrypt = letsEncryptDriver({ staging: true });
const digiCert = digiCertDriver({ region: "eu", externalAccount });
const harica = haricaDriver({
  directoryUrl: haricaDirectoryUrlFromCertManager,
  externalAccount,
});
```

Some vendors issue a different directory URL per account, credential, product, tenant, or profile. Use the exact URL shown by the vendor console; a generic vendor name does not imply a single public endpoint.

## Provider REST drivers

- **zerossl** — ZeroSSL REST API creates a CSR-based order, returns HTTP-file or DNS-CNAME validation data, invokes validation callbacks, verifies, polls, downloads, inspects, and revokes.
- **cloudflare** — Cloudflare Origin CA creates from a CSR and hostnames, selects an allowed validity, inspects metadata, and revokes. This is an origin CA driver, not a public-trust CA driver.

```typescript
import cloudflareOriginCaDriver from "unssl/drivers/cloudflare";
import zeroSslDriver from "unssl/drivers/zerossl";

const zerossl = zeroSslDriver({ apiKey });
const origin = cloudflareOriginCaDriver({
  apiToken,
  requestType: "origin-rsa",
  requestedValidity: 90,
});
```

ZeroSSL validation callbacks receive all challenges for the selected method before the driver asks the provider to verify. This differs from ACME, whose callbacks are invoked per authorization challenge:

```typescript
await ssl.issue({
  identifiers: ["example.com"],
  csrPem,
  validityDays: 90,
  validation: {
    method: "http-file",
    onValidation: async (challenges) => {
      // Publish each challenge.path / challenge.content or CNAME record.
    },
    onValidationComplete: async (challenges) => {
      // Clean up validation artifacts after issuance completes.
    },
  },
});
```

ZeroSSL REST polling uses 2 seconds by default. Set `pollIntervalMs` at driver level or per validation; `0` means poll without delay, while omitting it uses the next configured value or the default.

- **testing** — deterministic in-memory issue/renew/revoke/deployment/challenge driver for tests.

BuyPass is intentionally absent: its SSL/ACME service was discontinued.

## Dependency injection

SSL does not read private keys or operate DNS itself. `JwsSigner`, `NonceStore`, `HttpFetch`, polling, and DNS adapters are supplied by the application.

```typescript
import { createSSLManager } from "unssl";
import testingDriver from "unssl/drivers/testing";

const ssl = createSSLManager({
  driver: testingDriver(),
  // dns: optional getRecords/setRecord/upsertRecord/removeRecord adapter
});
```

The exported `KeyStorage` interface is for application-owned adapters. It is intentionally not accepted by `createSSLManager`: SSL does not generate private keys, and storage policy must remain in the application or a driver-specific option.

## DNS-01

The DNS boundary is intentionally minimal:

```typescript
interface DnsRecordOperations {
  getRecords(domain, options?): DnsRecord[] | Promise<DnsRecord[]>;
  setRecord(domain, record): DnsRecord | Promise<DnsRecord>;
  upsertRecord?(domain, record): DnsRecord | Promise<DnsRecord>;
  removeRecord(domain, record): void | Promise<void>;
}
```

The manager can put and remove the derived TXT value through that interface. Propagation waiting is deliberately left to the consumer or a DNS-aware driver, because resolver strategy is deployment policy.

## Live fixtures

Protocol fixtures do not touch the network. Set `SSL_TEST_LIVE_ACME=1` to run the public directory discovery check; other live issuance paths require provider accounts and are not enabled by default.

## Errors

All failures use `SSLError` with stable `code` values: `invalid_request`, `unauthorized`, `not_found`, `rate_limited`, `challenge_failed`, `not_supported`, `network`, `provider_error`, `key_storage`, and `disposed`.

## Dispose

Every driver can expose `dispose`, and `createSSLManager().dispose()` is idempotent. After disposal, lifecycle operations reject with the `disposed` error code.

## License

MIT

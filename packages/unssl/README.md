# UnSSL

Unified TLS certificate lifecycle orchestration with vendor-specific drivers and injected dependencies.

## Driver contract

Drivers follow the repository's optional-method pattern: implement only the operations the provider actually supports. `createSSLManager` rejects unsupported calls with a stable `UnsslError` instead of relying on duplicated metadata.

Supported operations are:

- `issue`
- `renew`
- `revoke`
- `getDeploymentMetadata`
- `createChallenge` for HTTP-01 and DNS-01
- `dispose`

## Drivers

- **letsencrypt** — RFC 8555 directory parsing, nonce handling, JWS request framing, order creation/finalization/certificate download, and HTTP-01/DNS-01 challenge naming. Driver-level issuance, renewal, and revocation are not implemented; the caller owns account signing and CSR completion.
- **testing** — deterministic in-memory issue/renew/revoke/deployment/challenge driver for tests.
- **zerossl** — provider binding is not enabled.
- **cloudflare** — Cloudflare SSL and origin certificate provider binding is not enabled.

## Dependency injection

UnSSL does not read private keys or operate DNS itself.

```typescript
import { createSSLManager } from "unssl";
import testingDriver from "unssl/drivers/testing";

const ssl = createSSLManager({
  driver: testingDriver(),
  // keyStorage: optional application-controlled storage adapter
  // dns: optional getRecords/setRecord/upsertRecord/removeRecord adapter
});
```

`KeyStorage` is only an interface. Implementations must remain outside this package because key-material isolation is application and platform policy.

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

## ACME JWS

RFC 8555 requests require an injected `JwsSigner`; UnSSL never loads or serializes an account private key. Real Let's Encrypt calls are not made unless the consumer supplies `fetch` and signer dependencies. Integration tests use directory and response fixtures.

## Errors

All failures use `UnsslError` with stable `code` values: `invalid_request`, `unauthorized`, `not_found`, `rate_limited`, `challenge_failed`, `not_supported`, `network`, `provider_error`, `key_storage`, and `disposed`.

## Dispose

Every driver can expose `dispose`, and `createSSLManager().dispose()` is idempotent. After disposal, lifecycle operations reject with the `disposed` error code.

## License

MIT

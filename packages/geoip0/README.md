# GeoIP0

![npm version](https://img.shields.io/npm/v/geoip0)
![npm downloads](https://img.shields.io/npm/dw/geoip0)
![npm license](https://img.shields.io/npm/l/geoip0)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg)](https://www.contributor-covenant.org/version/2/1/code_of_conduct/)

> Unified geolocation information query library with multi-provider support

## Features

- 🌍 **Multi-Provider Drivers**: Explicit capability metadata across Cloudflare, FreeIPAPI, ip2location.io, ip-api, IP.SB, ipwho.is, MaxMind, and RDAP
- 🔄 **Driver Pattern**: A consistent lookup API with provider-specific options
- 📝 **TypeScript First**: Full type safety for normalized location data
- 🚀 **Bounded Batching**: Configurable batch size and concurrency for remote providers
- 🎯 **IP-Version Aware**: IPv4, IPv6, and auto-detection preferences where supported
- 🛡️ **RESTful Server**: Built-in h3 server with trusted-proxy, request-size, and CORS controls
- 🔍 **Fallback Support**: Hybrid drivers distinguish missing data from provider errors
- 🗄️ **MMDB Support**: Local MaxMind lookups with prefix-length-preserving caching

## Installation

```bash
npm install geoip0
# yarn add geoip0
# pnpm add geoip0
```

## Usage

```typescript
import { createGeoIPManager } from "geoip0";
import hybridDriver from "geoip0/drivers/hybrid";
import ipsbDriver from "geoip0/drivers/ipsb";
import rdapDriver from "geoip0/drivers/rdap";

const geoip = createGeoIPManager({
  driver: hybridDriver({
    drivers: [ipsbDriver(), rdapDriver()],
    fallbackOn: {
      missingData: true,
      providerError: true,
    },
  }),
});

const location = await geoip.lookup("1.1.1.1");
const current = await geoip.current();
const locations = await geoip.batchLookup(["1.1.1.1", "8.8.8.8"], {
  batchSize: 50,
  concurrency: 2,
});
```

### Normalization

`GeoLocation` keeps only fields the provider actually returned. For example, a
provider that cannot report coordinates or proxy status will not contain
`latitude`, `longitude`, or `isProxy`; an explicit `isProxy: false` is retained.
This prevents a false flag from becoming indistinguishable from real provider
data.

Older code that expects the previous fully populated shape can opt into legacy
sparse fields:

```typescript
const location = await geoip.lookup("1.1.1.1", {
  legacySparseFields: true,
});
```

The compatibility mode fills absent string fields with `""`, coordinates with
`0`, `isProxy` with `false`, and renders `accuracyRadius` as a string.

### Driver matrix

| Driver           |  Lookup | Current |             Batch |           Native bulk |             Proxy flag | Notes                                                                |
| ---------------- | ------: | ------: | ----------------: | --------------------: | ---------------------: | -------------------------------------------------------------------- |
| Cloudflare Radar |      ✅ |      ✅ |            Per IP |                    No |                     No | `baseUrl`; batch defaults `batchSize: 1`, `concurrency: 2`           |
| FreeIPAPI        |      ✅ |      ✅ |            Native | Yes, paid; 50/request |                    Yes | `batchSize: 50`, `concurrency: 2`                                    |
| Hybrid           | Depends | Depends | Fills missing IPs |                    No |                Depends | Sequential provider rounds; per-driver batching is bounded           |
| ip2location.io   |      ✅ |      ✅ |            Per IP |                    No |                    Yes | `key` required; `batchSize: 1`, `concurrency: 2`                     |
| ipapi.co         |      ✅ |      ✅ |            Per IP |                    No |                     No | `fields`; `batchSize: 1`, `concurrency: 3`                           |
| IP-API.com       |      ✅ |      ✅ |            Native |      Yes; 100/request |                    Yes | HTTP free endpoint; `batchSize: 100`, `concurrency: 1`               |
| IP.SB            |      ✅ |      ✅ |            Per IP |                    No |                     No | Version-specific current endpoints; `batchSize: 1`, `concurrency: 2` |
| ipwho.is         |      ✅ |      ✅ |            Per IP |         Free plan: no |   Paid `security` only | `baseUrl` and `security`; `batchSize: 1`, `concurrency: 2`           |
| MaxMind MMDB     |      ✅ |      No |             Local |                    No | Depends on MMDB traits | `mode: "mmdb"`; local batch default `concurrency: 8`                 |
| MaxMind Web      |      ✅ |      ✅ |            Per IP |                    No |                    Yes | Account ID/license required; web fallback MMDB supported             |
| RDAP             |      ✅ |      No |            Per IP |                    No |                     No | Registry network/organization data; `batchSize: 1`, `concurrency: 2` |

`batchSize` and `concurrency` can also be passed at call time through
`BatchQueryOptions`. Drivers combine call-time values with driver defaults.
Capability fields are available on each driver as `driver.capabilities`.

```typescript
import ipWhoisDriver from "geoip0/drivers/ipwhois";

const driver = ipWhoisDriver({
  baseUrl: "https://ipwho.is",
  security: true, // request provider security data on supported paid plans
  batchSize: 1,
  concurrency: 2,
});
```

### Hybrid fallback

Hybrid distinguishes three cases:

- **Unavailable operation**: skipped because the driver method is missing or its
  capability is `false`.
- **Provider error**: thrown by a driver as `GeoIPProviderError`. By default,
  hybrid continues to the next provider. Set `fallbackOn.providerError: false`
  to surface the error.
- **Missing data**: the provider returned no usable data or only ip/source. By
  default, hybrid tries later providers and batch rounds fill missing IPs. Set
  `fallbackOn.missingData: false` to treat an empty/sparse result as
  authoritative.

Drivers with only `lookup` can still participate in hybrid `batchLookup`; hybrid
uses bounded per-IP fan-out for those drivers.

## HTTP Server

```typescript
import ipsbDriver from "geoip0/drivers/ipsb";
import { createGeoIPServer } from "geoip0/server";

const server = createGeoIPServer({
  driver: ipsbDriver(),
  trustProxy: ["10.0.0.2"], // omit to ignore X-Forwarded-* completely
  maxIps: 100,
  maxBodyBytes: 1024 * 1024,
  batchOptions: { batchSize: 100, concurrency: 1 },
  cors: {
    origin: "https://example.test",
    allowHeaders: ["X-API-Key"],
    allowMethods: ["GET", "POST"],
  },
});

server.serve(3000);
```

Use `createGeoIPHandler` with an existing h3 app. The handler exposes `/`,
`/help`, `/current`, `/{ip}`, and `POST /batch`.

Server options:

- `trustProxy` defaults to `false`, so forwarding headers cannot select the
  client IP. Accepts `true`, a trusted proxy IP list, or a predicate. With a
  list, the resolver returns the rightmost forwarded address outside the trusted
  chain.
- `maxBodyBytes` defaults to 1 MiB and checks both `Content-Length` and decoded
  request bytes.
- `maxIps` defaults to 100.
- `batchOptions` bounds provider work server-side.
- `cors` defaults to a wildcard origin for basic GET/HEAD/POST use. Setting
  custom `allowHeaders` or `allowMethods` without an origin does not force a
  wildcard origin. `origin: false` omits CORS headers.

Provider failures return HTTP 502; successful responses without geolocation
data return HTTP 404. The help payload reports the version from `package.json`.

## MMDB

```typescript
import { readFile } from "fs/promises";

import { createMMDBParser } from "geoip0/mmdb";

const parser = createMMDBParser(await readFile("./GeoLite2-City.mmdb"), {
  enableCache: true,
  cacheSize: 1000,
});

const result = parser.getWithPrefixLength("1.1.1.1");
console.log(result.data, result.prefixLength);
```

The result cache stores the complete `ParseResult`, so repeated lookups retain
the matching network's `prefixLength`. Missing records and their prefix depth are
also cached. The decoder validates string, bytes, scalar, and pointer reads
against the database boundary.

## Error handling

```typescript
import { GeoIPProviderError } from "geoip0";

try {
  const location = await geoip.lookup("192.0.2.1");
  if (!location) {
    console.log("No usable provider result");
  }
} catch (error) {
  if (error instanceof GeoIPProviderError) {
    console.error(error.provider, error.message);
  } else {
    throw error;
  }
}
```

## API

### `lookup(ip, options?)`

Returns `Promise<GeoLocation | null>`. Providers may throw
`GeoIPProviderError` for request or application failures.

### `current(options?)`

Returns `Promise<GeoLocation | null>` for providers that support caller-IP
lookup. Unsupported operations return `null` through the manager.

### `batchLookup(ips, options?)`

Returns `Promise<GeoLocation[]>`, omitting failed or missing individual
lookups. `options` accepts `version`, `legacySparseFields`, `batchSize`, and
`concurrency`.

### `GeoLocation`

```typescript
export interface GeoLocation {
  ip: string;
  country?: string;
  countryCode?: string;
  region?: string;
  regionCode?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  isp?: string;
  org?: string;
  asn?: string;
  timezone?: string;
  source: string;
  accuracyRadius?: number | string;
  isProxy?: boolean;
}
```

`ip` and `source` are always present. All other provider-dependent fields are
optional.

## License

- [MIT](LICENSE) &copy; [Funish](http://www.funish.net/)

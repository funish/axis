# GeoIP0

![npm version](https://img.shields.io/npm/v/geoip0)
![npm downloads](https://img.shields.io/npm/dw/geoip0)
![npm license](https://img.shields.io/npm/l/geoip0)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg)](https://www.contributor-covenant.org/version/2/1/code_of_conduct/)

> Unified geolocation information query library with multi-provider support

## Features

- 🌍 **Multi-Provider Support**: Unified API for IP.SB, Cloudflare Radar, MaxMind, RDAP, and more
- 🔄 **Driver Pattern**: Consistent interface across different geolocation providers
- 📝 **TypeScript First**: Full type safety with comprehensive location data types
- 🚀 **High Performance**: Built on modern HTTP clients with minimal dependencies
- 🎯 **IP-Version Aware**: Support for IPv4, IPv6, and auto-detection
- 🛡️ **RESTful Server**: Built-in HTTP server for geolocation API services
- 🔍 **Fallback Support**: Automatic fallback between providers for reliability
- 🗄️ **MMDB Support**: Native MaxMind database support with high-performance local lookups
- 🌐 **Web Service Integration**: MaxMind GeoIP Web Services with comprehensive data
- 🔧 **Dual Mode**: Seamless switching between MMDB database and web service modes
- 🔄 **Multi-Driver Support**: Combine multiple providers with automatic fallback for high reliability

## Installation

```bash
# Install with npm
$ npm install geoip0

# Install with yarn
$ yarn add geoip0

# Install with pnpm
$ pnpm add geoip0
```

## Usage

### Basic Setup

```typescript
import { createGeoIPManager } from "geoip0";
import ipsbDriver from "geoip0/drivers/ipsb";
import multiDriver from "geoip0/drivers/multi";

// Create GeoIP manager with single driver
const geoip = createGeoIPManager({
  driver: ipsbDriver(),
});

// Create GeoIP manager with multiple drivers (automatic fallback)
const geoipFallback = createGeoIPManager({
  driver: multiDriver({
    drivers: [
      ipsbDriver(), // Try IP.SB first
      rdapDriver(), // Try RDAP for official registry data
      freeipapiDriver(), // Fallback to FreeIPAPI
      cloudflareDriver(), // Fallback to Cloudflare
    ],
  }),
});

// Create GeoIP manager with RDAP driver for official registry data
const geoipRdap = createGeoIPManager({
  driver: rdapDriver(),
});
```

### Querying IP Geolocation

```typescript
// Lookup geolocation for specific IP
const location = await geoip.lookup("1.1.1.1");

// Get current IP geolocation
const currentLocation = await geoip.current();

// Batch lookup for multiple IPs
const locations = await geoip.batchLookup([
  "1.1.1.1",
  "8.8.8.8",
  "2606:4700:4700::1111",
]);

// Lookup with version preference
const ipv4Location = await geoip.lookup("8.8.8.8", { version: "ipv4" });
const ipv6Location = await geoip.lookup("2606:4700:4700::1111", {
  version: "ipv6",
});
```

### Working with IP Versions

```typescript
// Get current IP with specific version
const currentIPv4 = await geoip.current({ version: "ipv4" });
const currentIPv6 = await geoip.current({ version: "ipv6" });
const autoDetect = await geoip.current({ version: "auto" });
```

### Available Drivers

```typescript
// IP.SB driver (comprehensive geolocation data)
import ipsbDriver from "geoip0/drivers/ipsb";

// Cloudflare Radar driver (ASN and network info)
import cloudflareDriver from "geoip0/drivers/cloudflare";

// FreeIPAPI driver (free geolocation API with bulk support)
import freeipapiDriver from "geoip0/drivers/freeipapi";

// IP-API.com driver (high-performance API with 100 IP batch limit)
import ipApiComDriver from "geoip0/drivers/ipApiCom";

// ipapi.co driver (rich geolocation data with field customization)
import ipapiCoDriver from "geoip0/drivers/ipapiCo";

// ip2location.io driver (comprehensive geolocation with API key)
import ip2LocationDriver from "geoip0/drivers/ip2Location";

// MaxMind driver (MMDB database and Web Service with fallback support)
import maxmindDriver, {
  MaxMindMMDBOptions,
  MaxMindWebOptions,
} from "geoip0/drivers/maxmind";

// RDAP driver (official registry data from Regional Internet Registries)
import rdapDriver, { RdapDriverOptions } from "geoip0/drivers/rdap";

// Multi driver (automatic fallback between multiple drivers)
import multiDriver from "geoip0/drivers/multi";
```

### HTTP Server

```typescript
import { createGeoIPServer, createGeoIPHandler } from "geoip0/server";
import ipsbDriver from "geoip0/drivers/ipsb";

// Create and start GeoIP server
const server = createGeoIPServer({ driver: ipsbDriver() });
server.serve(3000);
console.log("GeoIP Server running on http://localhost:3000");

// Use handler with existing h3 app
import { createApp } from "h3";
const app = createApp();
const geoipHandler = createGeoIPHandler({ driver: ipsbDriver() });
app.use("/**", geoipHandler);
```

### MMDB Module

For direct MMDB database operations, use the dedicated MMDB module:

```typescript
import { createMMDBParser } from "geoip0/mmdb";
import { readFile } from "fs/promises";

// Load MMDB database
const mmdbData = await readFile("./GeoLite2-City.mmdb");

// Create parser
const parser = createMMDBParser(mmdbData);

// Query IP geolocation
const result = parser.get("8.8.8.8");
console.log(result); // Raw MMDB data structure

// Advanced usage with metadata
import { MMDBMetadataParser } from "geoip0/mmdb";
const metadata = MMDBMetadataParser.parse(mmdbData);
console.log(metadata.databaseType, metadata.buildEpoch);
```

### RDAP Driver

RDAP (Registration Data Access Protocol) provides official network registry data from Regional Internet Registries. This driver offers authoritative information about IP network ownership and organization details.

```typescript
import rdapDriver, { RdapDriverOptions } from "geoip0/drivers/rdap";

// Basic RDAP driver usage
const rdap = createGeoIPManager({
  driver: rdapDriver(),
});

// RDAP driver with custom configuration
const rdapCustom = createGeoIPManager({
  driver: rdapDriver({
    baseUrl: "https://rdap.arin.net/registry", // Custom RDAP server
  }),
});

// Query IP using RDAP
const result = await rdap.lookup("8.8.8.8");
console.log(result);
// Output: {
//   ip: "8.8.8.8",
//   country: "US",
//   isp: "Google LLC",
//   org: "Google LLC",
//   asn: "15169",
//   source: "rdap"
// }
```

**RDAP Driver Features:**

- **Official Data**: Provides authoritative network registry information
- **Network Ownership**: Detailed ISP and organization data
- **Entity Information**: Rich contact and organizational details when available
- **ASN Information**: Autonomous System Numbers and network ranges
- **Custom Servers**: Support for regional RDAP servers
- **IPv4/IPv6 Support**: Full support for both IP versions

**Limitations:**

- No current IP detection (requires specific IP address)
- Less precise geolocation compared to commercial GeoIP services
- Data focuses on network ownership rather than exact locations

### Error Handling

```typescript
try {
  const location = await geoip.lookup("invalid-ip");
  if (location) {
    console.log("Location:", location);
  } else {
    console.log("No geolocation data found");
  }
} catch (error) {
  console.error("Geolocation query failed:", error);
}
```

## API Reference

### GeoIP Manager

#### `createGeoIPManager(options)`

Creates a new GeoIP manager instance with the specified driver.

**Parameters:**

- `options.driver` - GeoIP driver instance (IP.SB, Cloudflare, etc.)

**Returns:** GeoIP manager instance with methods below.

#### Methods

##### `lookup(ip, options?)`

Get geolocation information for a specific IP address.

**Parameters:**

- `ip` (string) - IP address to query
- `options` (object, optional) - Query options
  - `version` ('ipv4' | 'ipv6' | 'auto') - IP version preference

**Returns:** `Promise<GeoLocation | null>` - Geolocation data or null

##### `current(options?)`

Get geolocation information for the current client IP.

**Parameters:**

- `options` (object, optional) - Query options
  - `version` ('ipv4' | 'ipv6' | 'auto') - IP version preference

**Returns:** `Promise<GeoLocation | null>` - Current location data or null

##### `batchLookup(ips, options?)`

Get geolocation information for multiple IP addresses in a single request.

**Parameters:**

- `ips` (string[]) - Array of IP addresses to query
- `options` (object, optional) - Query options
  - `version` ('ipv4' | 'ipv6' | 'auto') - IP version preference

**Returns:** `Promise<GeoLocation[]> - Array of geolocation data for valid IPs

### GeoIP Server

#### `createGeoIPServer(options)`

Creates a new GeoIP HTTP server instance.

**Parameters:**

- `options.driver` - GeoIP driver instance
- `options.authorize` (function, optional) - Authorization function

**Returns:** Server instance with `serve()` method

#### `createGeoIPHandler(options)`

Creates a GeoIP request handler for use with h3.

**Parameters:** Same as `createGeoIPServer`

**Returns:** `EventHandlerWithFetch` - h3 compatible handler

### GeoLocation Type

The geolocation data structure:

```typescript
export interface GeoLocation {
  ip?: string; // IP address
  country?: string; // Country name
  countryCode?: string; // Country code
  region?: string; // Region/Province
  regionCode?: string; // ISO 3166-2 region code (e.g., "US-CA")
  city?: string; // City
  latitude?: number; // Latitude
  longitude?: number; // Longitude
  isp?: string; // ISP provider
  org?: string; // Organization
  asn?: string; // ASN number
  timezone?: string; // Timezone
  source?: string; // Data source

  // Extended fields (optional, data source dependent)
  accuracyRadius?: number; // Accuracy radius in kilometers
  isProxy?: boolean; // Whether IP is identified as proxy/VPN
}
```

## HTTP Endpoints

### GET /help

Returns server information and available endpoints.

### GET /current

Returns geolocation data for the client's IP address.

**Query Parameters:**

- `version` (optional) - IP version preference: 'ipv4', 'ipv6', 'auto'

### GET /{ip}

Returns geolocation data for the specified IP address.

**Query Parameters:**

- `version` (optional) - IP version preference: 'ipv4', 'ipv6', 'auto'

### POST /batch

Returns geolocation data for multiple IP addresses.

**Request Body:**

```json
{
  "ips": ["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"]
}
```

**Query Parameters:**

- `version` (optional) - IP version preference: 'ipv4', 'ipv6', 'auto'

**Response:**

```json
[
  {
    "ip": "1.1.1.1",
    "country": "United States",
    "countryCode": "US"
    // ... other fields
  }
  // ... more results
]
```

## License

- [MIT](LICENSE) &copy; [Funish](http://www.funish.net/)

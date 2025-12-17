# GeoIP0

![npm version](https://img.shields.io/npm/v/geoip0)
![npm downloads](https://img.shields.io/npm/dw/geoip0)
![npm license](https://img.shields.io/npm/l/geoip0)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg)](https://www.contributor-covenant.org/version/2/1/code_of_conduct/)

> Unified geolocation information query library with multi-provider support

## Features

- 🌍 **Multi-Provider Support**: Unified API for IP.SB, Cloudflare Radar, and more
- 🔄 **Driver Pattern**: Consistent interface across different geolocation providers
- 📝 **TypeScript First**: Full type safety with comprehensive location data types
- 🚀 **High Performance**: Built on modern HTTP clients with minimal dependencies
- 🎯 **IP-Version Aware**: Support for IPv4, IPv6, and auto-detection
- 🛡️ **RESTful Server**: Built-in HTTP server for geolocation API services
- 🔍 **Fallback Support**: Automatic fallback between providers for reliability

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

// Create GeoIP manager with IP.SB driver
const geoip = createGeoIPManager({
  driver: ipsbDriver(),
});
```

### Querying IP Geolocation

```typescript
// Lookup geolocation for specific IP
const location = await geoip.lookup("1.1.1.1");

// Get current IP geolocation
const currentLocation = await geoip.current();

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
  city?: string; // City
  latitude?: number; // Latitude
  longitude?: number; // Longitude
  isp?: string; // ISP provider
  org?: string; // Organization
  asn?: string; // ASN number
  timezone?: string; // Timezone
  source?: string; // Data source
}
```

## License

- [MIT](LICENSE) &copy; [Funish](http://www.funish.net/)

# UnDns

![npm version](https://img.shields.io/npm/v/undns)
![npm downloads](https://img.shields.io/npm/dw/undns)
![npm license](https://img.shields.io/npm/l/undns)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg)](https://www.contributor-covenant.org/version/2/1/code_of_conduct/)

> Unified DNS management library for multi-provider DNS operations

## Features

- 🌐 **Multi-Provider Support**: Unified API for Cloudflare, Vercel, DNSPod and more
- 🔄 **Driver Pattern**: Consistent API design across different DNS providers
- 📝 **TypeScript First**: Full type safety with comprehensive DNS record types
- 🔧 **Flexible Operations**: Support for read/write operations where providers allow
- 🚀 **Zero Dependencies**: Lightweight and fast implementation
- 🎯 **Entity-Based**: Domain and record-focused API for intuitive DNS management

## Installation

```bash
# Install with npm
$ npm install undns

# Install with yarn
$ yarn add undns

# Install with pnpm
$ pnpm add undns
```

## Usage

### Basic Setup

```typescript
import { createDNSManager } from "undns";
import nodeDriver from "undns/drivers/node";

// Create DNS manager with Node.js driver
const dns = createDNSManager({
  driver: nodeDriver({
    servers: ["8.8.8.8", "1.1.1.1"], // Use Google and Cloudflare DNS
  }),
});
```

### Querying DNS Records

```typescript
// Get all records for a domain
const records = await dns.getRecords("example.com");

// Get specific record type
const aRecords = await dns.getRecords("example.com", { type: "A" });
const mxRecords = await dns.getRecords("example.com", { type: "MX" });

// Get a single record
const firstARecord = await dns.getRecord("example.com", { type: "A" });

// Check if record exists
const hasMxRecord = await dns.hasRecord("example.com", { type: "MX" });
```

### Working with Subdomains

```typescript
// Query subdomain records
const wwwRecords = await dns.getRecords("example.com", {
  name: "www",
  type: "A",
});

// Or specify full subdomain
const subRecords = await dns.getRecords("api.example.com");
```

### Write Operations (when supported)

```typescript
// Set a new A record (only works with writable providers)
await dns.setRecord("example.com", {
  name: "www",
  type: "A",
  address: "192.168.1.1",
});

// Set multiple records
await dns.setRecords("example.com", [
  { name: "www", type: "A", address: "192.168.1.1" },
  { name: "mail", type: "MX", priority: 10, exchange: "mail.example.com" },
]);

// Remove records
const recordToRemove = await dns.getRecord("example.com", { type: "A" });
if (recordToRemove) {
  await dns.removeRecord("example.com", recordToRemove);
}
```

### Available Drivers

```typescript
// Node.js DNS driver (read-only)
import nodeDriver from "undns/drivers/node";

// Cloudflare DNS driver
import cloudflareDriver from "undns/drivers/cloudflare";

// Future drivers will be available:
// import vercelDriver from 'undns/drivers/vercel'
// import dnspodDriver from 'undns/drivers/dnspod'
```

## API Reference

### DNS Manager

#### `createDNSManager(options)`

Creates a new DNS manager instance with the specified driver.

**Parameters:**

- `options.driver` - DNS driver instance (Node.js, Cloudflare, etc.)

**Returns:** DNS manager instance with methods below.

#### Methods

##### `getRecords(domain, options?)`

Get all DNS records for a domain.

**Parameters:**

- `domain` (string) - Domain name to query
- `options` (object, optional) - Query options
  - `name` (string) - Subdomain name (e.g., 'www' for 'www.example.com')
  - `type` (string) - Record type filter ('A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SOA', 'SRV', 'CAA')

**Returns:** `Promise<DNSRecord[]>` - Array of DNS records

##### `getRecord(domain, options?)`

Get a single DNS record (first match).

**Parameters:** Same as `getRecords`

**Returns:** `Promise<DNSRecord | null>` - First matching record or null

##### `hasRecord(domain, options)`

Check if a DNS record exists.

**Parameters:** Same as `getRecords` (type is required)

**Returns:** `Promise<boolean>` - True if record exists

##### `setRecord(domain, record)`

Create or update a DNS record (provider-dependent).

**Parameters:**

- `domain` (string) - Domain name
- `record` (DNSRecordInput) - Record to create/update
  - `name` (string) - Record name
  - `type` (string) - Record type
  - Additional fields depend on record type

**Returns:** `Promise<DNSRecord>` - Created/updated record

##### `setRecords(domain, records)`

Create or update multiple DNS records.

**Parameters:**

- `domain` (string) - Domain name
- `records` (DNSRecordInput[]) - Records to create/update

**Returns:** `Promise<DNSRecord[]>` - Created/updated records

##### `removeRecord(domain, record)`

Remove a DNS record (provider-dependent).

**Parameters:**

- `domain` (string) - Domain name
- `record` (DNSRecord) - Record to remove

**Returns:** `Promise<void>`

##### `removeRecords(domain, records)`

Remove multiple DNS records.

**Parameters:**

- `domain` (string) - Domain name
- `records` (DNSRecord[]) - Records to remove

**Returns:** `Promise<void>`

### DNS Record Types

The library uses Node.js standard DNS record types:

- **A**: `{ type: 'A', address: string, ttl: number }`
- **AAAA**: `{ type: 'AAAA', address: string, ttl: number }`
- **CNAME**: `{ type: 'CNAME', value: string }`
- **MX**: `{ type: 'MX', priority: number, exchange: string }`
- **TXT**: `{ type: 'TXT', entries: string[] }`
- **NS**: `{ type: 'NS', value: string }`
- **SOA**: `{ type: 'SOA', nsname: string, hostmaster: string, serial: number, refresh: number, retry: number, expire: number, minttl: number }`
- **SRV**: `{ type: 'SRV', priority: number, weight: number, port: number, name: string }`
- **CAA**: `{ type: 'CAA', critical: number, issue?: string, iodef?: string }`

## License

- [MIT](LICENSE) &copy; [Demo Macro](https://imst.xyz/)

# rdap 🌐

A modern RDAP (Registration Data Access Protocol) client and server implementation following ICANN standards.

## ✨ Features

- 🎯 Lookup support for RDAP object query types:
  - 🌐 Domain names (including IDN support)
  - 🔍 IP addresses (IPv4 and IPv6)
  - 🔢 Autonomous System Numbers (ASN)
  - 🌍 Nameservers
  - 👤 Entity handles and object tags
- 📦 Built-in IANA bootstrap files with optional cached metadata refresh
- ⏱️ Configurable TTL and bundled-data fallback for bootstrap updates
- 🔄 Proper Accept header usage for RDAP responses
- 🛡️ Typed `RdapError` with stable codes, HTTP status, retryability, and query metadata
- 📝 Full TypeScript support with strict type definitions
- 🚀 Minimal dependencies and small footprint
- 🔒 Secure access support (HTTPS and authentication)
- 🚀 Built-in RDAP server with h3 integration
- 🧭 Server support for local data providers, explicit upstream proxies, and bootstrap mode

## 📥 Installation

```bash
# Using npm
npm install rdap

# Using yarn
yarn add rdap

# Using pnpm
pnpm add rdap
```

## 🚀 Basic Usage

```typescript
import {
  queryRDAP,
  queryDomain,
  queryIP,
  queryASN,
  queryNameserver,
  queryEntity,
  queryHelp,
  createRdapServer,
} from "rdap";

// Query domain information
const domainInfo = await queryDomain("example.com");
// Returns: RdapDomain with nameservers, status, events, etc.

// Query IP information (IPv4)
const ipv4Info = await queryIP("8.8.8.8");
// Returns: RdapIpNetwork with network information, entities, etc.

// Query IP information (IPv6)
const ipv6Info = await queryIP("2001:db8::1");
// Returns: RdapIpNetwork with network information, entities, etc.

// Query ASN information
const asnInfo = await queryASN("15169");
// Returns: RdapAutnum with ASN details, network range, etc.

// Query nameserver information
const nsInfo = await queryNameserver("ns1.example.com");
// Returns: RdapNameserver with nameserver details, status, etc.

// Query entity information
const entityInfo = await queryEntity("GOGL");
// Returns: RdapEntity with entity details, roles, etc.

// Query help information from an explicitly selected server
const helpInfo = await queryHelp({
  baseUrl: "https://rdap.example.com",
});
// Returns: RdapHelp with the server's advertised capabilities

// Generic query with options
const data = await queryRDAP("example.com", {
  baseUrl: "https://custom-rdap-server.com",
  type: "domain", // Explicitly specify query type
  fetchOptions: {
    headers: {
      Authorization: "Bearer your-token",
    },
  },
});

// All convenience functions also support options
const domainWithCustomServer = await queryDomain("example.com", {
  baseUrl: "https://custom-rdap-server.com",
  fetchOptions: {},
});

const nameserverWithType = await queryNameserver("ns1.example.com", {
  type: "nameserver", // Explicitly specify nameserver query
});

// Create and start RDAP server
const server = createRdapServer();
server.serve(8080);
console.log("RDAP Server running on http://localhost:8080");
```

## 🔧 Advanced Usage

### 🚀 RDAP Server

#### Basic Server

```typescript
import { createRdapServer, createRdapHandler } from "rdap/server";

// Create and start RDAP server
const server = createRdapServer();
server.serve(8080);
// RDAP Server running on http://localhost:8080

// Available endpoints:
// GET /help - Server help
// GET /domain/example.com - Domain info
// GET /ip/8.8.8.8 - IP info
// GET /autnum/15169 - ASN info
// GET /nameserver/ns1.example.com - Nameserver info
// GET /entity/ABC123-EXAMPLE - Entity info
```

#### Server with Custom Base URL

```typescript
// Without baseUrl or dataProvider, requests are resolved with the bootstrap service.
// With baseUrl, the server proxies requests to the selected upstream service.
const server = createRdapServer({
  baseUrl: "https://rdap.arin.net/registry",
});
server.serve(8080);
```

#### Server with Custom Data Provider

```typescript
const server = createRdapServer({
  dataProvider: async (query, type) => {
    console.log(`${type}: ${query}`);

    // Return custom data
    return {
      objectClassName: type,
      handle: `MOCK_${query}`,
    };
  },
});
server.serve(8080);
```

#### Using Handler Directly

```typescript
import { createApp } from "h3";

const handler = createRdapHandler({
  baseUrl: "https://rdap.example.com",
});

const app = createApp();
app.use(handler);

// Start with your own server setup
```

### 🛠️ Using Custom RDAP Servers (Client)

```typescript
import { queryRDAP } from "rdap";

// Use a custom RDAP server
const domainInfo = await queryRDAP("example.com", {
  baseUrl: "https://rdap.nic.example",
});

// Use custom headers and authentication
const domainInfo = await queryRDAP("example.com", {
  fetchOptions: {
    headers: {
      Authorization: "Bearer your-token",
    },
  },
});
```

### 🔍 Type Detection and Validation

```typescript
import { getQueryType, getBootstrapType, isDomain, isAsn } from "rdap";

// Detect query type automatically
const queryType = getQueryType("example.com"); // "domain"
const queryType = getQueryType("8.8.8.8"); // "ip"
const queryType = getQueryType("15169"); // "autnum"

// Get bootstrap type for server discovery
const bootstrapType = getBootstrapType("example.com"); // "dns"
const bootstrapType = getBootstrapType("8.8.8.8"); // "ipv4"
const bootstrapType = getBootstrapType("15169"); // "asn"

// Validate input types
console.log(isDomain("example.com")); // true
console.log(isAsn("AS15169")); // true
console.log(isAsn("15169")); // true
```

### 🔄 Working with Bootstrap Data

```typescript
import { findBootstrapServer, getBootstrapMetadata } from "rdap";

// Find appropriate RDAP server for a query
const serverUrl = await findBootstrapServer("dns", "example.com");
console.log(serverUrl); // "https://rdap.verisign.com"

const serverUrl = await findBootstrapServer("ipv4", "8.8.8.8");
console.log(serverUrl); // "https://rdap.arin.net"

// Get bundled metadata for offline usage
const metadata = await getBootstrapMetadata("ipv4");
console.log(metadata.services); // IPv4 ranges and RDAP servers

// Refresh once, cache it for an hour, then reuse the cached copy.
// If refreshing fails while the cache is stale, bundled data is used.
const freshMetadata = await getBootstrapMetadata("dns", true, 3_600_000);
```

### ⚠️ Error Handling

```typescript
import { queryRDAP, RdapError } from "rdap";

try {
  const data = await queryRDAP("nonexistent-domain.example");
} catch (error) {
  if (error instanceof RdapError) {
    console.error(`[${error.code}] ${error.message}`);

    if (error.status === 404) {
      // The RDAP object was not found.
    }
    if (error.retryable) {
      // Useful for 429 and upstream 5xx/network failures.
    }
  } else {
    throw error;
  }
}
```

## 📚 API Reference

### 🔍 Query Functions

#### `queryRDAP<T = RdapResponse>(query: string, options?: RdapOptions): Promise<T>`

Generic RDAP query function with full configuration options.

**Parameters:**

- `query` - The query string (domain, IP, ASN, entity handle, etc.)
- `options` - Optional configuration object
  - `baseUrl?` - Custom RDAP server URL
  - `type?` - Explicit query type (overrides auto-detection)
  - `fetchOptions?` - Fetch API options (headers, auth, etc.)

**Returns:**

- Promise resolving to the RDAP response

#### `queryDomain<T = RdapDomain>(domain: string, options?: RdapOptions): Promise<T>`

Query domain information with optional configuration.

#### `queryIP<T = RdapIpNetwork>(ip: string, options?: RdapOptions): Promise<T>`

Query IP network information with optional configuration.

#### `queryASN<T = RdapAutnum>(asn: string, options?: RdapOptions): Promise<T>`

Query autonomous system information with optional configuration.

#### `queryNameserver<T = RdapNameserver>(nameserver: string, options?: RdapOptions): Promise<T>`

Query nameserver information with optional configuration.

#### `queryEntity<T = RdapEntity>(handle: string, options?: RdapOptions): Promise<T>`

Query entity information with optional configuration.

#### `queryHelp<T = RdapHelp>(options?: RdapOptions): Promise<T>`

Query RDAP help information from an explicitly configured `baseUrl`. The bootstrap service cannot choose an RDAP help endpoint.

### 🚀 Server Functions

#### `createRdapServer(options?: RdapServerOptions): { handler: EventHandlerWithFetch, serve: (port?: number) => void }`

Create a complete RDAP server with convenience wrapper.

**Parameters:**

- `options` - Optional server configuration object
  - `baseUrl?` - Custom RDAP server URL to proxy requests to
  - `dataProvider?` - Custom data handler for local responses
  - `authorize?` - Authorization function for requests
  - `fetchOptions?` - Custom fetch options for proxied requests
  - `bootstrap?` - Refresh and TTL options used when neither `baseUrl` nor `dataProvider` is set
  - `resolvePath?` - Custom path resolver function

**Returns:**

- Object with `handler` and `serve(port)` method

#### `createRdapHandler(options?: RdapServerOptions): EventHandlerWithFetch`

Create an RDAP handler that can be used with h3 or other web frameworks.

**Parameters:** Same as `createRdapServer`

**Returns:**

- Event handler that can be used with h3 apps

### 🔧 Utility Functions

#### `getQueryType(query: string): RdapQueryType`

Automatically detect the type of query based on input format.

**Returns:** `"domain" | "nameserver" | "entity" | "ip" | "autnum" | "help"`

#### `getBootstrapType(query: string): RdapBootstrapType`

Get the bootstrap type for server discovery.

**Returns:** `"asn" | "dns" | "ipv4" | "ipv6" | "object-tags"`

#### `isDomain(value: string): boolean`

Check if a string is a valid domain name.

#### `isAsn(value: string): boolean`

Check if a string is a valid ASN (supports both "AS15169" and "15169" formats).

#### `formatAsn(value: string): string`

Format ASN value to remove "AS" prefix if present.

#### `convertToAscii(domain: string): string`

Convert internationalized domain name (IDN) to ASCII format.

#### `bootstrapTypeToQueryType(type: RdapBootstrapType, queryType?: RdapQueryType): RdapQueryType`

Convert bootstrap type to query type. Optionally accepts explicit query type to override default mapping.

#### `findBootstrapServer(type: RdapBootstrapType, query: string, bootstrap?: RdapBootstrapOptions): Promise<string>`

Find appropriate RDAP server for a given query type and query string.

**Returns:** Promise resolving to the RDAP server URL

#### `getBootstrapMetadata(type: RdapBootstrapType, fetch?: boolean, ttlMs?: number): Promise<RdapBootstrapMetadata>`

Get bootstrap metadata for RDAP server discovery. Bundled data is used by default. Successful refreshes are cached in memory and reused until the TTL expires; bundled data is retained as the fallback.

**Parameters:**

- `type` - Bootstrap type ("asn" | "dns" | "ipv4" | "ipv6" | "object-tags")
- `fetch` - Force refresh bootstrap data from IANA (default: false)
- `ttlMs` - Cache lifetime in milliseconds (default: 3600000)

**Returns:** Promise resolving to bootstrap metadata with server listings

#### `getServerUrl(query: string, type?: RdapQueryType, options?: RdapOptions): Promise<string>`

Build complete RDAP query URL with automatic server discovery.

**Returns:** Promise resolving to the full RDAP query URL

### 📋 Types

#### `RdapOptions`

Configuration options for RDAP queries:

```typescript
interface RdapOptions {
  baseUrl?: string; // Custom RDAP server URL
  type?: RdapQueryType; // Explicit query type (overrides auto-detection)
  fetchOptions?: RequestInit; // Fetch API options (headers, auth, etc.)
  bootstrap?: RdapBootstrapOptions; // Optional metadata refresh and TTL
}
```

#### Response Types

- `RdapDomain` - Domain information response
- `RdapIpNetwork` - IP network information response
- `RdapAutnum` - Autonomous system information response
- `RdapNameserver` - Nameserver information response
- `RdapEntity` - Entity information response
- `RdapHelp` - Help and server capabilities response
- `RdapErrorResponse` - RDAP error response shape
- `RdapError` - Typed client error

## 📖 Standards Compliance

This implementation strictly follows these RDAP-related standards:

- 📘 [RFC 7480](https://tools.ietf.org/html/rfc7480) - HTTP Usage in RDAP
- 🔒 [RFC 7481](https://tools.ietf.org/html/rfc7481) - Security Services for RDAP
- 🔍 [RFC 7482](https://tools.ietf.org/html/rfc7482) - RDAP Query Format
- 📋 [RFC 7483](https://tools.ietf.org/html/rfc7483) - RDAP JSON Responses
- 🔄 [RFC 8056](https://tools.ietf.org/html/rfc8056) - EPP and RDAP Status Mapping
- ✅ [ICANN RDAP Response Profile](https://www.icann.org/rdap)

### ✅ Specification Compliance Features

- **HTTP Method**: Uses GET for all RDAP queries as required by RFC 7482
- **Content Negotiation**: Sends `Accept: application/rdap+json` header
- **Input Validation**: Validates and URL-encodes query values before requests
- **URL Structure**: Follows `{baseUrl}/{queryType}/{query}` pattern
- **Error Handling**: Implements comprehensive HTTP status code handling
- **Help Support**: Provides `queryHelp()` for capability discovery from an explicit server
- **Bootstrap Service**: Uses bundled IANA data by default, with optional cached refresh

## 📄 License

[MIT](../../LICENSE) © [Funish](http://www.funish.net/)

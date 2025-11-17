# rdap 🌐

A modern RDAP (Registration Data Access Protocol) client implementation following ICANN standards.

## ✨ Features

- 🎯 Full support for all RDAP query types:
  - 🌐 Domain names (including IDN support)
  - 🔍 IP addresses (IPv4 and IPv6)
  - 🔢 Autonomous System Numbers (ASN)
  - 🌍 Nameservers
  - 👤 Entity handles and object tags
- 📦 Built-in IANA bootstrap files with option to fetch latest data
- ⚡️ Real-time bootstrap data retrieval
- 🔄 Proper Accept header usage for RDAP responses
- 🛡️ Comprehensive error handling with detailed error types
- 📝 Full TypeScript support with strict type definitions
- 🚀 Minimal dependencies and small footprint
- 🔒 Secure access support (HTTPS and authentication)
- 📄 Pagination support for large responses
- 🧩 Functional programming approach - pure functions only

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
const entityInfo = await queryEntity("ABC123-EXAMPLE");
// Returns: RdapEntity with entity details, roles, etc.

// Query help information
const helpInfo = await queryHelp();
// Returns: RDAP server help and capability information

// Generic query with options
const data = await queryRDAP("example.com", {
  baseUrl: "https://custom-rdap-server.com",
  fetchOptions: {
    headers: {
      Authorization: "Bearer your-token",
    },
  },
});
```

## 🔧 Advanced Usage

### 🛠️ Using Custom RDAP Servers

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
      "User-Agent": "MyApp/1.0",
      "Accept-Language": "en-US",
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
import { findBootstrapServer } from "rdap";

// Find appropriate RDAP server for a query
const serverUrl = await findBootstrapServer("dns", "example.com");
console.log(serverUrl); // "https://rdap.verisign.com"

const serverUrl = await findBootstrapServer("ipv4", "8.8.8.8");
console.log(serverUrl); // "https://rdap.arin.net"
```

### ⚠️ Error Handling

```typescript
import { queryRDAP } from "rdap";

try {
  const data = await queryRDAP("nonexistent-domain.example");
} catch (error) {
  console.error(`RDAP query failed: ${error.message}`);

  // Common error types:
  if (error.message.includes("not found")) {
    // Handle 404 errors
  }
  if (error.message.includes("rate limit")) {
    // Handle 429 errors
  }
  if (error.message.includes("authentication failed")) {
    // Handle 401/403 errors
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

**Returns:**

- Promise resolving to the RDAP response

#### `queryDomain<T = RdapDomain>(domain: string): Promise<T>`

Query domain information.

#### `queryIP<T = RdapIpNetwork>(ip: string): Promise<T>`

Query IP network information.

#### `queryASN<T = RdapAutnum>(asn: string): Promise<T>`

Query autonomous system information.

#### `queryNameserver<T = RdapNameserver>(nameserver: string): Promise<T>`

Query nameserver information.

#### `queryEntity<T = RdapEntity>(handle: string): Promise<T>`

Query entity information.

#### `queryHelp(): Promise<any>`

Query RDAP help information from the server.

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

#### `bootstrapTypeToQueryType(type: RdapBootstrapType): RdapQueryType`

Convert bootstrap type to query type.

### 📋 Types

#### `RdapOptions`

Configuration options for RDAP queries:

```typescript
interface RdapOptions {
  baseUrl?: string; // Custom RDAP server URL
  fetchOptions?: RequestInit; // Fetch API options (headers, auth, etc.)
}
```

#### Response Types

- `RdapDomain` - Domain information response
- `RdapIpNetwork` - IP network information response
- `RdapAutnum` - Autonomous system information response
- `RdapNameserver` - Nameserver information response
- `RdapEntity` - Entity information response
- `RdapErrorResponse` - Error response

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
- **User-Agent**: Includes proper client identification
- **URL Structure**: Follows `{baseUrl}/{queryType}/{query}` pattern
- **Error Handling**: Implements comprehensive HTTP status code handling
- **Help Support**: Provides `queryHelp()` for server capability discovery
- **Bootstrap Service**: Uses IANA official bootstrap data for server discovery
- **Language Support**: Includes `Accept-Language` header for internationalization

## 📄 License

[MIT](../../LICENSE) © [Demo Macro](https://imst.xyz/)

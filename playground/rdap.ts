/**
 * RDAP Library Examples
 * Demonstrating various RDAP query functions
 */

import {
  // Main query functions
  queryRDAP,
  queryDomain,
  queryIP,
  queryASN,
  queryNameserver,
  queryEntity,
  queryHelp,

  // Utility functions
  getQueryType,
  getBootstrapType,
  isDomain,
  isAsn,
  formatAsn,
  convertToAscii,
  bootstrapTypeToQueryType,

  // Bootstrap functions (now exported)
  getBootstrapMetadata,
  findBootstrapServer,
} from "rdap";

console.log("🌐 RDAP Library Examples\n");

// Type detection examples
console.log("=== Type Detection ===");
const testQueries = [
  "example.com",
  "8.8.8.8",
  "2001:4860:4860::8888",
  "AS15169",
  "ns1.dns-oarc.net",
  "ABC123-EXAMPLE",
  "help",
];

testQueries.forEach((query) => {
  const queryType = getQueryType(query);
  const bootstrapType = getBootstrapType(query);
  console.log(`'${query}' -> Query: ${queryType}, Bootstrap: ${bootstrapType}`);
});

// Validation examples
console.log("\n=== Validation ===");
console.log("isDomain('example.com'):", isDomain("example.com"));
console.log("isDomain('invalid'):", isDomain("invalid"));
console.log("isAsn('AS15169'):", isAsn("AS15169"));
console.log("isAsn('15169'):", isAsn("15169"));

console.log("\nformatAsn('AS15169'):", formatAsn("AS15169"));
console.log("formatAsn('15169'):", formatAsn("15169"));

console.log("\nconvertToAscii('测试.com'):", convertToAscii("测试.com"));

// Bootstrap type conversion example
console.log("\n=== Bootstrap Type Conversion ===");
console.log("bootstrapTypeToQueryType('dns'):", bootstrapTypeToQueryType("dns"));
console.log("bootstrapTypeToQueryType('ipv4'):", bootstrapTypeToQueryType("ipv4"));
console.log("bootstrapTypeToQueryType('asn'):", bootstrapTypeToQueryType("asn"));

// Query function examples
console.log("\n=== Query Function Examples ===");
console.log("queryRDAP:", await queryRDAP("example.com"));
console.log("queryDomain:", await queryDomain("example.com"));
console.log("queryIP:", await queryIP("8.8.8.8"));
console.log("queryASN:", await queryASN("15169"));
console.log("queryNameserver:", await queryNameserver("ns1.dns-oarc.net"));
console.log("queryEntity:", await queryEntity("GOGL"));
console.log("queryHelp:", await queryHelp());

// Bootstrap server examples
console.log("\n=== Bootstrap Server Discovery ===");
try {
  const googleServer = await findBootstrapServer("dns", "google.com");
  console.log(`Bootstrap server for google.com: ${googleServer}`);

  const ipServer = await findBootstrapServer("ipv4", "8.8.8.8");
  console.log(`Bootstrap server for 8.8.8.8: ${ipServer}`);
} catch (error) {
  console.log("Bootstrap server discovery error:", (error as Error).message);
}

// Bootstrap metadata example
console.log("\n=== Bootstrap Metadata ===");
try {
  const dnsMetadata = await getBootstrapMetadata("dns", false);
  console.log(`DNS bootstrap description: ${dnsMetadata.description}`);
  console.log(`DNS bootstrap version: ${dnsMetadata.version}`);
  console.log(`DNS bootstrap services count: ${dnsMetadata.services.length}`);
} catch (error) {
  console.log("Bootstrap metadata error:", (error as Error).message);
}

console.log("\n✅ RDAP examples completed!");

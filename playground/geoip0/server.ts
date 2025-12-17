/**
 * GeoIP0 Server Examples
 * Demonstrating HTTP server functionality for GeoIP services
 */

import { createGeoIPServer } from "../../packages/geoip0/src/server";
// import ipsbDriver from "../../packages/geoip0/src/drivers/ipsb";
import cloudflareDriver from "../../packages/geoip0/src/drivers/cloudflare";

console.log("GeoIP0 Server Examples\n");

// Initialize drivers
// const ipsb = ipsbDriver();
const cloudflare = cloudflareDriver();

// Create server with default driver (IPSB)
const server = createGeoIPServer({ driver: cloudflare });

console.log("=== Server Creation ===");
console.log("Server created with IPSB driver as default");
console.log("Server available at http://localhost:3000");

console.log("\n=== Available Endpoints ===");
console.log("GET /help - Show available drivers and endpoints");
console.log("GET /current - Get current IP geolocation");
console.log("GET /{ip} - Get geolocation for specific IP");
console.log("GET /1.1.1.1 - Example: Cloudflare DNS IPv4");
console.log("GET /2606:4700:4700::1111 - Example: Cloudflare DNS IPv6");

console.log("\n=== Query Parameters ===");
console.log("?version=auto - Auto-detect IP version (default)");
console.log("?version=ipv4 - Force IPv4 detection");
console.log("?version=ipv6 - Force IPv6 detection");

console.log("\n=== Example Requests ===");

// Example request demonstrations
const exampleRequests = [
  {
    description: "Get current IP (auto)",
    url: "/current",
  },
  {
    description: "Get current IP (IPv4 only)",
    url: "/current?version=ipv4",
  },
  {
    description: "Get current IP (IPv6 only)",
    url: "/current?version=ipv6",
  },
  {
    description: "Lookup Cloudflare DNS IPv4",
    url: "/1.1.1.1",
  },
  {
    description: "Lookup Cloudflare DNS IPv6",
    url: "/2606:4700:4700::1111",
  },
  {
    description: "Help endpoint",
    url: "/help",
  },
];

exampleRequests.forEach((req) => {
  console.log(`\n${req.description}:`);
  console.log(`  GET http://localhost:3000${req.url}`);
});

console.log("\n=== Usage Instructions ===");
console.log("1. Start the server: bun run server.ts");
console.log("2. Open browser: http://localhost:3000/help");
console.log("3. Test with curl examples:");
console.log("   curl http://localhost:3000/current");
console.log("   curl http://localhost:3000/1.1.1.1");
console.log("   curl http://localhost:3000/8.8.8.8?version=ipv4");

// Demonstrate creating server with Cloudflare driver
console.log("\n=== Multiple Server Examples ===");
console.log("// Create server with Cloudflare driver:");
console.log(
  "const cfServer = createGeoIPServer({ driver: cloudflareDriver() });",
);
console.log("cfServer.serve(3001); // Start on port 3001");

console.log("\nGeoIP0 server examples completed!");
console.log("Starting server...");

// Start the server
server.serve(3000);

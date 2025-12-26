# UnPing

![npm version](https://img.shields.io/npm/v/unping)
![npm downloads](https://img.shields.io/npm/dw/unping)
![npm license](https://img.shields.io/npm/l/unping)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg)](https://www.contributor-covenant.org/version/2/1/code_of_conduct/)

> Unified network connectivity detection library with multi-driver support

## Features

- 🌐 **Multi-Driver Support**: HTTP, TCP, DNS, and Hybrid drivers for different scenarios
- 🔄 **Driver Pattern**: Consistent API design across different detection methods
- 📝 **TypeScript First**: Full type safety with comprehensive ping result types
- 🚀 **High Performance**: Built on modern networking APIs with minimal dependencies
- ⚡ **Smart Fallback**: Hybrid driver automatically tries multiple detection methods
- 🔧 **Flexible Configuration**: Support for batch pings, timeouts, intervals, and custom ports
- 📊 **Rich Results**: Detailed response data including timing and sequence numbers
- 🛡️ **Error Resilient**: Graceful handling of network failures and timeouts

## Installation

```bash
# Install with npm
$ npm install unping

# Install with yarn
$ yarn add unping

# Install with pnpm
$ pnpm add unping
```

## Usage

### Basic Setup

```typescript
import { createPingManager } from "unping";
import tcpDriver from "unping/drivers/tcp";

// Create ping manager with TCP driver
const ping = createPingManager({
  driver: tcpDriver({ port: 80 }),
});

// Ping a host
const results = await ping.ping("google.com");
console.log(results[0]);
// { host: "google.com", alive: true, time: 5, sequence: 1 }
```

### Web Driver

Application layer health checks using HTTP/HTTPS HEAD/GET requests.

```typescript
import webDriver from "unping/drivers/web";

const web = createPingManager({
  driver: webDriver({ method: "HEAD" }),
});

const results = await web.ping("example.com");
console.log(`HTTP Status: ${results[0].alive ? "Available" : "Unavailable"}`);
console.log(`Response Time: ${results[0].time}ms`);
```

### TCP Driver

Port reachability detection using TCP connections.

```typescript
import tcpDriver from "unping/drivers/tcp";

// Check default HTTP port
const tcp80 = createPingManager({
  driver: tcpDriver({ port: 80 }),
});

// Check HTTPS port
const tcp443 = createPingManager({
  driver: tcpDriver({ port: 443 }),
});

const results = await tcp80.ping("example.com");
console.log(`Port 80: ${results[0].alive ? "Open" : "Closed"}`);
```

### DNS Driver

DNS resolution capability detection.

```typescript
import dnsDriver from "unping/drivers/dns";

const dns = createPingManager({
  driver: dnsDriver({
    type: "A", // Query A records
    servers: ["8.8.8.8", "1.1.1.1"], // Custom DNS servers
  }),
});

const results = await dns.ping("example.com");
console.log(`DNS Resolution: ${results[0].alive ? "Success" : "Failed"}`);
```

### Hybrid Driver

Smart detection with automatic fallback between multiple drivers.

```typescript
import hybridDriver from "unping/drivers/hybrid";
import tcpDriver from "unping/drivers/tcp";
import webDriver from "unping/drivers/web";
import dnsDriver from "unping/drivers/dns";

// Use default driver configuration (TCP → Web → DNS)
const hybrid = createPingManager({
  driver: hybridDriver(),
});

// Or specify custom drivers with specific configurations
const customHybrid = createPingManager({
  driver: hybridDriver({
    drivers: [
      tcpDriver({ port: 443 }), // Try HTTPS first
      webDriver({ method: "GET" }), // Then HTTP GET
      dnsDriver({ type: "AAAA" }), // Then IPv6 DNS
    ],
  }),
});

const results = await hybrid.ping("example.com");
console.log(`Alive: ${results[0].alive}`);
console.log(`Time: ${results[0].time}ms`);
```

### Batch Pings

Send multiple pings with intervals for detailed analysis.

```typescript
const results = await ping.ping("example.com", {
  count: 5, // Send 5 pings
  timeout: 3000, // 3 second timeout per ping
  interval: 500, // Wait 500ms between pings
});

results.forEach((result) => {
  console.log(
    `[${result.sequence}] ${result.host}: ${result.alive ? "✓" : "✗"} ${result.time}ms`,
  );
});

// Calculate statistics
const successRate = results.filter((r) => r.alive).length / results.length;
const avgTime = results.reduce((sum, r) => sum + r.time, 0) / results.length;

console.log(`Success Rate: ${(successRate * 100).toFixed(1)}%`);
console.log(`Average Time: ${avgTime.toFixed(0)}ms`);
```

### Available Drivers

```typescript
// Web driver (application layer - HTTP/HTTPS)
import webDriver from "unping/drivers/web";

// TCP driver (port reachability)
import tcpDriver from "unping/drivers/tcp";

// DNS driver (DNS resolution)
import dnsDriver from "unping/drivers/dns";

// Hybrid driver (smart fallback)
import hybridDriver from "unping/drivers/hybrid";
```

### Advanced Configuration

#### Web Driver Options

```typescript
import webDriver from "unping/drivers/web";

const web = createPingManager({
  driver: webDriver({
    method: "GET", // GET or HEAD (default: HEAD)
    port: 8080, // Custom port
    https: true, // Force HTTPS
    path: "/health", // Custom path
    headers: {
      // Custom headers
      "User-Agent": "My-Pinger/1.0",
    },
  }),
});
```

#### TCP Driver Options

```typescript
import tcpDriver from "unping/drivers/tcp";

const tcp = createPingManager({
  driver: tcpDriver({
    port: 22, // Custom port
    connectTimeout: 2000, // Connection timeout in ms
  }),
});
```

#### DNS Driver Options

```typescript
import dnsDriver from "unping/drivers/dns";

const dns = createPingManager({
  driver: dnsDriver({
    type: "AAAA", // Query AAAA records (IPv6)
    servers: ["8.8.8.8"], // Custom DNS servers
  }),
});
```

#### Hybrid Driver Options

```typescript
import hybridDriver from "unping/drivers/hybrid";
import tcpDriver from "unping/drivers/tcp";
import webDriver from "unping/drivers/web";

const hybrid = createPingManager({
  driver: hybridDriver({
    drivers: [
      tcpDriver({ port: 8080 }), // Custom TCP driver
      webDriver({ method: "GET" }), // Custom Web driver
      // Add more drivers as needed
    ],
  }),
});
```

### Error Handling

```typescript
try {
  const results = await ping.ping("example.com", { timeout: 5000 });

  if (results.length > 0) {
    const result = results[0];

    if (result.alive) {
      console.log(`Host is reachable: ${result.time}ms`);
    } else {
      console.log(`Host is unreachable (timed out)`);
    }
  }
} catch (error) {
  console.error("Ping failed:", error.message);
}
```

## API Reference

### Ping Manager

#### `createPingManager(options)`

Creates a new ping manager instance with the specified driver.

**Parameters:**

- `options.driver` - Ping driver instance (HTTP, TCP, DNS, or Hybrid)

**Returns:** Ping manager instance with `ping()` method

#### Methods

##### `ping(host, options?)`

Ping a host and return results.

**Parameters:**

- `host` (string) - Hostname or IP address to ping
- `options` (object, optional) - Ping options
  - `count` (number) - Number of pings to send (default: 1)
  - `timeout` (number) - Timeout in milliseconds per ping (default: 5000)
  - `interval` (number) - Wait time in milliseconds between pings (default: 0)
  - `size` (number) - Packet size in bytes (driver-dependent)

**Returns:** `Promise<PingResult[]>` - Array of ping results

### Ping Result

```typescript
interface PingResult {
  host: string; // Target host
  alive: boolean; // Is reachable
  time: number; // Response time in milliseconds
  sequence?: number; // Sequence number for batch pings
  ttl?: number; // Time to live (when available)
}
```

### Driver Options

#### WebDriverOptions

```typescript
interface WebDriverOptions {
  method?: "HEAD" | "GET"; // Request method (default: "HEAD")
  port?: number; // Custom port (default: 80/443)
  https?: boolean; // Force HTTPS (default: auto-detect)
  path?: string; // Request path (default: "/")
  headers?: Record<string, string>; // Custom headers
}
```

#### TCPDriverOptions

```typescript
interface TCPDriverOptions {
  port?: number; // Target port (default: 80)
  connectTimeout?: number; // Connection timeout in ms (default: 5000)
}
```

#### DNSDriverOptions

```typescript
interface DNSDriverOptions {
  type?: "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "NS"; // Record type (default: "A")
  servers?: string[]; // DNS servers (default: system DNS)
}
```

#### HybridDriverOptions

```typescript
interface HybridDriverOptions {
  drivers?: Driver[]; // Array of drivers to try in order (default: [tcp, http, dns])
}
```

## Hybrid Driver Behavior

The Hybrid Driver provides intelligent network connectivity detection by trying multiple methods in order:

1. **TCP (First Priority)**: Fastest method, checks port reachability
2. **Web (Second Priority)**: Confirms application layer availability (HTTP/HTTPS)
3. **DNS (Last Priority)**: Basic DNS resolution capability as fallback

**Why this order?**

- **TCP First**: Closest to traditional ICMP ping, detects IP layer connectivity quickly (~1-5ms)
- **Web Second**: Validates that the service is actually responding at application level (~100-300ms)
- **DNS Last**: Only checks if domain can be resolved, doesn't guarantee host reachability (~10-20ms)

**Custom Driver Configuration Example:**

```typescript
// For web service monitoring - prioritize HTTP
import webDriver from "unping/drivers/web";
import tcpDriver from "unping/drivers/tcp";
import dnsDriver from "unping/drivers/dns";

const webMonitor = createPingManager({
  driver: hybridDriver({
    drivers: [
      webDriver({ method: "HEAD", path: "/health" }),
      tcpDriver({ port: 80 }),
      dnsDriver(),
    ],
  }),
});

// For quick connectivity checks - prioritize TCP
const quickCheck = createPingManager({
  driver: hybridDriver({
    drivers: [
      tcpDriver({ port: 443 }),
      dnsDriver(),
      webDriver({ method: "GET" }),
    ],
  }),
});
```

## Use Cases

### Web Service Monitoring

```typescript
const monitor = createPingManager({
  driver: webDriver({ method: "HEAD", path: "/health" }),
});

setInterval(async () => {
  const results = await monitor.ping("api.example.com");
  if (!results[0].alive) {
    console.error("Service is down!");
    // Trigger alert
  }
}, 60000); // Check every minute
```

### Port Availability Check

```typescript
const ports = [22, 80, 443, 8080];

for (const port of ports) {
  const checker = createPingManager({
    driver: tcpDriver({ port }),
  });

  const results = await checker.ping("example.com");
  console.log(`Port ${port}: ${results[0].alive ? "Open" : "Closed"}`);
}
```

### Network Diagnostics

```typescript
import hybridDriver from "unping/drivers/hybrid";
import tcpDriver from "unping/drivers/tcp";
import webDriver from "unping/drivers/web";
import dnsDriver from "unping/drivers/dns";

const diagnostic = createPingManager({
  driver: hybridDriver({
    drivers: [
      tcpDriver({ port: 80 }),
      webDriver({ method: "HEAD" }),
      dnsDriver(),
    ],
  }),
});

const hosts = ["google.com", "github.com", "cloudflare.com"];

for (const host of hosts) {
  const results = await diagnostic.ping(host);
  console.log(`${host}: ${results[0].alive ? "✓" : "✗"} ${results[0].time}ms`);
}
```

## License

- [MIT](LICENSE) &copy; [Funish](http://www.funish.net/)

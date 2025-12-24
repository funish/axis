# Axis

![GitHub](https://img.shields.io/github/license/funish/axis)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg)](https://www.contributor-covenant.org/version/2/1/code_of_conduct/)

> Unified network toolkit for IP address manipulation, RDAP operations, DNS management, geolocation queries, and network connectivity detection

## Packages

This is a monorepo that contains the following packages:

- **[ipdo](./packages/ipdo/README.md)** - Powerful IP address manipulation library
- **[rdap](./packages/rdap/README.md)** - Modern RDAP (Registration Data Access Protocol) client
- **[undns](./packages/undns/README.md)** - Core DNS management library with unified API
- **[geoip0](./packages/geoip0/README.md)** - Unified geolocation information query library with multi-provider support
- **[unping](./packages/unping/README.md)** - Unified network connectivity detection library with multi-driver support

## Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/funish/axis.git
cd axis

# Install dependencies
pnpm install
```

### Basic Usage

```typescript
// IP address manipulation with ipdo
import { isValidIP, parseCIDR, ipInRange } from "ipdo";

console.log(isValidIP("192.168.1.1")); // true
const range = parseCIDR("192.168.0.0/24");
console.log(ipInRange("192.168.0.0/24", "192.168.0.1")); // true

// DNS management with undns
import { createDNSManager } from "undns";
import nodeDriver from "undns/drivers/node";

const dns = createDNSManager({
  driver: nodeDriver({
    servers: ["8.8.8.8", "1.1.1.1"],
  }),
});

const records = await dns.getRecords("example.com");
console.log(`Found ${records.length} records`);

// RDAP queries with rdap
import { queryDomain, queryIP, queryASN } from "rdap";

const domainInfo = await queryDomain("example.com");
const ipInfo = await queryIP("8.8.8.8");
const asnInfo = await queryASN("15169");

console.log("Domain:", domainInfo.handle);
console.log("IP Network:", ipInfo.handle);
console.log("ASN:", asnInfo.handle);

// Geolocation queries with geoip0
import { createGeoIPManager } from "geoip0";
import ipsbDriver from "geoip0/drivers/ipsb";

const geoip = createGeoIPManager({
  driver: ipsbDriver(),
});

const location = await geoip.lookup("1.1.1.1");
const currentLocation = await geoip.current();

console.log("Location for 1.1.1.1:", location?.country, location?.city);
console.log(
  "Current IP location:",
  currentLocation?.country,
  currentLocation?.city,
);

// Network connectivity detection with unping
import { createPingManager } from "unping";
import tcpDriver from "unping/drivers/tcp";

const ping = createPingManager({
  driver: tcpDriver({ port: 80 }),
});

const results = await ping.ping("example.com");
console.log(
  `Host is ${results[0].alive ? "reachable" : "unreachable"} (${results[0].time}ms)`,
);
```

### Development

```bash
# Development mode
pnpm dev

# Build the project
pnpm build

# Run linting
pnpm lint

# Test the implementation
bun playground/drivers/node.ts
bun playground/geoip0/drivers/ipsb.ts
bun playground/geoip0/server.ts
bun playground/unping/drivers/tcp.ts
```

## Contributing

We welcome contributions! Here's how to get started:

### Quick Setup

1. **Fork the repository** on GitHub
2. **Clone your fork**:

   ```bash
   git clone https://github.com/YOUR_USERNAME/axis.git
   cd axis
   ```

3. **Add upstream remote**:

   ```bash
   git remote add upstream https://github.com/funish/axis.git
   ```

4. **Install dependencies**:

   ```bash
   pnpm install
   ```

5. **Development mode**:

   ```bash
   pnpm dev
   ```

### Development Workflow

1. **Code**: Follow our project standards
2. **Test**: `pnpm build`
3. **Commit**: Use conventional commits (`feat:`, `fix:`, etc.)
4. **Push**: Push to your fork
5. **Submit**: Create a Pull Request to upstream repository

## Support & Community

- 📫 [Report Issues](https://github.com/funish/axis/issues)

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

---

Built with ❤️ by [Funish](http://www.funish.net/)

# UnPing

![npm version](https://img.shields.io/npm/v/unping)
![npm downloads](https://img.shields.io/npm/dw/unping)
![npm license](https://img.shields.io/npm/l/unping)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg)](https://www.contributor-covenant.org/version/2/1/code_of_conduct/)

> Unified network ping/probe library with multi-driver support

## Features

- 🌐 **Multi-Driver Probes**: DNS, ICMP, TCP, TLS, Web, and Hybrid drivers
- 🔄 **Driver Pattern**: Consistent API design across different detection methods
- 📝 **TypeScript First**: Full type safety for probe options and rich results
- 🚀 **Native Timing**: ICMP, TCP, TLS handshake, and HTTP request observations
- ⚡ **Smart Fallback**: Hybrid driver automatically tries multiple detection methods
- 🔧 **Flexible Configuration**: Shared probe loop handling for count, interval, timeout, and size
- 📊 **Rich Results**: Timing, sequence, status, error phase, and driver-specific metadata
- 🛡️ **Error Resilient**: Stable result fields plus categorized probe failures

## Installation

```bash
$ npm install unping
# yarn add unping
# pnpm add unping
```

## Usage

```typescript
import { createPingManager } from "unping";
import tcpDriver from "unping/drivers/tcp";

const ping = createPingManager({
  driver: tcpDriver({ port: 443 }),
});

const results = await ping.ping("example.com", {
  count: 3,
  interval: 500,
  timeout: 3000,
});

console.log(results[0]);
// Stable fields: { host, alive, time, sequence }
```

The manager always resolves with one result per probe. `count: 0` resolves with an empty array. The interval, including an explicit `interval: 0`, is applied by a shared probe loop; network handles and timers are owned by each driver.

## Result contract

`host`, `alive`, and `time` are stable. Drivers add optional fields when the transport can observe them:

| Field                      | Meaning                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| `kind`                     | Built-in probe kind: `dns`, `hybrid`, `icmp`, `tcp`, `tls`, or `web`                         |
| `method`                   | Transport/request method, such as `native-ping`, `tls`, or `HEAD`                            |
| `sequence`                 | One-based probe sequence                                                                     |
| `timestamp`                | Result creation time in epoch milliseconds                                                   |
| `statusCode`               | Final HTTP status code (web)                                                                 |
| `sent`, `received`, `loss` | ICMP probe/reply counters; `loss` is a packet count                                          |
| `ttl`                      | ICMP time-to-live                                                                            |
| `error.code`               | OS, Node.js, or driver-specific code                                                         |
| `error.category`           | `dns`, `certificate`, `http`, `network`, `timeout`, `command`, `configuration`, or `unknown` |
| `error.phase`              | `dns`, `connect`, `handshake`, `request`, `command`, `timeout`, or `unknown`                 |
| `metadata`                 | Driver-specific records, timings, command details, or hybrid attempts                        |

Do not assume optional fields are present for every driver. A live result means the selected transport completed successfully; it does not imply every application endpoint is healthy.

## Driver matrix

| Driver   | Default target            | Success semantics                                                        | Additional observations                                           |
| -------- | ------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `dns`    | Operating-system resolver | One or more records resolve                                              | Records, record type, resolver timeout, DNS error code            |
| `hybrid` | TCP 80 → HTTPS 443 → DNS  | First live result wins; falls back after target-down and driver failures | Selected driver, ordered attempts, fallback drivers               |
| `icmp`   | OS `ping` binary          | Exit status 0 and a reply are alive                                      | Sent/received/lost packets, TTL, native timing, command arguments |
| `tcp`    | Port 80                   | TCP connection is established                                            | Connect timing, port, TCP error code/category                     |
| `tls`    | Port 443                  | TCP connection and TLS handshake complete                                | DNS/TCP/handshake timing, peer certificate, TLS error phase       |
| `web`    | Port 80 or 443            | Final HTTP status is accepted                                            | Status code, URL, redirect status, DNS/TLS/HTTP error metadata    |

### DNS

```typescript
import dnsDriver from "unping/drivers/dns";

const driver = dnsDriver({
  type: "AAAA",
  servers: ["8.8.8.8", "1.1.1.1"],
});
```

The DNS race timer is cleared after success, failure, or timeout. `ENOTFOUND`, `ESERVFAIL`, and other Node.js DNS codes are retained on `result.error`.

### Hybrid

```typescript
import dnsDriver from "unping/drivers/dns";
import hybridDriver from "unping/drivers/hybrid";
import tcpDriver from "unping/drivers/tcp";
import webDriver from "unping/drivers/web";

const driver = hybridDriver({
  drivers: [
    tcpDriver({ port: 443 }),
    webDriver({ method: "GET", path: "/health", successStatuses: [204] }),
    dnsDriver(),
  ],
});
```

Hybrid tries drivers in order and preserves the selected driver's result count. It distinguishes:

- **target_down**: the driver made a target observation and classified it as not alive.
- **driver_failure**: the driver could not execute, returned no results, threw, or marked a command/configuration error in `metadata.driverFailure`.

A target-down result falls through to the next strategy. When at least one target observation exists after all attempts, hybrid resolves with a non-live result and attaches `attempts` plus `fallbackReasons`. If no driver could make a target observation, it throws the final driver error; it does not silently rewrite a transport/configuration failure as `alive: false`.

### ICMP

The ICMP driver uses the operating system's native `ping` command. It does not open raw sockets or use Bun APIs. Targets are passed as the final argv value through `child_process.spawn` with `shell: false`; option-like or control-character targets are rejected.

```typescript
import icmpDriver from "unping/drivers/icmp";

const driver = icmpDriver({
  binaryPath: "/usr/local/bin/ping",
  platformBinaryPaths: {
    darwin: "/sbin/ping",
    linux: "/usr/bin/ping",
    win32: "C:\\Windows\\System32\\PING.EXE",
  },
});
```

The driver runs one native probe per result, uses the shared `count`/`interval` loop, sends `size` where the platform supports it, and kills the child at `timeout`. Output parsers cover common Windows, macOS, and Linux formats. Locale-specific output that cannot be parsed still keeps process status and counters.

### TCP

```typescript
import tcpDriver from "unping/drivers/tcp";

const driver = tcpDriver({ port: 5432 });
```

TCP connect timing is reported in `metadata.connectTime`; connection errors retain OS codes such as `ECONNREFUSED`.

### TLS

The TLS driver uses Node's `tls.connect`. It reports DNS lookup, TCP connect, and TLS handshake timing, plus peer certificate metadata after a successful handshake.

```typescript
import tlsDriver from "unping/drivers/tls";

const driver = tlsDriver({
  port: 8443,
  rejectUnauthorized: false,
  ca: "/path/to/ca.pem",
});
```

`metadata.tcpConnectTime` and `metadata.tlsHandshakeTime` are measured in milliseconds. `error.phase` distinguishes a failed TCP connection from a failed TLS handshake, and certificate data is retained where Node exposes it.

### Web

Web probes use the global `fetch` implementation. Status codes are preserved for both accepted and rejected HTTP responses.

```typescript
import webDriver from "unping/drivers/web";

const driver = webDriver({
  method: "HEAD",
  path: "/health",
  https: true,
  port: 8443,
  headers: { Authorization: "Bearer token" },
  successStatuses: [204, 418],
  isSuccess: (statusCode) => statusCode < 500,
});
```

`successStatuses` extends the default `2xx/3xx` rule; `isSuccess` fully replaces it. DNS, TCP, TLS/certificate, HTTP status, and timeout failures are represented with normalized `error` metadata rather than an identical bare `alive: false`.

## Batch probes

```typescript
const results = await ping.ping("example.com", {
  count: 5,
  timeout: 3000,
  interval: 500,
  size: 64,
});

const sent = results.length;
const received = results.filter((result) => result.alive).length;
const average = results.reduce((sum, result) => sum + result.time, 0) / sent;

console.log({ sent, received, loss: sent - received, average });
```

`size` is passed to drivers that support a packet size, currently ICMP. Drivers without a packet-size concept ignore it safely.

## Custom drivers

```typescript
import type { PingDriver } from "unping";

let sequence = 0;

const driver: PingDriver = {
  name: "custom",
  options: {},
  ping: async (host, options) => [
    {
      host,
      alive: true,
      time: 1,
      sequence: ++sequence,
      kind: "custom",
      method: "custom",
      timestamp: Date.now(),
      metadata: { requestedCount: options?.count ?? 1, source: "fixture" },
    },
  ],
};
```

For a real multi-probe adapter, import `runProbeSeries` from the package root and call your single-probe implementation once per sequence. It applies the shared defaults, zero intervals, validation, timestamps, and fallback sequence values.

## Validation

```bash
$ pnpm exec vp test run packages/unping
$ pnpm exec vp check --fix packages/unping
$ pnpm --filter unping build
```

Tests mock child processes, sockets, DNS resolvers, TLS sockets, and `fetch`; default tests do not require network access.

## License

- [MIT](LICENSE) &copy; [Funish](http://www.funish.net/)

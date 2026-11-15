/**
 * UnPing Types
 * Unified network ping library with multi-driver support
 */

/** Detection method used by a built-in driver. */
export type ProbeKind = "dns" | "hybrid" | "icmp" | "tcp" | "tls" | "web" | (string & {});

/** Error phase reported by a driver. */
export type ProbeErrorPhase =
  | "command"
  | "connect"
  | "dns"
  | "handshake"
  | "request"
  | "timeout"
  | "unknown";

/** Coarse error classification. */
export type ProbeErrorCategory =
  | "certificate"
  | "dns"
  | "http"
  | "network"
  | "timeout"
  | "command"
  | "configuration"
  | "unknown";

export interface ProbeErrorInfo {
  /** OS, Node.js, or driver-specific error code. */
  code?: string;
  /** Human-readable error message. */
  message?: string;
  /** Stable classification suitable for monitoring and fallback decisions. */
  category?: ProbeErrorCategory;
  /** Phase where the probe stopped. */
  phase?: ProbeErrorPhase;
}

/** Driver-specific probe details. */
export interface ProbeMetadata {
  [key: string]: unknown;
}

// Ping result
export interface PingResult {
  /** Target host */
  host: string;
  /** Is alive */
  alive: boolean;
  /** Response time (ms) */
  time: number;
  /** Sequence number */
  sequence?: number;
  /** TTL (ICMP only) */
  ttl?: number;
  /** Driver kind */
  kind?: ProbeKind;
  /** Underlying request method (for example, HEAD or DNS) */
  method?: string;
  /** HTTP status code (web driver) */
  statusCode?: number;
  /** Number of probes sent (ICMP) */
  sent?: number;
  /** Number of replies received (ICMP) */
  received?: number;
  /** Number of lost probes (ICMP) */
  loss?: number;
  /** Result creation time (epoch ms) */
  timestamp?: number;
  /** Normalized failure details */
  error?: ProbeErrorInfo;
  /** Driver-specific response details */
  metadata?: ProbeMetadata;
}

// Driver options (generic)
export interface DriverOptions {
  [key: string]: any;
}

// Ping options
export interface PingOptions {
  /** Probe count; 0 produces no results (default: 1) */
  count?: number;
  /** Timeout in ms (default: 5000) */
  timeout?: number;
  /** Packet size in bytes where supported */
  size?: number;
  /** Delay between probes in ms; 0 is honored (default: 0) */
  interval?: number;
}

// Utility types
export type MaybePromise<T> = T | Promise<T>;

// Driver interface accepted by the manager. Custom adapters may omit ping.
export interface Driver<OptionsT = DriverOptions> {
  name?: string;
  options?: OptionsT;

  // Ping - always returns array
  ping?: (host: string, options?: PingOptions) => MaybePromise<PingResult[]>;
}

// Built-in driver factories always provide ping and always return a promise.
export interface PingDriver<OptionsT = DriverOptions> extends Omit<Driver<OptionsT>, "ping"> {
  ping: (host: string, options?: PingOptions) => Promise<PingResult[]>;
}

// Manager configuration
export interface PingManagerOptions {
  driver: Driver;
}

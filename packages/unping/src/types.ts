/**
 * UnPing Types
 * Unified network ping library with multi-driver support
 */

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
  /** TTL */
  ttl?: number;
}

// Driver options (generic)
export interface DriverOptions {
  [key: string]: any;
}

// Ping options
export interface PingOptions {
  /** Ping count (default: 1) */
  count?: number;
  /** Timeout in ms (default: 5000) */
  timeout?: number;
  /** Packet size in bytes */
  size?: number;
  /** Interval between pings in ms */
  interval?: number;
}

// Utility types
export type MaybePromise<T> = T | Promise<T>;

// Driver interface
export interface Driver<OptionsT = DriverOptions> {
  name?: string;
  options?: OptionsT;

  // Ping - always returns array
  ping?: (host: string, options?: PingOptions) => MaybePromise<PingResult[]>;
}

// Manager configuration
export interface PingManagerOptions {
  driver: Driver;
}

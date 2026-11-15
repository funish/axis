/**
 * GeoIP Types
 * Unified geolocation information query interface
 */

// Geolocation information. Fields omitted by a provider are absent rather than
// filled with empty strings, zero coordinates, or false flags.
export interface GeoLocation {
  ip: string; // IP address
  country?: string; // Country name
  countryCode?: string; // Country code
  region?: string; // Region/Province
  regionCode?: string; // ISO 3166-2 region code (e.g., "US-CA")
  city?: string; // City
  latitude?: number; // Latitude
  longitude?: number; // Longitude
  isp?: string; // ISP provider
  org?: string; // Organization
  asn?: string; // ASN number
  timezone?: string; // Timezone
  source: string; // Data source
  accuracyRadius?: number | string; // Accuracy radius in kilometers
  isProxy?: boolean; // Whether the provider identifies the IP as a proxy/VPN
}

// Driver options
export interface DriverOptions {
  [key: string]: any;
}

// Query options
export interface QueryOptions {
  version?: "ipv4" | "ipv6" | "auto";

  /**
   * Return legacy empty strings, zero coordinates, and false proxy flags for
   * absent provider fields. New integrations should omit this compatibility
   * option and handle optional fields.
   */
  legacySparseFields?: boolean;
}

// Options for batch lookup and driver-side batching.
export interface BatchOptions {
  /** Maximum number of input IPs or native API requests per batch. */
  batchSize?: number;
  /** Maximum number of batches or single-IP requests in flight. */
  concurrency?: number;
}

export type BatchQueryOptions = QueryOptions & BatchOptions;

// Declared provider capabilities so callers and hybrid fallback can distinguish
// an unsupported operation from missing data or a provider failure.
export interface DriverCapabilities {
  lookup: boolean;
  current: boolean;
  batchLookup: boolean;
  /** Whether batchLookup maps to a provider-native bulk endpoint. */
  nativeBatch?: boolean;
  /** Whether lookup normally performs a remote request. */
  remote?: boolean;
  /** Whether the provider can explicitly identify proxies. */
  proxyDetection?: boolean;
}

// Utility types
export type MaybePromise<T> = T | Promise<T>;

// Driver interface
export interface Driver<OptionsT = DriverOptions> {
  name?: string;
  options?: OptionsT;
  capabilities?: DriverCapabilities;

  // Query specified IP. Providers may throw GeoIPProviderError for request or
  // application failures; null means no usable result was returned.
  lookup?: (ip: string, options?: QueryOptions) => MaybePromise<GeoLocation | null>;

  // Batch query multiple IPs. Successful individual lookups may be partial.
  batchLookup?: (ips: string[], options?: BatchQueryOptions) => MaybePromise<GeoLocation[]>;

  // Get current IP location
  current?: (options?: QueryOptions) => MaybePromise<GeoLocation | null>;
}

// GeoIP Manager configuration
export interface GeoIPManagerOptions {
  driver: Driver;
}

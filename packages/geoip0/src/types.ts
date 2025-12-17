/**
 * GeoIP Types
 * Unified geolocation information query interface
 */

// Geolocation information
export interface GeoLocation {
  ip?: string; // IP address
  country?: string; // Country name
  countryCode?: string; // Country code
  region?: string; // Region/Province
  city?: string; // City
  latitude?: number; // Latitude
  longitude?: number; // Longitude
  isp?: string; // ISP provider
  org?: string; // Organization
  asn?: string; // ASN number
  timezone?: string; // Timezone
  source?: string; // Data source
}

// Driver options
export interface DriverOptions {
  [key: string]: any;
}

// Query options
export interface QueryOptions {
  version?: "ipv4" | "ipv6" | "auto";
}

// Utility types
export type MaybePromise<T> = T | Promise<T>;

// Driver interface
export interface Driver<OptionsT = DriverOptions> {
  name?: string;
  options?: OptionsT;

  // Query specified IP
  lookup?: (
    ip: string,
    options?: QueryOptions,
  ) => MaybePromise<GeoLocation | null>;

  // Batch query multiple IPs
  batchLookup?: (
    ips: string[],
    options?: QueryOptions,
  ) => MaybePromise<GeoLocation[]>;

  // Get current IP location
  current?: (options?: QueryOptions) => MaybePromise<GeoLocation | null>;
}

// GeoIP Manager configuration
export interface GeoIPManagerOptions {
  driver: Driver;
}

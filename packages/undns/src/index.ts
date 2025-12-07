/**
 * UnDns - Unified DNS management library
 * A comprehensive DNS library with multi-driver support, DoH server, and utility functions
 */

// Export all types
export * from "./types";

// Export all DNS management functions
export * from "./dns";

// Export all utility functions
export * from "./utils";

// Export DNSCrypt resolvers data and types
import resolversData from "./data/resolvers.json";

export const resolvers = resolversData;

/**
 * UnPing - Unified network ping library
 * A comprehensive ping library with multi-driver support
 */

import type { PingManagerOptions, PingResult, PingOptions } from "./types";

// Create ping manager
export function createPingManager(options: PingManagerOptions) {
  const { driver } = options;

  return {
    /**
     * Ping a host - always returns array
     */
    ping: async (host: string, opts?: PingOptions): Promise<PingResult[]> => {
      if (!driver.ping) {
        throw new Error("Driver does not implement ping method");
      }
      return await driver.ping(host, opts);
    },
  };
}

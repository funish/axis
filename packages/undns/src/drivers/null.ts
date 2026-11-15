import type { Driver, DNSRecord, DriverOptions } from "..";

/**
 * A driver whose semantics are explicit emptiness. It is useful for disabling
 * DNS side effects in applications and tests.
 */
export default function nullDriver(options: DriverOptions = {}): Driver {
  return {
    name: "null",
    options,
    capabilities: {
      read: false,
      write: false,
      upsert: false,
      batchWrite: false,
      nxdomain: false,
    },

    getRecord: async (): Promise<DNSRecord | null> => null,
    getRecords: async (): Promise<DNSRecord[]> => [],
    hasRecord: async (): Promise<boolean> => false,
    dispose: async (): Promise<void> => {},
  };
}

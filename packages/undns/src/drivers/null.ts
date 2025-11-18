import type { Driver, DNSRecord, DriverOptions } from "..";

export default function nullDriver(options: DriverOptions = {}): Driver {
  return {
    name: "null",
    options,

    // Read operations - all return empty/null values
    getRecord: async (): Promise<DNSRecord | null> => {
      return null;
    },

    getRecords: async (): Promise<DNSRecord[]> => {
      return [];
    },

    hasRecord: async (): Promise<boolean> => {
      return false;
    },

    // Write operations - all are no-ops
    setRecord: async (): Promise<DNSRecord> => {
      return {} as DNSRecord;
    },

    setRecords: async (): Promise<DNSRecord[]> => {
      return [];
    },

    removeRecord: async (): Promise<void> => {
      // No-op
    },

    removeRecords: async (): Promise<void> => {
      // No-op
    },

    // Lifecycle - no-op
    dispose: async (): Promise<void> => {
      // No-op
    },
  };
}

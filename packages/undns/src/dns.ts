import type {
  DNSRecord,
  DNSRecordInput,
  DNSManagerOptions,
  RecordOptions,
} from "./types";

export function createDNSManager(options: DNSManagerOptions) {
  const driver = options.driver;

  // Core DNS operations
  const dns = {
    getRecord: driver.getRecord || (async () => null),
    getRecords: driver.getRecords || (async () => []),
    hasRecord:
      driver.hasRecord ||
      (async (domain: string, options: RecordOptions & { type: string }) => {
        // Fallback: use getRecords to check existence
        const records = (await driver.getRecords?.(domain, options)) || [];
        return records.length > 0;
      }),

    setRecord:
      driver.setRecord ||
      (async (domain: string, record: DNSRecordInput) => {
        // Fallback: use setRecords for single record
        if (driver.setRecords) {
          const results = await driver.setRecords(domain, [record]);
          return results[0] || null;
        }
        throw new Error("setRecord not implemented");
      }),

    setRecords:
      driver.setRecords ||
      (async (domain: string, records: DNSRecordInput[]) => {
        // Fallback: set records one by one if setRecord is available
        if (driver.setRecord) {
          return Promise.all(
            records.map((record) => driver.setRecord!(domain, record)),
          );
        }
        throw new Error("setRecords not implemented");
      }),

    removeRecord:
      driver.removeRecord ||
      (async (domain: string, record: DNSRecord) => {
        // Fallback: use removeRecords for single record
        if (driver.removeRecords) {
          await driver.removeRecords(domain, [record]);
        } else {
          throw new Error("removeRecord not implemented");
        }
      }),

    removeRecords:
      driver.removeRecords ||
      (async (domain: string, records: DNSRecord[]) => {
        // Fallback: remove records one by one if removeRecord is available
        if (driver.removeRecord) {
          return Promise.all(
            records.map((record) => driver.removeRecord!(domain, record)),
          );
        }
        throw new Error("removeRecords not implemented");
      }),

    dispose:
      driver.dispose ||
      (async () => {
        // No-op if not implemented
      }),
  };

  return dns;
}

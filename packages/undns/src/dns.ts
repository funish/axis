import { UNDNS_ERROR_CODES, UndnsError, toUndnsError } from "./errors";
import type {
  DNSRecord,
  DNSRecordInput,
  DNSManagerOptions,
  DriverCapabilities,
  BatchRemoveResult,
  BatchSetResult,
  RecordOptions,
} from "./types";

function localName(name: string | undefined, domain: string): string {
  if (!name || name === "@" || name === domain) return "@";
  const suffix = `.${domain}`;
  return name.toLowerCase().endsWith(suffix.toLowerCase()) ? name.slice(0, -suffix.length) : name;
}

function recordValue(record: Record<string, any>): unknown {
  const type = record.type?.toUpperCase();
  switch (type) {
    case "A":
    case "AAAA":
      return String(record.address ?? "").toLowerCase();
    case "CNAME":
    case "NS":
    case "PTR":
      return String(record.value ?? "").toLowerCase();
    case "MX":
      return [record.priority, String(record.exchange ?? "").toLowerCase()];
    case "TXT":
      return (record.entries ?? []).join("");
    case "SRV":
      return [record.priority, record.weight, record.port, String(record.name ?? "").toLowerCase()];
    case "CAA":
      return [record.critical, record.issue, record.iodef, record.issuewild];
    default:
      return record.data ?? record.content;
  }
}

function isSameRecord(existing: DNSRecord, input: DNSRecordInput, domain: string): boolean {
  return (
    localName(existing.name, domain) === localName(input.name, domain) &&
    existing.type?.toUpperCase() === input.type?.toUpperCase() &&
    JSON.stringify(recordValue(existing)) === JSON.stringify(recordValue(input))
  );
}

export function createDNSManager(options: DNSManagerOptions) {
  const driver = options.driver;
  const readCapable = Boolean(driver.getRecord || driver.getRecords || driver.hasRecord);
  const writeCapable = Boolean(
    driver.setRecord || driver.setRecords || driver.removeRecord || driver.removeRecords,
  );

  const capabilities: Required<Omit<DriverCapabilities, "batchWrite" | "nxdomain">> & {
    batchWrite: boolean;
    nxdomain: boolean;
  } = {
    read: driver.capabilities?.read ?? readCapable,
    write: driver.capabilities?.write ?? writeCapable,
    upsert: driver.capabilities?.upsert ?? Boolean(driver.setRecord || driver.setRecords),
    batchWrite: driver.capabilities?.batchWrite ?? Boolean(driver.setRecords),
    nxdomain: driver.capabilities?.nxdomain ?? false,
  };

  async function getRecords(domain: string, recordOptions?: RecordOptions): Promise<DNSRecord[]> {
    if (!capabilities.read || !driver.getRecords) {
      throw new UndnsError(
        UNDNS_ERROR_CODES.unsupportedOperation,
        "Driver does not support getRecords",
      );
    }
    return Promise.resolve(driver.getRecords(domain, recordOptions));
  }

  async function setRecord(domain: string, record: DNSRecordInput): Promise<DNSRecord> {
    if (!capabilities.write) {
      throw new UndnsError(
        UNDNS_ERROR_CODES.unsupportedOperation,
        "Driver does not support record writes",
      );
    }

    if (!capabilities.upsert && driver.getRecords) {
      const existingRecords = await getRecords(domain, {
        name: record.name,
        type: record.type,
      });
      const exact = existingRecords.find((candidate) => isSameRecord(candidate, record, domain));
      if (exact) return exact;
    }

    if (!driver.setRecord) {
      throw new UndnsError(
        UNDNS_ERROR_CODES.unsupportedOperation,
        "Driver does not support setRecord",
      );
    }
    return Promise.resolve(driver.setRecord(domain, record));
  }

  const manager = {
    driver,
    capabilities,

    getRecords,

    async getRecord(domain: string, recordOptions?: RecordOptions): Promise<DNSRecord | null> {
      if (!capabilities.read) {
        throw new UndnsError(
          UNDNS_ERROR_CODES.unsupportedOperation,
          "Driver does not support record reads",
        );
      }
      if (driver.getRecord) return Promise.resolve(driver.getRecord(domain, recordOptions));
      const records = await getRecords(domain, recordOptions);
      return records[0] ?? null;
    },

    async hasRecord(
      domain: string,
      recordOptions: RecordOptions & { type: string },
    ): Promise<boolean> {
      if (!capabilities.read) {
        throw new UndnsError(
          UNDNS_ERROR_CODES.unsupportedOperation,
          "Driver does not support record reads",
        );
      }
      if (driver.hasRecord) return Promise.resolve(driver.hasRecord(domain, recordOptions));
      const records = await getRecords(domain, recordOptions);
      return records.length > 0;
    },

    setRecord,

    async setRecords(domain: string, records: DNSRecordInput[]): Promise<BatchSetResult> {
      if (!capabilities.write) {
        throw new UndnsError(
          UNDNS_ERROR_CODES.unsupportedOperation,
          "Driver does not support record writes",
        );
      }

      if (!driver.setRecord && driver.setRecords) {
        try {
          const prepared = await Promise.all(
            records.map(async (record): Promise<DNSRecordInput> => {
              if (capabilities.upsert) return record;
              const existing = await getRecords(domain, { name: record.name, type: record.type });
              const exact = existing.find((candidate) => isSameRecord(candidate, record, domain));
              return (exact ?? record) as DNSRecordInput;
            }),
          );
          const results = await Promise.resolve(driver.setRecords(domain, prepared));
          return { records: results, failures: [], succeeded: results.length, failed: 0 };
        } catch (error) {
          return {
            records: [],
            failures: [
              {
                index: 0,
                item: records[0]!,
                error: toUndnsError(error, "Batch record write failed"),
              },
            ],
            succeeded: 0,
            failed: records.length,
          };
        }
      }

      const resultRecords: DNSRecord[] = [];
      const failures: BatchSetResult["failures"] = [];
      for (const [index, record] of records.entries()) {
        try {
          resultRecords.push(await setRecord(domain, record));
        } catch (error) {
          failures.push({
            index,
            item: record,
            error: toUndnsError(error, "Record write failed"),
          });
        }
      }
      return {
        records: resultRecords,
        failures,
        succeeded: resultRecords.length,
        failed: failures.length,
      };
    },

    async removeRecord(domain: string, record: DNSRecord): Promise<void> {
      if (!capabilities.write) {
        throw new UndnsError(
          UNDNS_ERROR_CODES.unsupportedOperation,
          "Driver does not support record writes",
        );
      }
      if (!driver.removeRecord) {
        throw new UndnsError(
          UNDNS_ERROR_CODES.unsupportedOperation,
          "Driver does not support removeRecord",
        );
      }
      return Promise.resolve(driver.removeRecord(domain, record));
    },

    async removeRecords(domain: string, records: DNSRecord[]): Promise<BatchRemoveResult> {
      if (!capabilities.write) {
        throw new UndnsError(
          UNDNS_ERROR_CODES.unsupportedOperation,
          "Driver does not support record writes",
        );
      }

      if (!driver.removeRecord && driver.removeRecords) {
        try {
          await Promise.resolve(driver.removeRecords(domain, records));
          return { removed: records.length, failures: [], succeeded: records.length, failed: 0 };
        } catch (error) {
          return {
            removed: 0,
            failures: [
              {
                index: 0,
                item: records[0]!,
                error: toUndnsError(error, "Batch record removal failed"),
              },
            ],
            succeeded: 0,
            failed: records.length,
          };
        }
      }

      const failures: BatchRemoveResult["failures"] = [];
      for (const [index, record] of records.entries()) {
        try {
          await manager.removeRecord(domain, record);
        } catch (error) {
          failures.push({
            index,
            item: record,
            error: toUndnsError(error, "Record removal failed"),
          });
        }
      }
      const removed = records.length - failures.length;
      return { removed, failures, succeeded: removed, failed: failures.length };
    },

    async dispose(): Promise<void> {
      await driver.dispose?.();
    },
  };

  return manager;
}

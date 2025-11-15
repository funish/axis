import Cloudflare, { type ClientOptions } from "cloudflare";
import type { RecordListParams } from "cloudflare/resources/dns/records";
import type {
  Driver,
  DNSRecord,
  DNSRecordInput,
  DriverOptions,
  RecordOptions,
} from "../types";

// Use Cloudflare ClientOptions directly, only add DriverOptions extension
export interface CloudflareDriverOptions extends DriverOptions, ClientOptions {}

// Cloudflare DNS record type mapping
type CloudflareDnsRecordType =
  | "A"
  | "AAAA"
  | "CNAME"
  | "MX"
  | "TXT"
  | "SRV"
  | "NS"
  | "PTR"
  | "CAA";

export default function cloudflareDriver(
  options: CloudflareDriverOptions,
): Driver {
  const client = new Cloudflare(options);

  // Helper: Get zone ID from domain
  async function getZoneId(domain: string): Promise<string> {
    try {
      // Get all zones
      const zones = [];
      for await (const zone of client.zones.list()) {
        zones.push(zone);
      }

      // Find matching zone
      const matchingZone = zones.find(
        (zone) => domain === zone.name || domain.endsWith("." + zone.name),
      );

      if (!matchingZone) {
        throw new Error(`Zone not found for domain: ${domain}`);
      }

      return matchingZone.id;
    } catch (error) {
      throw new Error(`Failed to get zone ID for ${domain}: ${String(error)}`);
    }
  }

  // Get records method
  const getRecords = async (
    domain: string,
    options?: RecordOptions,
  ): Promise<DNSRecord[]> => {
    try {
      const zoneId = await getZoneId(domain);
      const records = [];

      // Get records of specified type
      const recordType =
        options?.type?.toUpperCase() as CloudflareDnsRecordType;
      const recordName = options?.name
        ? `${options.name}.${domain}`
        : undefined;

      const listParams: RecordListParams = {
        zone_id: zoneId,
        type: recordType,
      };
      if (recordName) {
        listParams.name = { exact: recordName };
      }

      for await (const record of client.dns.records.list(listParams)) {
        records.push(fromCloudflareRecord(record));
      }

      return records;
    } catch (error) {
      console.error(`Failed to get records for ${domain}:`, error);
      return [];
    }
  };

  // Helper: Convert unified format to Cloudflare format
  function toCloudflareRecord(record: DNSRecordInput, domain: string) {
    const { name: recordName, type, ...rest } = record;

    // Build record name
    const cloudflareRecordName =
      recordName === domain || recordName === "@"
        ? domain
        : `${recordName}.${domain}`;

    const baseRecord = {
      name: cloudflareRecordName,
      type: type.toUpperCase() as CloudflareDnsRecordType,
      ttl: 1, // Cloudflare minimum TTL
    };

    // Add content based on type
    switch (type.toUpperCase()) {
      case "A":
      case "AAAA":
        return { ...baseRecord, content: rest.address };
      case "CNAME":
        return { ...baseRecord, content: rest.value };
      case "MX":
        return { ...baseRecord, content: `${rest.priority} ${rest.exchange}` };
      case "TXT":
        return {
          ...baseRecord,
          content: Array.isArray(rest.entries) ? rest.entries.join("") : "",
        };
      case "SRV":
        return {
          ...baseRecord,
          content: `${rest.priority} ${rest.weight} ${rest.port} ${rest.target || rest.name}`,
        };
      case "NS":
        return { ...baseRecord, content: rest.value };
      case "PTR":
        return { ...baseRecord, content: rest.value };
      case "CAA":
        const flags = rest.critical ? 128 : 0;
        const tag = rest.issue ? "issue" : "iodef";
        const value = rest.issue || rest.iodef;
        return { ...baseRecord, content: `${flags} ${tag} "${value}"` };
      default:
        throw new Error(`Unsupported record type: ${type}`);
    }
  }

  // Helper: Convert Cloudflare format to unified format
  function fromCloudflareRecord(record: any): DNSRecord {
    const { id, name, type, content, ttl } = record;

    // Extract record name (remove domain part)
    const recordName = name.split(".").slice(0, -1).join(".");

    const base = {
      id,
      type,
      name: recordName || "@",
      ttl: ttl || 0,
    };

    switch (type) {
      case "A":
      case "AAAA":
        return { ...base, address: content };
      case "CNAME":
        return { ...base, value: content };
      case "MX":
        const [priority, ...exchangeParts] = content.split(" ");
        return {
          ...base,
          priority: parseInt(priority),
          exchange: exchangeParts.join(" "),
        };
      case "TXT":
        return { ...base, entries: [content] };
      case "SRV":
        const [srvPriority, srvWeight, srvPort, ...srvNameParts] =
          content.split(" ");
        return {
          ...base,
          priority: parseInt(srvPriority),
          weight: parseInt(srvWeight),
          port: parseInt(srvPort),
          name: srvNameParts.join(" "),
        };
      case "NS":
        return { ...base, value: content };
      case "PTR":
        return { ...base, value: content };
      case "CAA":
        const [flags, tag, ...valueParts] = content.split(" ");
        const tagValue = valueParts.join(" ").replace(/"/g, "");
        return {
          ...base,
          critical: parseInt(flags) === 128 ? 1 : 0,
          [tag]: tagValue,
        };
      default:
        throw new Error(`Unsupported Cloudflare record type: ${type}`);
    }
  }

  return {
    name: "cloudflare",
    options,

    // Read operations
    getRecords,

    getRecord: async (
      domain: string,
      options?: RecordOptions,
    ): Promise<DNSRecord | null> => {
      try {
        const records = await getRecords(domain, options);
        return records[0] || null;
      } catch {
        return null;
      }
    },

    hasRecord: async (
      domain: string,
      options: RecordOptions & { type: string },
    ): Promise<boolean> => {
      try {
        const records = await getRecords(domain, options);
        return records.length > 0;
      } catch {
        return false;
      }
    },

    // Write operations
    setRecord: async (
      domain: string,
      record: DNSRecordInput,
    ): Promise<DNSRecord> => {
      try {
        const zoneId = await getZoneId(domain);
        const cloudflareRecord = toCloudflareRecord(record, domain);

        const result = await client.dns.records.create({
          zone_id: zoneId,
          ...cloudflareRecord,
        });
        return fromCloudflareRecord(result);
      } catch (error) {
        throw new Error(`Failed to set record for ${domain}: ${String(error)}`);
      }
    },

    setRecords: async (
      domain: string,
      records: DNSRecordInput[],
    ): Promise<DNSRecord[]> => {
      try {
        const zoneId = await getZoneId(domain);
        const results = [];

        for (const record of records) {
          const cloudflareRecord = toCloudflareRecord(record, domain);
          const result = await client.dns.records.create({
            zone_id: zoneId,
            ...cloudflareRecord,
          });
          results.push(fromCloudflareRecord(result));
        }

        return results;
      } catch (error) {
        throw new Error(
          `Failed to set records for ${domain}: ${String(error)}`,
        );
      }
    },

    removeRecord: async (domain: string, record: DNSRecord): Promise<void> => {
      try {
        const zoneId = await getZoneId(domain);
        const recordId = record.id;

        if (!recordId) {
          throw new Error("Record ID is required for removal");
        }

        await client.dns.records.delete(recordId, {
          zone_id: zoneId,
        });
      } catch (error) {
        throw new Error(
          `Failed to remove record for ${domain}: ${String(error)}`,
        );
      }
    },

    removeRecords: async (
      domain: string,
      records: DNSRecord[],
    ): Promise<void> => {
      try {
        const zoneId = await getZoneId(domain);

        for (const record of records) {
          const recordId = record.id;
          if (recordId) {
            await client.dns.records.delete(recordId, {
              zone_id: zoneId,
            });
          }
        }
      } catch (error) {
        throw new Error(
          `Failed to remove records for ${domain}: ${String(error)}`,
        );
      }
    },

    dispose: async (): Promise<void> => {
      // No cleanup needed for Cloudflare client
    },
  };
}

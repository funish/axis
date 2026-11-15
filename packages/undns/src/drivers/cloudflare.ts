import Cloudflare, { type ClientOptions } from "cloudflare";
import type { RecordListParams } from "cloudflare/resources/dns/records";

import type { Driver, DNSRecord, DNSRecordInput, DriverOptions, RecordOptions } from "..";
import { UNDNS_ERROR_CODES, UndnsError, toUndnsError } from "../errors";

// Use Cloudflare ClientOptions directly, only add DriverOptions extension
export interface CloudflareDriverOptions extends DriverOptions, ClientOptions {
  /** Fixed zone ID for a single-zone token or client. */
  zoneId?: string;
  /** Explicit zone IDs, keyed by zone name. Preferred over zone discovery. */
  zones?: Record<string, string>;
}

type CloudflareDnsRecordType = Exclude<RecordListParams["type"], undefined>;

function localName(name: string, domain: string): string {
  const value = name.toLowerCase();
  const zone = domain.toLowerCase();
  if (!value || value === "@" || value === zone) return "@";
  return value.endsWith(`.${zone}`) ? value.slice(0, -(zone.length + 1)) : value;
}

function fullRecordName(name: string, domain: string): string {
  const zone = domain.toLowerCase();
  if (!name || name === "@" || name.toLowerCase() === zone) return domain;
  return name.toLowerCase().endsWith(`.${zone}`) ? name : `${name}.${domain}`;
}

export default function cloudflareDriver(options: CloudflareDriverOptions): Driver {
  const client = new Cloudflare(options);
  const configuredZones = new Map(
    Object.entries(options.zones ?? {}).map(([name, id]) => [name.toLowerCase(), id]),
  );
  const zoneCache = new Map<string, Promise<string>>();

  async function discoverZoneId(domain: string): Promise<string> {
    const normalizedDomain = domain.toLowerCase();
    const labels = normalizedDomain.split(".");
    for (let index = 0; index < labels.length - 1; index++) {
      const candidate = labels.slice(index).join(".");
      for await (const zone of client.zones.list({ name: candidate, per_page: 1 })) {
        const zoneId = zone.id;
        zoneCache.set(candidate, Promise.resolve(zoneId));
        return zoneId;
      }
    }

    throw new UndnsError(
      UNDNS_ERROR_CODES.zoneNotFound,
      `Cloudflare zone not found for ${domain}`,
      {
        provider: "cloudflare",
        details: { domain },
      },
    );
  }

  function getZoneId(domain: string): Promise<string> {
    const cacheKey = domain.toLowerCase();
    const configuredExact = configuredZones.get(cacheKey);
    if (configuredExact) return Promise.resolve(configuredExact);

    for (const [zoneName, configuredZoneId] of configuredZones) {
      if (cacheKey.endsWith(`.${zoneName}`)) return Promise.resolve(configuredZoneId);
    }
    if (options.zoneId) return Promise.resolve(options.zoneId);

    const cached = zoneCache.get(cacheKey);
    if (cached) return cached;

    for (const [zoneName, zoneId] of zoneCache) {
      if (cacheKey.endsWith(`.${zoneName}`)) return zoneId;
    }

    const lookup = discoverZoneId(domain).catch((error) => {
      zoneCache.delete(cacheKey);
      throw toUndnsError(error, `Failed to resolve Cloudflare zone for ${domain}`, {
        provider: "cloudflare",
      });
    });
    zoneCache.set(cacheKey, lookup);
    return lookup;
  }

  const getRecords = async (
    domain: string,
    recordOptions?: RecordOptions,
  ): Promise<DNSRecord[]> => {
    const zoneId = await getZoneId(domain);
    const recordType = recordOptions?.type?.toUpperCase() as RecordListParams["type"];
    const queryName = recordOptions?.name ? fullRecordName(recordOptions.name, domain) : undefined;

    const listParams: RecordListParams = {
      zone_id: zoneId,
      type: recordType,
    };
    if (queryName) {
      listParams.name = { exact: queryName };
    }

    try {
      const records: DNSRecord[] = [];
      // The SDK iterator follows Cloudflare cursor pagination while retaining
      // a bounded memory footprint.
      for await (const record of client.dns.records.list(listParams)) {
        records.push(fromCloudflareRecord(record, domain));
      }
      return records;
    } catch (error) {
      throw toUndnsError(error, `Failed to list Cloudflare records for ${domain}`, {
        provider: "cloudflare",
        details: { domain, zoneId },
      });
    }
  };

  function toCloudflareRecord(record: DNSRecordInput, domain: string) {
    const { name: recordName, type, ...rest } = record;
    const upperType = type.toUpperCase();

    if (recordName === undefined || recordName === null || recordName === "") {
      throw new UndnsError(UNDNS_ERROR_CODES.unsupportedRecordType, "Record name is required", {
        provider: "cloudflare",
      });
    }

    const baseRecord = {
      name: fullRecordName(recordName, domain),
      type: upperType as CloudflareDnsRecordType,
      ttl: typeof record.ttl === "number" ? record.ttl : 1,
    };

    switch (upperType) {
      case "A":
      case "AAAA":
        return { ...baseRecord, content: rest.address };
      case "CNAME":
      case "NS":
      case "PTR":
        return { ...baseRecord, content: rest.value };
      case "MX":
        return { ...baseRecord, content: `${rest.priority} ${rest.exchange}` };
      case "TXT":
        return {
          ...baseRecord,
          content: Array.isArray(rest.entries) ? rest.entries.join("") : String(rest.data ?? ""),
        };
      case "SRV":
        return {
          ...baseRecord,
          content: `${rest.priority} ${rest.weight} ${rest.port} ${rest.target || rest.name}`,
        };
      case "CAA": {
        const flags = rest.critical ? 128 : 0;
        const tag = rest.issue ? "issue" : rest.issuewild ? "issuewild" : "iodef";
        const value = rest.issue || rest.issuewild || rest.iodef;
        return { ...baseRecord, content: `${flags} ${tag} "${value}"` };
      }
      default:
        throw new UndnsError(
          UNDNS_ERROR_CODES.unsupportedRecordType,
          `Unsupported Cloudflare record type: ${type}`,
          { provider: "cloudflare", details: { type } },
        );
    }
  }

  function fromCloudflareRecord(record: any, domain: string): DNSRecord {
    const { id, name, type, content, ttl } = record;
    const base = {
      id: String(id),
      type,
      name: localName(String(name), domain),
      ttl: typeof ttl === "number" ? ttl : 0,
    };

    switch (type) {
      case "A":
      case "AAAA":
        return { ...base, address: content };
      case "CNAME":
      case "NS":
      case "PTR":
        return { ...base, value: content };
      case "MX": {
        const [priority = "0", ...exchangeParts] = String(content).split(" ");
        return { ...base, priority: Number(priority), exchange: exchangeParts.join(" ") };
      }
      case "TXT":
        return { ...base, entries: [String(content)] };
      case "SRV": {
        const [priority = "0", weight = "0", port = "0", ...targetParts] =
          String(content).split(" ");
        return {
          ...base,
          priority: Number(priority),
          weight: Number(weight),
          port: Number(port),
          name: targetParts.join(" "),
        };
      }
      case "CAA": {
        const [flags = "0", tag = "issue", ...valueParts] = String(content).split(" ");
        const tagValue = valueParts.join(" ").replace(/^"|"$/g, "");
        return {
          ...base,
          critical: Number(flags) === 128 ? 1 : 0,
          [tag]: tagValue,
        };
      }
      default:
        // Preserve provider-specific records without dropping an entire page.
        return { ...base, data: String(content) } as unknown as DNSRecord;
    }
  }

  function sameCloudflareRecord(
    existing: DNSRecord,
    cloudflareRecord: ReturnType<typeof toCloudflareRecord>,
    domain: string,
  ) {
    return (
      existing.type === cloudflareRecord.type &&
      localName(String(existing.name), domain) === localName(cloudflareRecord.name, domain) &&
      JSON.stringify(recordValue(existing)) === JSON.stringify(cloudflareRecord.content)
    );
  }

  function recordValue(record: Record<string, any>): string {
    const type = record.type?.toUpperCase();
    const value =
      record.address ??
      record.value ??
      (Array.isArray(record.entries) ? record.entries.join("") : (record.data ?? record.content));
    const identity =
      type === "MX"
        ? `${record.priority} ${record.exchange}`
        : type === "SRV"
          ? `${record.priority} ${record.weight} ${record.port} ${record.name}`
          : value;
    if (type === "CAA") {
      const tag = record.issue ? "issue" : record.issuewild ? "issuewild" : "iodef";
      return `${record.critical ?? 0} ${tag} ${record.issue ?? record.issuewild ?? record.iodef ?? ""}`.toLowerCase();
    }
    return String(identity ?? "").toLowerCase();
  }

  const setRecord = async (domain: string, record: DNSRecordInput): Promise<DNSRecord> => {
    const zoneId = await getZoneId(domain);
    const cloudflareRecord = toCloudflareRecord(record, domain);

    try {
      const matching = await getRecords(domain, { name: record.name, type: record.type });
      const exact = matching.find((candidate) =>
        sameCloudflareRecord(candidate, cloudflareRecord, domain),
      );
      const recordId = record.id ?? exact?.id;

      const result = recordId
        ? await client.dns.records.update(recordId, {
            zone_id: zoneId,
            ...cloudflareRecord,
          })
        : await client.dns.records.create({
            zone_id: zoneId,
            ...cloudflareRecord,
          });
      return fromCloudflareRecord(result, domain);
    } catch (error) {
      throw toUndnsError(error, `Failed to set Cloudflare record for ${domain}`, {
        provider: "cloudflare",
        details: { domain, type: record.type },
      });
    }
  };

  const removeRecord = async (domain: string, record: DNSRecord): Promise<void> => {
    const zoneId = await getZoneId(domain);
    if (!record.id) {
      throw new UndnsError(UNDNS_ERROR_CODES.recordNotFound, "Record ID is required for removal", {
        provider: "cloudflare",
        details: { domain, record: record.name },
      });
    }

    try {
      await client.dns.records.delete(record.id, { zone_id: zoneId });
    } catch (error) {
      throw toUndnsError(error, `Failed to remove Cloudflare record for ${domain}`, {
        provider: "cloudflare",
        details: { domain, recordId: record.id },
      });
    }
  };

  return {
    name: "cloudflare",
    options,
    capabilities: {
      read: true,
      write: true,
      upsert: true,
      batchWrite: false,
      nxdomain: false,
    },

    getRecords,

    async getRecord(domain: string, recordOptions?: RecordOptions): Promise<DNSRecord | null> {
      return (await getRecords(domain, recordOptions))[0] ?? null;
    },

    async hasRecord(
      domain: string,
      recordOptions: RecordOptions & { type: string },
    ): Promise<boolean> {
      return (await getRecords(domain, recordOptions)).length > 0;
    },

    setRecord,

    async setRecords(domain: string, records: DNSRecordInput[]): Promise<DNSRecord[]> {
      const results: DNSRecord[] = [];
      for (const record of records) {
        results.push(await setRecord(domain, record));
      }
      return results;
    },

    removeRecord,

    async removeRecords(domain: string, records: DNSRecord[]): Promise<void> {
      for (const record of records) {
        await removeRecord(domain, record);
      }
    },

    dispose: async (): Promise<void> => {
      // The Cloudflare client holds no undns-owned resources to close.
    },
  };
}

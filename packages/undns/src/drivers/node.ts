import { promises as dnsPromises } from "dns";
import type {
  ResolverOptions,
  NaptrRecord,
  SoaRecord,
  CaaRecord,
  SrvRecord,
  MxRecord,
} from "node:dns";
import type {
  Driver,
  DNSRecord,
  DNSRecordInput,
  DriverOptions,
  RecordOptions,
  RawDNSResult,
} from "../types";

export interface NodeDriverOptions extends DriverOptions, ResolverOptions {
  servers?: string[];
}

export default function nodeDriver(options: NodeDriverOptions = {}): Driver {
  // Create DNS resolver with options
  const resolver = new dnsPromises.Resolver(options);

  if (options.servers) {
    resolver.setServers(options.servers);
  }

  // Helper to build full hostname from domain and subdomain
  const buildHostname = (domain: string, subdomain?: string): string => {
    if (!subdomain) return domain;
    return subdomain.includes(".") ? subdomain : `${subdomain}.${domain}`;
  };

  // Get records method using the complete resolve function
  const getRecords = async (
    domain: string,
    options?: RecordOptions,
  ): Promise<DNSRecord[]> => {
    const hostname = buildHostname(domain, options?.name);
    const records: DNSRecord[] = [];

    try {
      const recordTypes = options?.type
        ? [options.type]
        : [
            "A",
            "AAAA",
            "CNAME",
            "MX",
            "TXT",
            "NS",
            "SOA",
            "SRV",
            "CAA",
            "NAPTR",
            "TLSA",
          ];

      for (const type of recordTypes) {
        try {
          const results = (await resolver.resolve(
            hostname,
            type,
          )) as RawDNSResult;

          // Convert Node.js results to our unified format
          if (type === "SOA") {
            // SOA returns a single object, convert to AnySoaRecord
            const soaResult = results as SoaRecord;
            records.push({
              type: "SOA",
              nsname: soaResult.nsname,
              hostmaster: soaResult.hostmaster,
              serial: soaResult.serial,
              refresh: soaResult.refresh,
              retry: soaResult.retry,
              expire: soaResult.expire,
              minttl: soaResult.minttl,
            });
          } else if (type === "TXT") {
            // TXT returns string[][], convert to AnyTxtRecord[]
            const txtResults = results as string[][];
            txtResults.forEach((entries) => {
              records.push({
                type: "TXT",
                entries,
              });
            });
          } else if (type === "MX") {
            // MX returns array of MX records
            const mxRecords = results as unknown as MxRecord[];
            mxRecords.forEach((record) => {
              records.push({
                type: "MX",
                priority: record.priority,
                exchange: record.exchange,
              });
            });
          } else if (type === "SRV") {
            // SRV returns array of SRV records
            const srvRecords = results as unknown as SrvRecord[];
            srvRecords.forEach((record) => {
              records.push({
                type: "SRV",
                priority: record.priority,
                weight: record.weight,
                port: record.port,
                name: record.name,
              });
            });
          } else if (type === "CAA") {
            // CAA returns array of CAA records
            const caaRecords = results as unknown as CaaRecord[];
            caaRecords.forEach((record) => {
              records.push({
                type: "CAA",
                critical: record.critical,
                issue: record.issue,
                iodef: record.iodef,
                issuewild: record.issuewild,
                contactemail: record.contactemail,
                contactphone: record.contactphone,
              });
            });
          } else if (type === "NAPTR") {
            // NAPTR returns array of NAPTR records
            const naptrRecords = results as unknown as NaptrRecord[];
            naptrRecords.forEach((record) => {
              records.push({
                type: "NAPTR",
                flags: record.flags,
                service: record.service,
                regexp: record.regexp,
                replacement: record.replacement,
                order: record.order,
                preference: record.preference,
              });
            });
          } else {
            // A, AAAA, CNAME, NS, PTR return string[]
            const stringResults = results as string[];
            stringResults.forEach((result) => {
              if (type === "A") {
                records.push({
                  type: "A",
                  address: result,
                  ttl: 0, // Default TTL, could be enhanced with resolve4 options
                });
              } else if (type === "AAAA") {
                records.push({
                  type: "AAAA",
                  address: result,
                  ttl: 0, // Default TTL, could be enhanced with resolve6 options
                });
              } else if (type === "CNAME") {
                records.push({
                  type: "CNAME",
                  value: result,
                });
              } else if (type === "NS") {
                records.push({
                  type: "NS",
                  value: result,
                });
              } else if (type === "PTR") {
                records.push({
                  type: "PTR",
                  value: result,
                });
              }
            });
          }
        } catch {
          // Skip if record type doesn't exist
          continue;
        }
      }
    } catch {
      // Return empty array on major errors
      return [];
    }

    return records;
  };

  return {
    name: "node",
    options,

    // Read operations
    getRecords,
    getRecord: async (
      domain: string,
      options?: { name?: string; type?: string },
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

    // Write operations - not supported
    setRecord: async (
      _domain: string,
      _record: DNSRecordInput,
    ): Promise<DNSRecord> => {
      throw new Error("Node.js DNS driver is read-only: cannot set records");
    },
    setRecords: async (
      _domain: string,
      _records: DNSRecordInput[],
    ): Promise<DNSRecord[]> => {
      throw new Error("Node.js DNS driver is read-only: cannot set records");
    },
    removeRecord: async (
      _domain: string,
      _record: DNSRecord,
    ): Promise<void> => {
      throw new Error("Node.js DNS driver is read-only: cannot remove records");
    },
    removeRecords: async (
      _domain: string,
      _records: DNSRecord[],
    ): Promise<void> => {
      throw new Error("Node.js DNS driver is read-only: cannot remove records");
    },
  };
}

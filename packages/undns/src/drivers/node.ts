import { promises as dnsPromises } from "dns";
import type {
  ResolverOptions,
  NaptrRecord,
  SoaRecord,
  CaaRecord,
  SrvRecord,
  MxRecord,
  TlsaRecord,
} from "node:dns";

import type { Driver, DNSRecord, DriverOptions, RecordOptions, RawDNSResult } from "..";
import { UNDNS_ERROR_CODES, UndnsError, toUndnsError } from "../errors";

export interface NodeDriverOptions extends DriverOptions, ResolverOptions {
  servers?: string[];
}

export default function nodeDriver(options: NodeDriverOptions = {}): Driver {
  const resolver = new dnsPromises.Resolver(options);

  if (options.servers) {
    resolver.setServers(options.servers);
  }

  const buildHostname = (domain: string, subdomain?: string): string => {
    if (!subdomain) return domain;
    return subdomain.includes(".") ? subdomain : `${subdomain}.${domain}`;
  };

  function isNameNotFound(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      (error as NodeJS.ErrnoException).code === "ENOTFOUND"
    );
  }

  const getRecords = async (
    domain: string,
    recordOptions?: RecordOptions,
  ): Promise<DNSRecord[]> => {
    const hostname = buildHostname(domain, recordOptions?.name);
    const records: DNSRecord[] = [];
    const recordTypes = recordOptions?.type
      ? [recordOptions.type.toUpperCase()]
      : ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SOA", "SRV", "CAA", "NAPTR", "TLSA"];

    for (const type of recordTypes) {
      let result: RawDNSResult;
      try {
        result = (await resolver.resolve(hostname, type)) as RawDNSResult;
      } catch (error) {
        if (isNameNotFound(error)) {
          throw toUndnsError(error, `DNS name does not exist: ${hostname}`, {
            code: UNDNS_ERROR_CODES.nameNotFound,
            provider: "node",
            details: { hostname, type },
          });
        }
        // ENODATA means NOERROR with no records for this type; other types may still exist.
        continue;
      }

      if (type === "SOA") {
        const record = result as SoaRecord;
        records.push({ type, ...record });
      } else if (type === "TXT") {
        for (const entries of result as string[][]) {
          records.push({ type, entries });
        }
      } else if (type === "MX") {
        for (const record of result as unknown as MxRecord[]) {
          records.push({ type, priority: record.priority, exchange: record.exchange });
        }
      } else if (type === "SRV") {
        for (const record of result as unknown as SrvRecord[]) {
          records.push({
            type,
            priority: record.priority,
            weight: record.weight,
            port: record.port,
            name: record.name,
          });
        }
      } else if (type === "CAA") {
        for (const record of result as unknown as CaaRecord[]) {
          records.push({ type, ...record });
        }
      } else if (type === "NAPTR") {
        for (const record of result as unknown as NaptrRecord[]) {
          records.push({ type, ...record });
        }
      } else if (type === "TLSA") {
        for (const record of result as unknown as TlsaRecord[]) {
          records.push({ type, ...record });
        }
      } else {
        for (const value of result as string[]) {
          if (type === "A" || type === "AAAA") records.push({ type, address: value, ttl: 0 });
          else records.push({ type: type as "CNAME" | "NS" | "PTR", value });
        }
      }
    }

    return records;
  };

  return {
    name: "node",
    options,
    capabilities: {
      read: true,
      write: false,
      upsert: false,
      batchWrite: false,
      nxdomain: true,
    },

    getRecords,

    async getRecord(domain: string, recordOptions?: RecordOptions): Promise<DNSRecord | null> {
      try {
        return (await getRecords(domain, recordOptions))[0] ?? null;
      } catch (error) {
        if (error instanceof UndnsError && error.code === UNDNS_ERROR_CODES.nameNotFound)
          return null;
        throw error;
      }
    },

    async hasRecord(
      domain: string,
      recordOptions: RecordOptions & { type: string },
    ): Promise<boolean> {
      try {
        return (await getRecords(domain, recordOptions)).length > 0;
      } catch (error) {
        if (error instanceof UndnsError && error.code === UNDNS_ERROR_CODES.nameNotFound)
          return false;
        throw error;
      }
    },
  };
}

import type {
  Driver,
  DNSRecord,
  DNSRecordInput,
  DriverOptions,
  RecordOptions,
} from "../types";

export interface DOHDriverOptions extends DriverOptions {
  endpoint?: string;
  timeout?: number;
}

interface DOHResponse {
  Status: number;
  TC?: boolean;
  RD?: boolean;
  RA?: boolean;
  AD?: boolean;
  CD?: boolean;
  Question?: Array<{
    name: string;
    type: number;
  }>;
  Answer?: Array<{
    name: string;
    type: number;
    TTL: number;
    data: string;
  }>;
}

// Default DOH endpoint
const DEFAULT_ENDPOINT = "https://one.one.one.one/dns-query";

// DNS type mapping: string to number
const DNS_TYPE_NUMBERS: Record<string, number> = {
  A: 1,
  AAAA: 28,
  CNAME: 5,
  MX: 15,
  TXT: 16,
  NS: 2,
  SOA: 6,
  SRV: 33,
  PTR: 12,
  CAA: 257,
};

export default function dohDriver(options: DOHDriverOptions = {}): Driver {
  const { endpoint = DEFAULT_ENDPOINT, timeout = 5000 } = options;

  // Helper to build full hostname from domain and subdomain
  function buildHostname(domain: string, subdomain?: string): string {
    if (!subdomain) return domain;
    return subdomain.includes(".") ? subdomain : `${subdomain}.${domain}`;
  }

  // Get DNS type number from string
  function getDnsTypeNumber(type: string): number {
    return DNS_TYPE_NUMBERS[type.toUpperCase()] || 1;
  }

  // Fetch DOH records from endpoint
  async function fetchDOHRecords(
    hostname: string,
    recordType: string,
  ): Promise<DOHResponse> {
    const url = new URL(endpoint);
    url.searchParams.set("name", hostname);
    url.searchParams.set("type", recordType);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Accept: "application/dns-json",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return (await response.json()) as DOHResponse;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  // Convert DOH data to DNSRecord based on type
  function convertDataToRecord(
    data: string,
    recordType: string,
    ttl: number,
  ): DNSRecord {
    const upperType = recordType.toUpperCase();

    switch (upperType) {
      case "A":
        return {
          type: "A",
          address: data,
          ttl: ttl,
        };

      case "AAAA":
        return {
          type: "AAAA",
          address: data,
          ttl: ttl,
        };

      case "CNAME":
        return {
          type: "CNAME",
          value: data,
        };

      case "NS":
        return {
          type: "NS",
          value: data,
        };

      case "PTR":
        return {
          type: "PTR",
          value: data,
        };

      case "MX": {
        const mxMatch = data.match(/^(\d+)\s+(.+)$/);
        if (mxMatch) {
          return {
            type: "MX",
            priority: parseInt(mxMatch[1]),
            exchange: mxMatch[2],
          };
        }
        throw new Error(`Invalid MX record format: ${data}`);
      }

      case "TXT":
        return {
          type: "TXT",
          entries: [data],
        };

      case "SOA": {
        const parts = data.split(/\s+/);
        if (parts.length >= 7) {
          return {
            type: "SOA",
            nsname: parts[0],
            hostmaster: parts[1],
            serial: parseInt(parts[2]),
            refresh: parseInt(parts[3]),
            retry: parseInt(parts[4]),
            expire: parseInt(parts[5]),
            minttl: parseInt(parts[6]),
          };
        }
        throw new Error(`Invalid SOA record format: ${data}`);
      }

      case "CAA": {
        const caaMatch = data.match(/^(\d+)\s+(\d+)\s+"([^"]*)"$/);
        if (caaMatch) {
          const record = {
            type: "CAA" as const,
            critical: parseInt(caaMatch[1]),
          };
          const tag = caaMatch[2];
          (record as any)[tag.toLowerCase()] = caaMatch[3];
          return record;
        }
        throw new Error(`Invalid CAA record format: ${data}`);
      }

      case "SRV": {
        const srvMatch = data.match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);
        if (srvMatch) {
          return {
            type: "SRV",
            priority: parseInt(srvMatch[1]),
            weight: parseInt(srvMatch[2]),
            port: parseInt(srvMatch[3]),
            name: srvMatch[4],
          };
        }
        throw new Error(`Invalid SRV record format: ${data}`);
      }

      default:
        // For unsupported types, create a basic record structure
        return {
          type: upperType as any,
          data: data,
        } as any;
    }
  }

  // Parse DOH answers to DNSRecord[]
  function parseDOHAnswers(
    answers: Array<{ type: number; data: string; TTL: number }>,
    recordType: string,
  ): DNSRecord[] {
    const typeNum = getDnsTypeNumber(recordType);

    return answers
      .filter((answer) => answer.type === typeNum)
      .map((answer) =>
        convertDataToRecord(answer.data, recordType, answer.TTL),
      );
  }

  // Get records method
  const getRecords = async (
    domain: string,
    options?: RecordOptions,
  ): Promise<DNSRecord[]> => {
    const hostname = buildHostname(domain, options?.name);
    const recordTypes = options?.type
      ? [options.type]
      : ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SOA"];

    const allRecords: DNSRecord[] = [];

    for (const type of recordTypes) {
      try {
        const response = await fetchDOHRecords(hostname, type);

        if (response.Status === 0 && response.Answer) {
          const records = parseDOHAnswers(response.Answer, type);
          allRecords.push(...records);
        }
      } catch {
        // Skip failed record types, continue with others
        continue;
      }
    }

    return allRecords;
  };

  return {
    name: "doh",
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

    // Write operations - not supported by DOH (read-only protocol)
    setRecord: async (
      _domain: string,
      _record: DNSRecordInput,
    ): Promise<DNSRecord> => {
      throw new Error("DOH driver is read-only: cannot set records");
    },

    setRecords: async (
      _domain: string,
      _records: DNSRecordInput[],
    ): Promise<DNSRecord[]> => {
      throw new Error("DOH driver is read-only: cannot set records");
    },

    removeRecord: async (
      _domain: string,
      _record: DNSRecord,
    ): Promise<void> => {
      throw new Error("DOH driver is read-only: cannot remove records");
    },

    removeRecords: async (
      _domain: string,
      _records: DNSRecord[],
    ): Promise<void> => {
      throw new Error("DOH driver is read-only: cannot remove records");
    },

    dispose: async (): Promise<void> => {
      // No cleanup needed for DOH driver
    },
  };
}

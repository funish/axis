import { ofetch } from "ofetch";

import type { Driver, DNSRecord, DriverOptions, RecordOptions, DOHResponse } from "..";
import { UNDNS_ERROR_CODES, UndnsError, toUndnsError } from "../errors";

export interface DOHDriverOptions extends DriverOptions {
  endpoint?: string;
  timeout?: number;
}

export const DEFAULT_DOH_ENDPOINT = "https://one.one.one.one/dns-query";

export const DNS_TYPE_NUMBERS: Record<string, number> = {
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
  NAPTR: 35,
  TLSA: 52,
};

export const DNS_TYPE_STRINGS: Record<number, string> = Object.fromEntries(
  Object.entries(DNS_TYPE_NUMBERS).map(([name, number]) => [number, name]),
);

export function getDnsTypeNumber(type: string): number {
  const number = DNS_TYPE_NUMBERS[type.toUpperCase()];
  if (number === undefined) {
    throw new UndnsError(
      UNDNS_ERROR_CODES.unsupportedRecordType,
      `Unsupported DNS record type: ${type}`,
      { details: { type } },
    );
  }
  return number;
}

export function getDnsTypeString(typeNumber: number): string {
  const type = DNS_TYPE_STRINGS[typeNumber];
  if (!type) {
    throw new UndnsError(
      UNDNS_ERROR_CODES.unsupportedRecordType,
      `Unsupported DNS record type number: ${typeNumber}`,
      { details: { typeNumber } },
    );
  }
  return type;
}

function parseTxt(data: string): string[] {
  const quoted = [...data.matchAll(/"((?:\\.|[^"\\])*)"/g)].map((match) =>
    match[1]!.replace(/\\"/g, '"').replace(/\\\\/g, "\\"),
  );
  return quoted.length > 0 ? quoted : [data];
}

function parseHex(data: string): ArrayBuffer {
  const normalized = data.replace(/[\s-]/g, "");
  if (!/^(?:[0-9a-fA-F]{2})+$/.test(normalized)) {
    throw new UndnsError(
      UNDNS_ERROR_CODES.invalidProviderResponse,
      `Invalid TLSA certificate data: ${data}`,
    );
  }
  const certificate = Uint8Array.from(
    normalized.match(/../g)!.map((byte) => Number.parseInt(byte, 16)),
  );
  const buffer = new ArrayBuffer(certificate.length);
  new Uint8Array(buffer).set(certificate);
  return buffer;
}

function parseNumberParts(data: string, expected: number, typeName: string): string[] {
  const parts = data.trim().split(/\s+/);
  if (parts.length < expected) {
    throw new UndnsError(
      UNDNS_ERROR_CODES.invalidProviderResponse,
      `Invalid ${typeName} record format: ${data}`,
    );
  }
  return parts;
}

/** Parse one DoH JSON answer into the unified record model. */
export function parseDohAnswer(answer: { type: number; TTL?: number; data: string }): DNSRecord {
  const typeName = getDnsTypeString(answer.type);
  const ttl = answer.TTL ?? 0;
  const data = answer.data;

  switch (typeName) {
    case "A":
    case "AAAA":
      return { type: typeName, address: data, ttl };
    case "CNAME":
    case "NS":
    case "PTR":
      return { type: typeName, value: data, ttl };
    case "MX": {
      const [priority = "", ...exchange] = parseNumberParts(data, 2, typeName);
      return { type: typeName, priority: Number(priority), exchange: exchange.join(" "), ttl };
    }
    case "TXT":
      return { type: typeName, entries: parseTxt(data), ttl };
    case "SOA": {
      const parts = parseNumberParts(data, 7, typeName);
      return {
        type: typeName,
        nsname: parts[0]!,
        hostmaster: parts[1]!,
        serial: Number(parts[2]),
        refresh: Number(parts[3]),
        retry: Number(parts[4]),
        expire: Number(parts[5]),
        minttl: Number(parts[6]),
        ttl,
      };
    }
    case "SRV": {
      const parts = parseNumberParts(data, 4, typeName);
      return {
        type: typeName,
        priority: Number(parts[0]),
        weight: Number(parts[1]),
        port: Number(parts[2]),
        name: parts.slice(3).join(" "),
        ttl,
      };
    }
    case "CAA": {
      const parts = parseNumberParts(data, 3, typeName);
      const critical = Number(parts[0]);
      const tag = parts[1]!;
      const value = parts.slice(2).join(" ").replace(/^"|"$/g, "");
      if (!["issue", "issuewild", "iodef"].includes(tag)) {
        throw new UndnsError(
          UNDNS_ERROR_CODES.invalidProviderResponse,
          `Unsupported CAA tag: ${tag}`,
          { details: { tag } },
        );
      }
      return { type: typeName, critical, [tag]: value, ttl };
    }
    case "NAPTR": {
      const match = data.match(
        /^(\d+)\s+(\d+)\s+"([^"]*)"\s+"([^"]*)"\s+"((?:[^"\\]|\\.)*)"\s+(\S+)$/,
      );
      if (!match) {
        throw new UndnsError(
          UNDNS_ERROR_CODES.invalidProviderResponse,
          `Invalid NAPTR record format: ${data}`,
        );
      }
      return {
        type: typeName,
        order: Number(match[1]),
        preference: Number(match[2]),
        flags: match[3]!,
        service: match[4]!,
        regexp: match[5]!,
        replacement: match[6]!,
        ttl,
      };
    }
    case "TLSA": {
      const parts = parseNumberParts(data, 4, typeName);
      return {
        type: typeName,
        certUsage: Number(parts[0]),
        selector: Number(parts[1]),
        match: Number(parts[2]),
        data: parseHex(parts.slice(3).join(" ")),
        ttl,
      };
    }
    default:
      return { type: typeName, data } as unknown as DNSRecord;
  }
}

/** Parse a DoH JSON payload and preserve NXDOMAIN separately from NOERROR-empty. */
export function parseDohResponse(response: DOHResponse, requestedType: string): DNSRecord[] {
  if (
    typeof response !== "object" ||
    response === null ||
    !Number.isFinite(Number(response.Status))
  ) {
    throw new UndnsError(
      UNDNS_ERROR_CODES.invalidProviderResponse,
      "DoH response is missing a valid DNS status",
    );
  }

  const status = Number(response.Status);
  if (status === 3) {
    throw new UndnsError(UNDNS_ERROR_CODES.nameNotFound, "DNS name does not exist", {
      status,
      details: { requestedType },
    });
  }
  if (status !== 0) {
    throw new UndnsError(
      UNDNS_ERROR_CODES.providerError,
      response.Error || `DNS query failed with status ${status}`,
      {
        status,
        providerMessage: response.Error,
        details: { requestedType },
      },
    );
  }
  if (response.Error) {
    throw new UndnsError(UNDNS_ERROR_CODES.providerError, response.Error, {
      status,
      details: { requestedType },
    });
  }

  const answers = response.Answer ?? [];
  if (!Array.isArray(answers)) {
    throw new UndnsError(
      UNDNS_ERROR_CODES.invalidProviderResponse,
      "DoH Answer section is not an array",
    );
  }

  const records = answers.map(parseDohAnswer);
  getDnsTypeNumber(requestedType);
  return records.filter((record) => record.type === requestedType || record.type === "CNAME");
}

async function fetchDohResponse(
  endpoint: string,
  hostname: string,
  type: string,
  timeout: number,
): Promise<DOHResponse> {
  const url = new URL(endpoint);
  url.searchParams.set("name", hostname);
  url.searchParams.set("type", type);

  try {
    return await ofetch<DOHResponse>(url.toString(), {
      method: "GET",
      headers: { Accept: "application/dns-json" },
      timeout,
    });
  } catch (error) {
    throw toUndnsError(error, `DoH query failed for ${hostname} ${type}`, {
      provider: "doh",
      details: { hostname, type },
    });
  }
}

export default function dohDriver(options: DOHDriverOptions = {}): Driver {
  const { endpoint = DEFAULT_DOH_ENDPOINT, timeout = 5000 } = options;

  function buildHostname(domain: string, subdomain?: string): string {
    if (!subdomain) return domain;
    return subdomain.includes(".") ? subdomain : `${subdomain}.${domain}`;
  }

  async function query(hostname: string, type: string): Promise<DNSRecord[]> {
    const normalizedType = type.toUpperCase();
    getDnsTypeNumber(normalizedType);
    const response = await fetchDohResponse(endpoint, hostname, normalizedType, timeout);
    return parseDohResponse(response, normalizedType);
  }

  const getRecords = async (
    domain: string,
    recordOptions?: RecordOptions,
  ): Promise<DNSRecord[]> => {
    const hostname = buildHostname(domain, recordOptions?.name);
    if (recordOptions?.type) return query(hostname, recordOptions.type);

    const recordTypes = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SOA"];
    const settled = await Promise.allSettled(recordTypes.map((type) => query(hostname, type)));
    const fulfilled = settled.flatMap((result) =>
      result.status === "fulfilled" ? result.value : [],
    );

    if (fulfilled.length > 0) return fulfilled;

    const failures = settled.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    );
    if (failures.length === 0) return [];

    const nonNxdomain = failures.find(
      (error) => !(error instanceof UndnsError) || error.code !== UNDNS_ERROR_CODES.nameNotFound,
    );
    throw toUndnsError(nonNxdomain ?? failures[0], `DoH query failed for ${hostname}`);
  };

  return {
    name: "doh",
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

    dispose: async (): Promise<void> => {
      // DoH requests do not keep a reusable undns-owned handle open.
    },
  };
}

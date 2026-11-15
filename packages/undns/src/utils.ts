import type { AnyRecord } from "node:dns";

import type { DNSRecord } from "./types";

// Type guard functions for DNS records
// These functions help TypeScript narrow down the union types for safer type access

export function isARecord(record: DNSRecord): record is Extract<AnyRecord, { type: "A" }> {
  return record.type === "A";
}

export function isAaaaRecord(record: DNSRecord): record is Extract<AnyRecord, { type: "AAAA" }> {
  return record.type === "AAAA";
}

export function isMxRecord(record: DNSRecord): record is Extract<AnyRecord, { type: "MX" }> {
  return record.type === "MX";
}

export function isTxtRecord(record: DNSRecord): record is Extract<AnyRecord, { type: "TXT" }> {
  return record.type === "TXT";
}

export function isNsRecord(record: DNSRecord): record is Extract<AnyRecord, { type: "NS" }> {
  return record.type === "NS";
}

export function isCnameRecord(record: DNSRecord): record is Extract<AnyRecord, { type: "CNAME" }> {
  return record.type === "CNAME";
}

export function isSoaRecord(record: DNSRecord): record is Extract<AnyRecord, { type: "SOA" }> {
  return record.type === "SOA";
}

export function isSrvRecord(record: DNSRecord): record is Extract<AnyRecord, { type: "SRV" }> {
  return record.type === "SRV";
}

export function isCaaRecord(record: DNSRecord): record is Extract<AnyRecord, { type: "CAA" }> {
  return record.type === "CAA";
}

export function isPtrRecord(record: DNSRecord): record is Extract<AnyRecord, { type: "PTR" }> {
  return record.type === "PTR";
}

export function isNaptrRecord(record: DNSRecord): record is Extract<AnyRecord, { type: "NAPTR" }> {
  return record.type === "NAPTR";
}

export function isTlsaRecord(record: DNSRecord): record is Extract<AnyRecord, { type: "TLSA" }> {
  return record.type === "TLSA";
}

// Helper function to format record display
export function formatRecord(record: DNSRecord): string {
  switch (record.type) {
    case "A":
      if (isARecord(record)) {
        return `${record.address}${record.id ? ` [ID: ${record.id}]` : ""}`;
      }
      break;
    case "AAAA":
      if (isAaaaRecord(record)) {
        return `${record.address}${record.id ? ` [ID: ${record.id}]` : ""}`;
      }
      break;
    case "MX":
      if (isMxRecord(record)) {
        return `${record.priority} ${record.exchange}${record.id ? ` [ID: ${record.id}]` : ""}`;
      }
      break;
    case "TXT":
      if (isTxtRecord(record)) {
        return `${record.entries?.join("") || ""}${record.id ? ` [ID: ${record.id}]` : ""}`;
      }
      break;
    case "NS":
      if (isNsRecord(record)) {
        return `${record.value}${record.id ? ` [ID: ${record.id}]` : ""}`;
      }
      break;
    case "CNAME":
      if (isCnameRecord(record)) {
        return `${record.value}${record.id ? ` [ID: ${record.id}]` : ""}`;
      }
      break;
    case "SOA":
      if (isSoaRecord(record)) {
        return `${record.nsname} ${record.hostmaster} (serial: ${record.serial})${record.id ? ` [ID: ${record.id}]` : ""}`;
      }
      break;
    case "SRV":
      if (isSrvRecord(record)) {
        return `${record.priority} ${record.weight} ${record.port} ${record.name}${record.id ? ` [ID: ${record.id}]` : ""}`;
      }
      break;
    case "CAA":
      if (isCaaRecord(record)) {
        return `${record.critical ? "[critical] " : ""}${record.issue || record.iodef}${record.id ? ` [ID: ${record.id}]` : ""}`;
      }
      break;
    case "PTR":
      if (isPtrRecord(record)) {
        return `${record.value}${record.id ? ` [ID: ${record.id}]` : ""}`;
      }
      break;
    case "NAPTR":
      if (isNaptrRecord(record)) {
        return `${record.order} ${record.preference} "${record.flags}" "${record.service}" "${record.regexp}" ${record.replacement}${record.id ? ` [ID: ${record.id}]` : ""}`;
      }
      break;
    case "TLSA":
      if (isTlsaRecord(record)) {
        return `${record.certUsage} ${record.selector} ${record.match} ${Buffer.from(record.data).toString("hex")}${record.id ? ` [ID: ${record.id}]` : ""}`;
      }
      break;
    default:
      return JSON.stringify(record);
  }
  return JSON.stringify(record);
}

// Helper function to group records by type
export function groupRecordsByType(records: DNSRecord[]): Record<string, DNSRecord[]> {
  const groups: Record<string, DNSRecord[]> = {};

  records.forEach((record) => {
    if (!groups[record.type]) {
      groups[record.type] = [];
    }
    groups[record.type].push(record);
  });

  return groups;
}

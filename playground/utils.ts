import {
  AnyARecord,
  AnyAaaaRecord,
  AnyCaaRecord,
  AnyCnameRecord,
  AnyMxRecord,
  AnyNaptrRecord,
  AnyNsRecord,
  AnyPtrRecord,
  AnySoaRecord,
  AnySrvRecord,
  AnyTlsaRecord,
  AnyTxtRecord,
} from "node:dns";
import type { DNSRecord } from "../packages/undns/src/types";

// Type guard functions for DNS records
// These functions help TypeScript narrow down the union types for safer type access

function isARecord(record: DNSRecord): record is AnyARecord {
  return record.type === "A";
}

function isAaaaRecord(record: DNSRecord): record is AnyAaaaRecord {
  return record.type === "AAAA";
}

function isMxRecord(record: DNSRecord): record is AnyMxRecord {
  return record.type === "MX";
}

function isTxtRecord(record: DNSRecord): record is AnyTxtRecord {
  return record.type === "TXT";
}

function isNsRecord(record: DNSRecord): record is AnyNsRecord {
  return record.type === "NS";
}

function isCnameRecord(record: DNSRecord): record is AnyCnameRecord {
  return record.type === "CNAME";
}

function isSoaRecord(record: DNSRecord): record is AnySoaRecord {
  return record.type === "SOA";
}

function isSrvRecord(record: DNSRecord): record is AnySrvRecord {
  return record.type === "SRV";
}

function isCaaRecord(record: DNSRecord): record is AnyCaaRecord {
  return record.type === "CAA";
}

function isPtrRecord(record: DNSRecord): record is AnyPtrRecord {
  return record.type === "PTR";
}

function isNaptrRecord(record: DNSRecord): record is AnyNaptrRecord {
  return record.type === "NAPTR";
}

function isTlsaRecord(record: DNSRecord): record is AnyTlsaRecord {
  return record.type === "TLSA";
}

// Helper function to format record display
function formatRecord(record: DNSRecord): string {
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
function groupRecordsByType(records: DNSRecord[]): Record<string, DNSRecord[]> {
  const groups: Record<string, DNSRecord[]> = {};

  records.forEach((record) => {
    if (!groups[record.type]) {
      groups[record.type] = [];
    }
    groups[record.type].push(record);
  });

  return groups;
}

export {
  // Type guard functions
  isARecord,
  isAaaaRecord,
  isMxRecord,
  isTxtRecord,
  isNsRecord,
  isCnameRecord,
  isSoaRecord,
  isSrvRecord,
  isCaaRecord,
  isPtrRecord,
  isNaptrRecord,
  isTlsaRecord,

  // Utility functions
  formatRecord,
  groupRecordsByType,
};

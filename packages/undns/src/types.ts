import type { AnyRecord } from "node:dns";

// Unified DNS record type using Node.js standard types
export type DNSRecord = AnyRecord & { id?: string };

// Helper types for raw DNS resolution results
export type RawDNSResult =
  | string[] // A, AAAA, CNAME, NS, PTR records
  | string[][] // TXT records
  | AnyRecord; // SOA and other complex records (includes CaaRecord, MxRecord, etc.)

// DNS record input type (for create/update operations)
export interface DNSRecordInput {
  name: string;
  type: string;
  // Provider-specific fields based on record type
  // e.g., for A record: { address: "192.168.1.1" }
  // e.g., for MX record: { exchange: "mail.example.com", priority: 10 }
  // e.g., for TXT record: { entries: ["v=spf1 -all"] }
  [key: string]: any;
}

// DNS value type
export type DNSValue = DNSRecord | null;

// Driver options
export interface DriverOptions {
  [key: string]: any;
}

// Utility types
export type MaybePromise<T> = T | Promise<T>;

// Record query options
export interface RecordOptions {
  // Subdomain (e.g., "www" for "www.google.com" when domain is "google.com")
  name?: string;
  // Record type filter
  type?: string;
}

// Driver interface
export interface Driver<OptionsT = DriverOptions> {
  name?: string;
  options?: OptionsT;

  // Read operations
  getRecord?: (
    domain: string,
    options?: RecordOptions,
  ) => MaybePromise<DNSRecord | null>;
  getRecords?: (
    domain: string,
    options?: RecordOptions,
  ) => MaybePromise<DNSRecord[]>;
  hasRecord?: (
    domain: string,
    options: RecordOptions & { type: string }, // type is required for hasRecord
  ) => MaybePromise<boolean>;

  // Write operations
  setRecord?: (
    domain: string,
    record: DNSRecordInput,
  ) => MaybePromise<DNSRecord>;
  setRecords?: (
    domain: string,
    records: DNSRecordInput[],
  ) => MaybePromise<DNSRecord[]>;
  removeRecord?: (domain: string, record: DNSRecord) => MaybePromise<void>;
  removeRecords?: (domain: string, records: DNSRecord[]) => MaybePromise<void>;

  // Lifecycle
  dispose?: () => MaybePromise<void>;
}

// DNS Manager configuration
export interface DNSManagerOptions {
  driver: Driver;
}

/**
 * DNS over HTTPS (DoH) Server
 * RFC 8484 compliant DoH server implementation using h3 and undns
 * @see https://www.rfc-editor.org/rfc/rfc8484
 */

import {
  defineHandler,
  EventHandlerRequest,
  EventHandlerWithFetch,
  H3,
  H3Event,
  serve,
} from "h3";
import { HTTPError } from "h3";
import type { Driver, DNSRecord, DOHResponse } from "..";
import { createDNSManager } from "..";
import { ipv4ToBuffer, ipv6ToBuffer } from "ipdo";

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
  ANY: 255,
};

// Reverse mapping: number to string
const DNS_TYPE_STRINGS: Record<number, string> = {};
Object.entries(DNS_TYPE_NUMBERS).forEach(([key, value]) => {
  DNS_TYPE_STRINGS[value] = key;
});

// Helper to get DNS type string from number
function getDnsTypeString(typeNumber: number): string {
  return DNS_TYPE_STRINGS[typeNumber] || "A";
}

export interface DohServerRequest {
  /**
   * DNS query name (domain)
   */
  name: string;

  /**
   * DNS record type
   */
  type: string;
}

export interface DohServerOptions {
  /**
   * DNS driver to use for queries (from undns)
   */
  driver?: Driver;

  /**
   * Authorization function for requests
   */
  authorize?: (request: DohServerRequest) => void | Promise<void>;
}

/**
 * Create a DNS over HTTPS (DoH) handler
 *
 * Supports Google/Cloudflare JSON API format:
 * - GET requests with query parameters: name, type, do, cd
 * - Accept: application/dns-json
 *
 * @param options DoH server configuration options
 * @returns A h3 event handler
 */
export function createDohHandler(
  opts: DohServerOptions = {},
): EventHandlerWithFetch<
  EventHandlerRequest,
  Promise<DOHResponse | string | ArrayBuffer>
> {
  const dnsManager = createDNSManager({
    driver: opts.driver || { name: "default" },
  });

  const handler = defineHandler(async (event) => {
    // Check if this is a DoH endpoint
    const url = new URL(event.req.url || "");
    const pathname = url.pathname;

    // DoH requests should be on /dns-query path
    if (pathname !== "/dns-query") {
      throw new HTTPError({
        statusCode: 404,
        statusMessage: `Not Found: DoH endpoint is /dns-query, got ${pathname}`,
      });
    }

    // Detect request format
    const requestFormat = detectRequestFormat(event);
    let name = "";
    let type = "";
    let doFlag = false;
    let cdFlag = false;

    // Handle different request formats
    if (requestFormat === "wire") {
      // Handle wireformat request
      if (event.req.method === "GET") {
        const url = new URL(event.req.url || "");
        const dnsParam = url.searchParams.get("dns");
        if (!dnsParam) {
          throw new HTTPError({
            statusCode: 400,
            statusMessage: "Missing 'dns' parameter for wireformat request",
          });
        }

        try {
          // Base64URL decode
          const base64 = dnsParam.replace(/-/g, "+").replace(/_/g, "/");
          const decodedData = Uint8Array.from(atob(base64), (c) =>
            c.charCodeAt(0),
          );
          const query = parseDNSWireFormat(decodedData.buffer);
          if (!query) {
            throw new HTTPError({
              statusCode: 400,
              statusMessage: "Invalid DNS wireformat message",
            });
          }
          name = query.name.replace(/\.$/, ""); // Remove trailing dot
          type = getDnsTypeString(query.type);
          cdFlag = query.cdFlag; // Use parsed CD flag
        } catch {
          throw new HTTPError({
            statusCode: 400,
            statusMessage: "Failed to decode DNS wireformat message",
          });
        }
      } else if (event.req.method === "POST") {
        // Check Content-Type for POST requests
        const contentType = event.req.headers.get("content-type") || "";
        if (!contentType.includes("application/dns-message")) {
          throw new HTTPError({
            statusCode: 415,
            statusMessage:
              "Unsupported Media Type: content-type must be 'application/dns-message'",
          });
        }

        const body = await event.req.arrayBuffer();
        const query = parseDNSWireFormat(body);
        if (!query) {
          throw new HTTPError({
            statusCode: 400,
            statusMessage: "Invalid DNS wireformat message",
          });
        }
        name = query.name.replace(/\.$/, "");
        type = getDnsTypeString(query.type);
        cdFlag = query.cdFlag; // Use parsed CD flag
      }
    } else {
      // Handle JSON request
      const url = new URL(event.req.url || "");
      const query = Object.fromEntries(url.searchParams.entries());

      name = query.name || "";
      type = (query.type || "A").toUpperCase();

      // Validate cd parameter
      if (query.cd && !["0", "false", "1", "true"].includes(query.cd)) {
        const errorResponse = {
          error: `Invalid CD flag \`${query.cd}\`. Expected to be empty or one of \`0\`, \`false\`, \`1\`, or \`true\`.`,
        };
        return JSON.stringify(errorResponse);
      }

      // Validate do parameter
      if (query.do && !["0", "false", "1", "true"].includes(query.do)) {
        const errorResponse = {
          error: `Invalid DO flag \`${query.do}\`. Expected to be empty or one of \`0\`, \`false\`, \`1\`, or \`true\`.`,
        };
        return JSON.stringify(errorResponse);
      }

      doFlag = query.do === "1" || query.do === "true";
      cdFlag = query.cd === "1" || query.cd === "true";

      if (!name) {
        const errorResponse = { error: "Missing required parameter: name" };
        return JSON.stringify(errorResponse);
      }
    }

    // For wireformat, type should already be converted to string by this point
    // For JSON, type comes as string
    if (!DNS_TYPE_NUMBERS.hasOwnProperty(type)) {
      if (requestFormat === "json") {
        const errorResponse = {
          error: `Invalid type \`${type}\`. DNS record type not found.`,
        };
        return JSON.stringify(errorResponse);
      }
      // For wireformat, this means type conversion failed
      throw new HTTPError({
        statusCode: 400,
        statusMessage: `Invalid DNS record type: ${type}`,
      });
    }

    // Authorize request
    await opts.authorize?.({ name, type });

    // Set headers based on format
    if (requestFormat === "wire") {
      event.res.headers.set("Content-Type", "application/dns-message");
    } else {
      event.res.headers.set("Content-Type", "application/dns-json");
    }
    event.res.headers.set("Access-Control-Allow-Origin", "*");

    // Perform DNS query
    const records = await dnsManager.getRecords(name, { type });

    // Build DoH response
    const response: DOHResponse = {
      Status: 0, // NOERROR
      TC: false,
      RD: true,
      RA: true,
      AD: doFlag, // Set AD flag based on do parameter
      CD: cdFlag,
      Question: [
        {
          name: name.endsWith(".") ? name : `${name}.`,
          type: DNS_TYPE_NUMBERS[type],
        },
      ],
      Answer: records.map((record) => convertDNSRecordToDoHAnswer(record)),
    };

    // Return response in appropriate format
    if (requestFormat === "wire") {
      // For wireformat, return binary data
      return convertToWireFormat(response);
    } else {
      // For JSON, return JSON string
      return JSON.stringify(response, null, 2);
    }
  });

  return handler;
}

/**
 * Create a complete DoH server
 */
export function createDohServer(opts: DohServerOptions = {}): {
  handler: EventHandlerWithFetch<
    EventHandlerRequest,
    Promise<DOHResponse | string | ArrayBuffer>
  >;
  serve: (port?: number) => void;
} {
  const handler = createDohHandler(opts);
  const app = new H3().use("/**", handler);

  return {
    handler,
    serve: (port = 8080) => serve(app, { port }),
  };
}

/**
 * Parse DNS wireformat message to extract query info
 */
function parseDNSWireFormat(
  buffer: ArrayBuffer,
): { name: string; type: number; cdFlag: boolean } | null {
  try {
    const view = new DataView(buffer);

    // Skip header (12 bytes)
    const qdcount = view.getUint16(4, false); // Query count

    if (qdcount === 0) return null;

    // Parse DNS flags to get CD bit
    const flags = view.getUint16(2, false);
    const cdFlag = (flags & 0x0010) !== 0; // CD (Checking Disabled) flag

    let offset = 12;

    // Parse QNAME
    const labels: string[] = [];
    while (true) {
      const length = view.getUint8(offset);
      if (length === 0) break;
      if (length > 63) return null; // Invalid label length

      const label = new TextDecoder().decode(
        buffer.slice(offset + 1, offset + 1 + length),
      );
      labels.push(label);
      offset += 1 + length;
    }

    const name = labels.join(".") + ".";
    offset += 1; // Skip null byte

    // Parse QTYPE
    const type = view.getUint16(offset, false);

    return { name, type, cdFlag };
  } catch {
    return null;
  }
}

/**
 * Convert DoH JSON response to DNS wireformat
 */
function convertToWireFormat(response: DOHResponse): ArrayBuffer {
  const sections: Uint8Array[] = [];

  // 1. DNS Header (12 bytes)
  const header = new Uint8Array(12);
  const headerView = new DataView(header.buffer);

  // Transaction ID (2 bytes) - using 0x0000
  headerView.setUint16(0, 0x0000, false);

  // Flags (2 bytes)
  let flags = 0x8180; // QR=1, RD=1, RA=1
  if (response.TC) flags |= 0x0200;
  if (response.AD) flags |= 0x0400;
  if (response.CD) flags |= 0x0010;
  if (response.Status) flags |= response.Status & 0x000f;
  headerView.setUint16(2, flags, false);

  // Record counts
  headerView.setUint16(4, response.Question?.length || 0, false);
  headerView.setUint16(6, response.Answer?.length || 0, false);
  headerView.setUint16(8, response.Authority?.length || 0, false);
  headerView.setUint16(10, response.Additional?.length || 0, false);
  sections.push(header);

  // 2. Question section
  if (response.Question) {
    for (const question of response.Question) {
      sections.push(encodeQuestion(question));
    }
  }

  // 3. Answer section
  if (response.Answer) {
    for (const answer of response.Answer) {
      sections.push(encodeResourceRecord(answer));
    }
  }

  // 4. Authority section
  if (response.Authority) {
    for (const authority of response.Authority) {
      sections.push(encodeResourceRecord(authority));
    }
  }

  // 5. Additional section
  if (response.Additional) {
    for (const additional of response.Additional) {
      sections.push(encodeResourceRecord(additional));
    }
  }

  // Combine all sections
  const totalSize = sections.reduce((sum, section) => sum + section.length, 0);
  const buffer = new ArrayBuffer(totalSize);
  const view = new Uint8Array(buffer);
  let offset = 0;

  for (const section of sections) {
    view.set(section, offset);
    offset += section.length;
  }

  return buffer;
}

/**
 * Encode DNS question section
 */
function encodeQuestion(question: { name: string; type: number }): Uint8Array {
  const sections: Uint8Array[] = [];

  // QNAME (compressed format)
  sections.push(encodeDomainName(question.name));

  // QTYPE (2 bytes)
  const qtype = new Uint8Array(2);
  const qtypeView = new DataView(qtype.buffer);
  qtypeView.setUint16(0, question.type, false);
  sections.push(qtype);

  // QCLASS (2 bytes) - always IN (1)
  const qclass = new Uint8Array(2);
  const qclassView = new DataView(qclass.buffer);
  qclassView.setUint16(0, 1, false);
  sections.push(qclass);

  return combineArrays(sections);
}

/**
 * Encode DNS resource record
 */
function encodeResourceRecord(record: {
  name: string;
  type: number;
  TTL: number;
  data: string;
}): Uint8Array {
  const sections: Uint8Array[] = [];

  // NAME (compressed format)
  sections.push(encodeDomainName(record.name));

  // TYPE (2 bytes)
  const type = new Uint8Array(2);
  const typeView = new DataView(type.buffer);
  typeView.setUint16(0, record.type, false);
  sections.push(type);

  // CLASS (2 bytes) - always IN (1)
  const rclass = new Uint8Array(2);
  const rclassView = new DataView(rclass.buffer);
  rclassView.setUint16(0, 1, false);
  sections.push(rclass);

  // TTL (4 bytes)
  const ttl = new Uint8Array(4);
  const ttlView = new DataView(ttl.buffer);
  ttlView.setUint32(0, record.TTL, false);
  sections.push(ttl);

  // RDATA (variable length)
  const rdLength = new Uint8Array(2);
  const rdLengthView = new DataView(rdLength.buffer);

  const rdData = encodeRData(record.type, record.data);
  rdLengthView.setUint16(0, rdData.length, false);

  sections.push(rdLength);
  sections.push(rdData);

  return combineArrays(sections);
}

/**
 * Encode domain name without compression (simplified)
 */
function encodeDomainName(name: string): Uint8Array {
  const labels = name.split(".").filter((label) => label.length > 0);
  const sections: Uint8Array[] = [];

  for (const label of labels) {
    const labelBytes = new TextEncoder().encode(label);
    sections.push(new Uint8Array([labelBytes.length])); // Length byte
    sections.push(labelBytes); // Label content
  }

  // End with null byte for root
  sections.push(new Uint8Array([0]));

  return combineArrays(sections);
}

/**
 * Encode RDATA based on record type
 */
function encodeRData(type: number, data: string): Uint8Array {
  switch (type) {
    case 1: {
      // A record - 4 bytes IPv4
      try {
        const buffer = ipv4ToBuffer(data);
        return new Uint8Array(buffer);
      } catch (error) {
        // Invalid IPv4 address, return zeros
        console.error(`Invalid IPv4 address: ${data}`, error);
        return new Uint8Array(4);
      }
    }

    case 28: {
      // AAAA record - 16 bytes IPv6
      try {
        const buffer = ipv6ToBuffer(data);
        return new Uint8Array(buffer);
      } catch (error) {
        // Invalid IPv6 address, return zeros
        console.error(`Invalid IPv6 address: ${data}`, error);
        return new Uint8Array(16);
      }
    }

    case 5: // CNAME
    case 2: // NS
    case 12: // PTR
      return encodeDomainName(data);

    case 15: {
      // MX record
      const match = data.match(/^(\d+)\s+(.+)$/);
      if (match) {
        const exchangeName = encodeDomainName(match[2]);
        const mxData = new Uint8Array(2 + exchangeName.length);
        const mxView = new DataView(mxData.buffer);
        mxView.setUint16(0, parseInt(match[1]), false);
        mxData.set(exchangeName, 2);
        return mxData;
      }
      break;
    }

    case 16: {
      // TXT record
      // TXT records: each entry prefixed with length byte
      const sections: Uint8Array[] = [];
      if (data) {
        const textBytes = new TextEncoder().encode(data);
        sections.push(new Uint8Array([textBytes.length]));
        sections.push(textBytes);
      }
      return combineArrays(sections);
    }

    case 33: {
      // SRV record
      const srvMatch = data.match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);
      if (srvMatch) {
        const targetName = encodeDomainName(srvMatch[4]);
        const srvData = new Uint8Array(6 + targetName.length);
        const srvView = new DataView(srvData.buffer);
        srvView.setUint16(0, parseInt(srvMatch[1]), false);
        srvView.setUint16(2, parseInt(srvMatch[2]), false);
        srvView.setUint16(4, parseInt(srvMatch[3]), false);
        srvData.set(targetName, 6);
        return srvData;
      }
      break;
    }

    default:
      // For unknown types, encode as raw text
      return new TextEncoder().encode(data);
  }

  return new Uint8Array(0);
}

/**
 * Combine multiple Uint8Arrays
 */
function combineArrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }

  return result;
}

/**
 * Detect request format based on Accept header and URL parameters
 */
function detectRequestFormat(
  event: H3Event<EventHandlerRequest>,
): "json" | "wire" {
  const url = new URL(event.req.url || "");
  const hasDnsParam = url.searchParams.has("dns");

  // If URL has 'dns' parameter, treat as wireformat regardless of Accept header
  if (hasDnsParam) {
    return "wire";
  }

  const accept = event.req.headers.get("accept") || "";
  if (accept.includes("application/dns-json")) {
    return "json";
  }
  if (accept.includes("application/dns-message")) {
    return "wire";
  }
  // Default to JSON for backward compatibility
  return "json";
}

/**
 * Convert DNS record to DoH answer format
 */
function convertDNSRecordToDoHAnswer(record: DNSRecord): {
  name: string;
  type: number;
  TTL: number;
  data: string;
} {
  const type = DNS_TYPE_NUMBERS[record.type] || 1;

  // Helper function to safely extract TTL from record
  function getTTLFromRecord(rec: DNSRecord): number {
    // Check if record has ttl property (A, AAAA, SOA, etc.)
    if ("ttl" in rec && typeof rec.ttl === "number") {
      return rec.ttl;
    }
    // CAA records and others don't have ttl, use default
    return 300;
  }

  const answer: { name: string; type: number; TTL: number; data: string } = {
    name: "",
    type,
    TTL: getTTLFromRecord(record),
    data: "",
  };

  const typedRecord = record as DNSRecord;

  switch (record.type) {
    case "A":
    case "AAAA":
      if (typedRecord.type === "A" || typedRecord.type === "AAAA") {
        answer.data = typedRecord.address;
      }
      break;
    case "CNAME":
    case "NS":
    case "PTR":
      if (
        typedRecord.type === "CNAME" ||
        typedRecord.type === "NS" ||
        typedRecord.type === "PTR"
      ) {
        answer.data = typedRecord.value;
      }
      break;
    case "MX":
      if (typedRecord.type === "MX") {
        answer.data = `${typedRecord.priority} ${typedRecord.exchange}`;
      }
      break;
    case "TXT":
      if (typedRecord.type === "TXT") {
        const entries = typedRecord.entries || [];
        answer.data = entries.length > 0 ? entries.join("") : "";
      }
      break;
    case "SRV":
      if (typedRecord.type === "SRV") {
        answer.data = `${typedRecord.priority} ${typedRecord.weight} ${typedRecord.port} ${typedRecord.name}`;
      }
      break;
    case "SOA":
      if (typedRecord.type === "SOA") {
        answer.data = `${typedRecord.nsname} ${typedRecord.hostmaster} ${typedRecord.serial} ${typedRecord.refresh} ${typedRecord.retry} ${typedRecord.expire} ${typedRecord.minttl}`;
      }
      break;
    case "CAA":
      if (typedRecord.type === "CAA") {
        const critical = typedRecord.critical || 0;
        const tag = typedRecord.issue
          ? "issue"
          : typedRecord.iodef
            ? "iodef"
            : "unknown";
        const value = typedRecord.issue || typedRecord.iodef || "";
        answer.data = `${critical} ${tag} "${value}"`;
      }
      break;
    default:
      // For unknown record types, try to serialize the record
      answer.data = JSON.stringify(typedRecord);
  }

  return answer;
}

/**
 * DNS over HTTPS (DoH) server implementing the RFC 8484 wireformat plus the
 * widely deployed Google/Cloudflare JSON representation.
 */

import {
  defineHandler,
  HTTPError,
  H3,
  serve,
  type EventHandlerRequest,
  type EventHandlerWithFetch,
  type H3Event,
} from "h3";
import { ipv4ToBuffer, ipv6ToBuffer } from "ipdo";

import type { Driver, DNSRecord, DOHResponse } from "..";
import { createDNSManager } from "..";
import { UNDNS_ERROR_CODES, UndnsError } from "../errors";

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
  NAPTR: 35,
  TLSA: 52,
};

const DNS_TYPE_STRINGS: Record<number, string> = Object.fromEntries(
  Object.entries(DNS_TYPE_NUMBERS).map(([name, number]) => [number, name]),
);

export const MAX_DNS_WIRE_MESSAGE_BYTES = 65_535;

/**
 * Buffer a wireformat request while rejecting oversized bodies as data arrives.
 */
async function readWireRequestBody(request: Request): Promise<ArrayBuffer> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_DNS_WIRE_MESSAGE_BYTES) {
    throw new HTTPError({ statusCode: 413, statusMessage: "DNS message too large" });
  }

  const reader = request.body?.getReader();
  if (!reader) {
    return new ArrayBuffer(0);
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_DNS_WIRE_MESSAGE_BYTES) {
      await reader.cancel();
      throw new HTTPError({ statusCode: 413, statusMessage: "DNS message too large" });
    }
    chunks.push(value);
  }

  const message = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    message.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return message.buffer.slice(message.byteOffset, message.byteOffset + message.byteLength);
}
export const DNS_RCODE = {
  FORMERR: 1,
  SERVFAIL: 2,
  NXDOMAIN: 3,
  NOTIMP: 4,
} as const;

export interface DohServerRequest {
  name: string;
  type: string;
}

export interface DohServerOptions {
  /** A read-capable driver is required; there is no silent empty-data default. */
  driver: Driver;
  authorize?: (request: DohServerRequest) => void | Promise<void>;
}

export interface DohWireQuery {
  transactionId: number;
  name: string;
  type: number;
  recursionDesired: boolean;
  checkingDisabled: boolean;
  dnssecOk: boolean;
}

export function getDnsTypeString(typeNumber: number): string {
  const type = DNS_TYPE_STRINGS[typeNumber];
  if (!type) {
    throw new UndnsError(
      UNDNS_ERROR_CODES.unsupportedRecordType,
      `Unsupported DNS record type: ${typeNumber}`,
      { details: { typeNumber } },
    );
  }
  return type;
}

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

export function parseDnsWireQuery(buffer: ArrayBufferLike): DohWireQuery {
  if (buffer.byteLength < 12) {
    throw new UndnsError(
      UNDNS_ERROR_CODES.invalidDnsMessage,
      "DNS message is shorter than its header",
    );
  }
  if (buffer.byteLength > 65535) {
    throw new UndnsError(UNDNS_ERROR_CODES.invalidDnsMessage, "DNS message is too large");
  }

  const view = new DataView(buffer);
  const transactionId = view.getUint16(0, false);
  const flags = view.getUint16(2, false);
  const isResponse = (flags & 0x8000) !== 0;
  const operationCode = (flags >> 11) & 0x0f;
  const recursionDesired = (flags & 0x0100) !== 0;
  const checkingDisabled = (flags & 0x0010) !== 0;
  const questionCount = view.getUint16(4, false);
  const answerCount = view.getUint16(6, false);
  const authorityCount = view.getUint16(8, false);
  const additionalCount = view.getUint16(10, false);

  if (isResponse || operationCode !== 0 || questionCount !== 1) {
    throw new UndnsError(
      UNDNS_ERROR_CODES.invalidDnsMessage,
      "Message is not a standard DNS query",
    );
  }

  let offset = 12;
  const nameBytes: number[] = [];
  let labels = 0;
  let nameLength = 0;

  while (true) {
    if (offset >= view.byteLength) {
      throw new UndnsError(UNDNS_ERROR_CODES.invalidDnsMessage, "Truncated DNS question name");
    }
    const length = view.getUint8(offset++);
    if (length === 0) break;
    if (length > 63 || (length & 0xc0) !== 0) {
      throw new UndnsError(
        UNDNS_ERROR_CODES.invalidDnsMessage,
        "Compressed or invalid question label",
      );
    }
    labels += 1;
    nameLength += length + 1;
    if (labels > 126 || nameLength > 254 || offset + length > view.byteLength) {
      throw new UndnsError(UNDNS_ERROR_CODES.invalidDnsMessage, "DNS question name is invalid");
    }
    for (let index = 0; index < length; index++) {
      const byte = view.getUint8(offset + index);
      if (byte === 0 || byte === 46) {
        throw new UndnsError(
          UNDNS_ERROR_CODES.invalidDnsMessage,
          "DNS question label contains a reserved byte",
        );
      }
      nameBytes.push(byte);
    }
    nameBytes.push(46);
    offset += length;
  }

  if (offset + 4 > view.byteLength) {
    throw new UndnsError(UNDNS_ERROR_CODES.invalidDnsMessage, "Truncated DNS question");
  }
  const type = view.getUint16(offset, false);
  const queryClass = view.getUint16(offset + 2, false);
  if (queryClass !== 1) {
    throw new UndnsError(UNDNS_ERROR_CODES.invalidDnsMessage, "Only the IN DNS class is supported");
  }

  let dnssecOk = false;
  offset += 4;
  const skipName = (): void => {
    while (offset < view.byteLength) {
      const length = view.getUint8(offset);
      if (length === 0) {
        offset += 1;
        return;
      }
      if ((length & 0xc0) === 0xc0) {
        if (offset + 2 > view.byteLength) {
          throw new UndnsError(
            UNDNS_ERROR_CODES.invalidDnsMessage,
            "Truncated DNS compression pointer",
          );
        }
        offset += 2;
        return;
      }
      if ((length & 0xc0) !== 0) {
        throw new UndnsError(UNDNS_ERROR_CODES.invalidDnsMessage, "Invalid DNS label");
      }
      offset += 1 + length;
      if (offset > view.byteLength) {
        throw new UndnsError(UNDNS_ERROR_CODES.invalidDnsMessage, "Truncated DNS name");
      }
    }
    throw new UndnsError(UNDNS_ERROR_CODES.invalidDnsMessage, "Truncated DNS name");
  };

  const skipRecord = (): void => {
    skipName();
    if (offset + 10 > view.byteLength) {
      throw new UndnsError(UNDNS_ERROR_CODES.invalidDnsMessage, "Truncated DNS resource record");
    }
    const recordType = view.getUint16(offset, false);
    const dataLength = view.getUint16(offset + 8, false);
    const dataOffset = offset + 10;
    if (dataOffset + dataLength > view.byteLength) {
      throw new UndnsError(
        UNDNS_ERROR_CODES.invalidDnsMessage,
        "Truncated DNS resource record data",
      );
    }
    if (recordType === 41) {
      dnssecOk = (view.getUint16(offset + 4, false) & 0x8000) !== 0;
    }
    offset = dataOffset + dataLength;
  };

  try {
    for (let index = 0; index < answerCount; index++) skipRecord();
    for (let index = 0; index < authorityCount; index++) skipRecord();
    for (let index = 0; index < additionalCount; index++) skipRecord();
  } catch (error) {
    if (error instanceof UndnsError) throw error;
    throw new UndnsError(UNDNS_ERROR_CODES.invalidDnsMessage, "Invalid DNS resource record", {
      cause: error,
    });
  }

  const name = new TextDecoder("utf-8", { fatal: false })
    .decode(Uint8Array.from(nameBytes))
    .replace(/\.$/, "");

  return {
    transactionId,
    name,
    type,
    recursionDesired,
    checkingDisabled,
    dnssecOk,
  };
}

function encodeDomainName(name: string): Uint8Array {
  const labels = name.replace(/\.$/, "").split(".").filter(Boolean);
  const sections: Uint8Array[] = [];
  for (const label of labels) {
    const bytes = new TextEncoder().encode(label);
    if (bytes.length === 0 || bytes.length > 63) {
      throw new UndnsError(UNDNS_ERROR_CODES.invalidDnsMessage, `Invalid DNS label: ${label}`);
    }
    sections.push(Uint8Array.from([bytes.length]), bytes);
  }
  sections.push(Uint8Array.from([0]));
  return sections.reduce((left, right) => {
    const result = new Uint8Array(left.length + right.length);
    result.set(left);
    result.set(right, left.length);
    return result;
  }, new Uint8Array());
}

function combineArrays(arrays: Uint8Array[]): Uint8Array {
  const length = arrays.reduce((total, array) => total + array.length, 0);
  const result = new Uint8Array(new ArrayBuffer(length));
  let offset = 0;
  for (const array of arrays) {
    result.set(array, offset);
    offset += array.length;
  }
  return result;
}

function encodeAData(data: string): Uint8Array {
  try {
    return new Uint8Array(ipv4ToBuffer(data));
  } catch {
    throw new UndnsError(UNDNS_ERROR_CODES.invalidProviderResponse, `Invalid IPv4 answer: ${data}`);
  }
}

function encodeAaaaData(data: string): Uint8Array {
  try {
    return new Uint8Array(ipv6ToBuffer(data));
  } catch {
    throw new UndnsError(UNDNS_ERROR_CODES.invalidProviderResponse, `Invalid IPv6 answer: ${data}`);
  }
}

function encodeRData(type: number, data: string): Uint8Array {
  switch (type) {
    case 1:
      return encodeAData(data);
    case 28:
      return encodeAaaaData(data);
    case 2:
    case 5:
    case 12:
      return encodeDomainName(data);
    case 15: {
      const match = data.match(/^(\d+)\s+(.+)$/);
      if (!match) {
        throw new UndnsError(
          UNDNS_ERROR_CODES.invalidProviderResponse,
          `Invalid MX answer: ${data}`,
        );
      }
      const preference = new Uint8Array(2);
      new DataView(preference.buffer).setUint16(0, Number(match[1]), false);
      return combineArrays([preference, encodeDomainName(match[2]!)]);
    }
    case 16: {
      const bytes = new TextEncoder().encode(data);
      if (bytes.length === 0) return new Uint8Array();
      // DNS TXT consists of one or more <=255 byte character-strings.
      const sections: Uint8Array[] = [];
      for (let offset = 0; offset < bytes.length; offset += 255) {
        const section = bytes.slice(offset, offset + 255);
        sections.push(Uint8Array.from([section.length]), section);
      }
      return combineArrays(sections);
    }
    case 33: {
      const match = data.match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);
      if (!match) {
        throw new UndnsError(
          UNDNS_ERROR_CODES.invalidProviderResponse,
          `Invalid SRV answer: ${data}`,
        );
      }
      const numbers = new Uint8Array(6);
      const view = new DataView(numbers.buffer);
      view.setUint16(0, Number(match[1]), false);
      view.setUint16(2, Number(match[2]), false);
      view.setUint16(4, Number(match[3]), false);
      return combineArrays([numbers, encodeDomainName(match[4]!)]);
    }
    case 52: {
      const normalized = data.replace(/[\s-]/g, "");
      if (!/^(?:[0-9a-fA-F]{2})+$/.test(normalized)) {
        throw new UndnsError(
          UNDNS_ERROR_CODES.invalidProviderResponse,
          `Invalid TLSA answer: ${data}`,
        );
      }
      return Uint8Array.from(normalized.match(/../g)!.map((byte) => Number.parseInt(byte, 16)));
    }
    default:
      return new TextEncoder().encode(data);
  }
}

function encodeResourceRecord(record: {
  name: string;
  type: number;
  TTL: number;
  data: string;
}): Uint8Array {
  const name = encodeDomainName(record.name);
  const fixed = new Uint8Array(10);
  const view = new DataView(fixed.buffer);
  view.setUint16(0, record.type, false);
  view.setUint16(2, 1, false);
  view.setUint32(4, record.TTL, false);
  const data = encodeRData(record.type, record.data);
  view.setUint16(8, data.length, false);
  return combineArrays([name, fixed, data]);
}

function encodeEdnsOpt(dnssecOk: boolean): Uint8Array {
  const record = new Uint8Array(11);
  const view = new DataView(record.buffer);
  view.setUint16(1, 41, false); // root name ends at byte zero; OPT type is at byte one.
  view.setUint16(3, 1232, false); // UDP payload size
  view.setUint16(5, dnssecOk ? 0x8000 : 0, false); // TTL high word contains DO
  view.setUint16(9, 0, false); // OPT RDATA length
  return record;
}

export function encodeDnsWireResponse(query: DohWireQuery, response: DOHResponse): ArrayBuffer {
  const question = {
    name: `${query.name}.`,
    type: query.type,
    TTL: 0,
    data: "",
  };
  const encodedQuestion = combineArrays([
    encodeDomainName(question.name),
    Uint8Array.from([query.type >> 8, query.type & 0xff, 0, 1]),
  ]);
  const encodedAnswers = (response.Answer ?? [])
    .map((record) => ({
      ...record,
      name: `${query.name}.`,
      type: Number(record.type),
      TTL: Number(record.TTL),
    }))
    .map(encodeResourceRecord);
  const hasOpt = Boolean(response.DO);

  const header = new Uint8Array(12);
  const headerView = new DataView(header.buffer);
  headerView.setUint16(0, query.transactionId, false);
  let flags = 0x8000 | 0x0080; // QR and RA
  if (query.recursionDesired) flags |= 0x0100;
  if (query.checkingDisabled) flags |= 0x0010;
  if (response.AD) flags |= 0x0020;
  flags |= Number(response.Status) & 0x0f;
  headerView.setUint16(2, flags, false);
  headerView.setUint16(4, 1, false);
  headerView.setUint16(6, encodedAnswers.length, false);
  headerView.setUint16(8, 0, false);
  headerView.setUint16(10, hasOpt ? 1 : 0, false);

  return combineArrays([
    header,
    encodedQuestion,
    ...encodedAnswers,
    ...(hasOpt ? [encodeEdnsOpt(query.dnssecOk)] : []),
  ]).buffer as ArrayBuffer;
}

function wireErrorResponse(query: DohWireQuery, status: number): DOHResponse {
  return {
    Status: status,
    TC: false,
    RD: query.recursionDesired,
    RA: true,
    AD: false,
    CD: query.checkingDisabled,
    DO: query.dnssecOk,
    Question: [{ name: `${query.name}.`, type: query.type }],
    Answer: [],
  };
}

function detectRequestFormat(event: H3Event<EventHandlerRequest>): "json" | "wire" {
  const url = new URL(event.req.url || "");
  const accept = event.req.headers.get("accept") || "";
  const contentType = event.req.headers.get("content-type") || "";

  if (url.searchParams.has("dns") || contentType.includes("application/dns-message")) return "wire";
  if (accept.includes("application/dns-message")) return "wire";
  return "json";
}

function normalizeQueryName(name: string): string {
  const normalized = name.replace(/\.$/, "").toLowerCase();
  if (!normalized || normalized.length > 253 || normalized.includes("..")) {
    throw new UndnsError(UNDNS_ERROR_CODES.invalidDnsMessage, `Invalid DNS name: ${name}`);
  }
  for (const label of normalized.split(".")) {
    if (!label || label.length > 63) {
      throw new UndnsError(UNDNS_ERROR_CODES.invalidDnsMessage, `Invalid DNS label: ${label}`);
    }
  }
  return normalized;
}

function convertDNSRecordToDoHAnswer(record: DNSRecord, queryName: string) {
  const typeName = String(record.type).toUpperCase();
  const type = getDnsTypeNumber(typeName);
  const ttl = typeof record.ttl === "number" && Number.isFinite(record.ttl) ? record.ttl : 0;
  const typed = record as Record<string, any>;
  let data = "";

  switch (typeName) {
    case "A":
    case "AAAA":
      data = typed.address;
      break;
    case "CNAME":
    case "NS":
    case "PTR":
      data = typed.value;
      break;
    case "MX":
      data = `${typed.priority} ${typed.exchange}`;
      break;
    case "TXT":
      data = (typed.entries ?? []).join("");
      break;
    case "SRV":
      data = `${typed.priority} ${typed.weight} ${typed.port} ${typed.name}`;
      break;
    case "SOA":
      data = `${typed.nsname} ${typed.hostmaster} ${typed.serial} ${typed.refresh} ${typed.retry} ${typed.expire} ${typed.minttl}`;
      break;
    case "CAA": {
      const tag = typed.issue ? "issue" : typed.issuewild ? "issuewild" : "iodef";
      data = `${typed.critical ?? 0} ${tag} "${typed[tag] ?? ""}"`;
      break;
    }
    case "NAPTR":
      data = `${typed.order} ${typed.preference} "${typed.flags}" "${typed.service}" "${typed.regexp}" ${typed.replacement}`;
      break;
    case "TLSA":
      data = Buffer.from(typed.data).toString("hex");
      break;
    default:
      throw new UndnsError(
        UNDNS_ERROR_CODES.unsupportedRecordType,
        `Cannot serialize DNS record type: ${typeName}`,
        { details: { type: typeName } },
      );
  }

  return { name: `${queryName}.`, type, TTL: ttl, data: String(data) };
}

function jsonErrorResponse(message: string, status = 1): string {
  return JSON.stringify({ Status: status, AD: false, CD: false, Answer: [], Error: message });
}

export function createDohHandler(
  opts: DohServerOptions,
): EventHandlerWithFetch<EventHandlerRequest, Promise<DOHResponse | string | ArrayBuffer>> {
  const driver = opts.driver;
  if (!driver.getRecords || driver.capabilities?.read === false) {
    throw new UndnsError(
      UNDNS_ERROR_CODES.unsupportedOperation,
      "DoH server driver must support getRecords",
    );
  }
  const dnsManager = createDNSManager({ driver });

  return defineHandler(async (event) => {
    const url = new URL(event.req.url || "");
    if (url.pathname !== "/dns-query") {
      throw new HTTPError({ statusCode: 404, statusMessage: "DoH endpoint is /dns-query" });
    }
    if (event.req.method !== "GET" && event.req.method !== "POST") {
      throw new HTTPError({ statusCode: 405, statusMessage: "DoH supports GET and POST" });
    }

    const requestFormat = detectRequestFormat(event);
    let wireQuery: DohWireQuery | undefined;

    if (requestFormat === "wire") {
      try {
        if (event.req.method === "GET") {
          const dnsParameter = url.searchParams.get("dns");
          if (!dnsParameter) {
            throw new UndnsError(
              UNDNS_ERROR_CODES.invalidDnsMessage,
              "Missing dns query parameter",
            );
          }
          const normalized = dnsParameter.replace(/-/g, "+").replace(/_/g, "/");
          const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
          const binary = atob(padded);
          wireQuery = parseDnsWireQuery(
            Uint8Array.from(binary, (byte) => byte.charCodeAt(0)).buffer,
          );
        } else {
          const contentType = event.req.headers.get("content-type") || "";
          if (!contentType.split(";")[0]?.trim().includes("application/dns-message")) {
            throw new HTTPError({
              statusCode: 415,
              statusMessage: "POST content-type must be application/dns-message",
            });
          }
          wireQuery = parseDnsWireQuery(await readWireRequestBody(event.req));
        }
      } catch (error) {
        if (HTTPError.isError(error)) {
          throw error;
        }
        throw new HTTPError({
          statusCode: 400,
          statusMessage: error instanceof Error ? error.message : "Invalid DNS wireformat message",
        });
      }

      const typeName = getDnsTypeString(wireQuery.type);
      await opts.authorize?.({ name: wireQuery.name, type: typeName });
      event.res.headers.set("Content-Type", "application/dns-message");
      event.res.headers.set("Access-Control-Allow-Origin", "*");

      try {
        const records = await dnsManager.getRecords(wireQuery.name, { type: typeName });
        const response: DOHResponse = {
          Status: 0,
          TC: false,
          RD: wireQuery.recursionDesired,
          RA: true,
          AD: false,
          CD: wireQuery.checkingDisabled,
          DO: wireQuery.dnssecOk,
          Question: [{ name: `${wireQuery.name}.`, type: wireQuery.type }],
          Answer: records.map((record) => convertDNSRecordToDoHAnswer(record, wireQuery!.name)),
        };
        return encodeDnsWireResponse(wireQuery, response);
      } catch (error) {
        if (error instanceof UndnsError && error.code === UNDNS_ERROR_CODES.nameNotFound) {
          return encodeDnsWireResponse(wireQuery, wireErrorResponse(wireQuery, DNS_RCODE.NXDOMAIN));
        }
        if (error instanceof UndnsError && error.code === UNDNS_ERROR_CODES.unsupportedRecordType) {
          return encodeDnsWireResponse(wireQuery, wireErrorResponse(wireQuery, DNS_RCODE.NOTIMP));
        }
        return encodeDnsWireResponse(wireQuery, wireErrorResponse(wireQuery, DNS_RCODE.SERVFAIL));
      }
    }

    const query = Object.fromEntries(url.searchParams.entries());
    const name = normalizeQueryName(query.name || "");
    const type = (query.type || "A").toUpperCase();

    const invalidFlag = (flag: string | undefined, label: string): string | undefined => {
      if (flag !== undefined && !["", "0", "false", "1", "true"].includes(flag)) {
        return jsonErrorResponse(
          `Invalid ${label} flag. Expected empty, 0, false, 1, or true.`,
          DNS_RCODE.FORMERR,
        );
      }
      return undefined;
    };
    const flagError = invalidFlag(query.do, "DO") ?? invalidFlag(query.cd, "CD");
    if (flagError) return flagError;
    if (!name) return jsonErrorResponse("Missing required parameter: name", DNS_RCODE.FORMERR);

    const dnssecOk = query.do === "1" || query.do === "true";
    const checkingDisabled = query.cd === "1" || query.cd === "true";
    let typeNumber: number;
    try {
      typeNumber = getDnsTypeNumber(type);
    } catch {
      return jsonErrorResponse(`Invalid DNS record type: ${type}`, DNS_RCODE.FORMERR);
    }

    await opts.authorize?.({ name, type });
    event.res.headers.set("Content-Type", "application/dns-json");
    event.res.headers.set("Access-Control-Allow-Origin", "*");

    try {
      const records = await dnsManager.getRecords(name, { type });
      const response: DOHResponse = {
        Status: 0,
        TC: false,
        RD: true,
        RA: true,
        AD: false,
        CD: checkingDisabled,
        DO: dnssecOk,
        Question: [{ name: `${name}.`, type: typeNumber }],
        Answer: records.map((record) => convertDNSRecordToDoHAnswer(record, name)),
      };
      return JSON.stringify(response);
    } catch (error) {
      if (error instanceof UndnsError && error.code === UNDNS_ERROR_CODES.nameNotFound) {
        return JSON.stringify({
          Status: DNS_RCODE.NXDOMAIN,
          TC: false,
          RD: true,
          RA: true,
          AD: false,
          CD: checkingDisabled,
          DO: dnssecOk,
          Question: [{ name: `${name}.`, type: typeNumber }],
          Answer: [],
        });
      }
      return jsonErrorResponse(
        error instanceof Error ? error.message : "DNS query failed",
        DNS_RCODE.SERVFAIL,
      );
    }
  });
}

export function createDohServer(opts: DohServerOptions): {
  handler: EventHandlerWithFetch<EventHandlerRequest, Promise<DOHResponse | string | ArrayBuffer>>;
  serve: (port?: number) => void;
} {
  const handler = createDohHandler(opts);
  const app = new H3().use("/dns-query", handler);
  return {
    handler,
    serve: (port = 8080) => serve(app, { port }),
  };
}

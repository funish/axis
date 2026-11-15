export interface WireQueryOptions {
  transactionId?: number;
  name?: string;
  type?: number;
  recursionDesired?: boolean;
  dnssecOk?: boolean;
}

export function encodeWireQuery(options: WireQueryOptions = {}): Uint8Array {
  const name = `${options.name ?? "example.com"}.`;
  const header = new Uint8Array(12);
  const headerView = new DataView(header.buffer);
  headerView.setUint16(0, options.transactionId ?? 0x1234, false);
  headerView.setUint16(2, options.recursionDesired === false ? 0 : 0x0100, false);
  headerView.setUint16(4, 1, false);
  if (options.dnssecOk) headerView.setUint16(10, 1, false);

  const sections: Uint8Array[] = [header];
  for (const label of name.split(".").filter(Boolean)) {
    const bytes = new TextEncoder().encode(label);
    sections.push(Uint8Array.from([bytes.length, ...bytes]));
  }
  const type = options.type ?? 1;
  sections.push(Uint8Array.from([0, type >> 8, type & 0xff, 0, 1]));

  if (options.dnssecOk) {
    sections.push(Uint8Array.from([0, 0, 41, 0x04, 0xd0, 0x80, 0, 0, 0, 0, 0]));
  }

  return sections.reduce((left, right) => {
    const result = new Uint8Array(left.length + right.length);
    result.set(left);
    result.set(right, left.length);
    return result;
  });
}

export function readWireHeader(bytes: ArrayBuffer) {
  const view = new DataView(bytes);
  return {
    transactionId: view.getUint16(0, false),
    flags: view.getUint16(2, false),
    questionCount: view.getUint16(4, false),
    answerCount: view.getUint16(6, false),
    authorityCount: view.getUint16(8, false),
    additionalCount: view.getUint16(10, false),
  };
}

export function readFirstAAnswer(bytes: ArrayBuffer): string {
  const view = new DataView(bytes);
  let offset = 12;
  while (view.getUint8(offset) !== 0) {
    offset += 1 + view.getUint8(offset);
  }
  offset += 5; // root plus QTYPE/QCLASS
  while (view.getUint8(offset) !== 0) {
    const length = view.getUint8(offset);
    offset += 1 + length;
  }
  offset += 1;
  const recordType = view.getUint16(offset, false);
  const dataLength = view.getUint16(offset + 8, false);
  const data = new Uint8Array(bytes, offset + 10, dataLength);
  if (recordType !== 1) throw new Error(`Expected an A record, received type ${recordType}`);
  return Array.from(data).join(".");
}

export function readOptDoBit(bytes: ArrayBuffer): boolean {
  const view = new DataView(bytes);
  let offset = 12;
  while (view.getUint8(offset) !== 0) {
    offset += 1 + view.getUint8(offset);
  }
  offset += 5;

  // Skip the first answer, then inspect the OPT pseudo-record.
  while (view.getUint8(offset) !== 0) {
    offset += 1 + view.getUint8(offset);
  }
  offset += 1;
  offset += 10 + view.getUint16(offset + 8, false);

  while (view.getUint8(offset) !== 0) {
    offset += 1 + view.getUint8(offset);
  }
  offset += 1;
  if (view.getUint16(offset, false) !== 41) return false;
  return (view.getUint16(offset + 4, false) & 0x8000) !== 0;
}

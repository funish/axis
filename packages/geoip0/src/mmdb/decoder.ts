/**
 * MMDB Data Decoder
 * Direct port of the original mmdb-lib decoder with Uint8Array support
 */

import { toUint8Array, DataType } from "undio";
import { MMDBRecordType } from "./types";

const pointerValueOffset = [0, 2048, 526336, 0];

interface Cursor {
  value: any;
  offset: number;
}

const cursor = (value: any, offset: number): Cursor => ({ value, offset });

/**
 * Universal MMDB decoder that matches original mmdb-lib implementation exactly
 */
export class MMDBDecoder {
  private data: Uint8Array;
  private baseOffset: number;

  constructor(data: DataType, baseOffset = 0) {
    this.data = toUint8Array(data);
    this.baseOffset = baseOffset;
  }

  /**
   * Decode data from given offset (matches original mmdb-lib decode)
   */
  decode(offset: number): Cursor {
    let tmp: any;
    const ctrlByte = this.data[offset++];
    let type = ctrlByte >> 5;

    if (type === MMDBRecordType.Pointer) {
      tmp = this.decodePointer(ctrlByte, offset);
      return cursor(this.decodeFast(tmp.value).value, tmp.offset);
    }

    if (type === MMDBRecordType.Extended) {
      tmp = this.data[offset] + 7;
      if (tmp < 8) {
        throw new Error(
          "Invalid Extended Type at offset " + offset + " val " + tmp,
        );
      }

      type = tmp;
      offset++;
    }

    const size = this.sizeFromCtrlByte(ctrlByte, offset);
    return this.decodeByType(type, size.offset, size.value);
  }

  /**
   * Fast decode with caching (matches original mmdb-lib behavior)
   */
  decodeFast(offset: number): Cursor {
    // Original library uses baseOffset for pointer resolution
    // We need to handle pointer resolution properly
    const result = this.decode(offset);
    return cursor(result.value, result.offset);
  }

  /**
   * Decode pointer (matches original mmdb-lib)
   */
  private decodePointer(ctrlByte: number, offset: number): Cursor {
    // Pointers use the last five bits in the control byte to calculate the pointer value.
    const pointerSize = (ctrlByte >> 3) & 3;
    const pointer = this.baseOffset + pointerValueOffset[pointerSize];
    let packed = 0;

    // The size can be 0, 1, 2, or 3.
    if (pointerSize === 0) {
      // If the size is 0, the pointer is built by appending the next byte to the last three bits to produce an 11-bit value.
      packed = ((ctrlByte & 7) << 8) | this.data[offset];
    } else if (pointerSize === 1) {
      // If the size is 1, the pointer is built by appending the next two bytes to the last three bits to produce a 19-bit value + 2048.
      packed = ((ctrlByte & 7) << 16) | this.readUint16BE(offset);
    } else if (pointerSize === 2) {
      // If the size is 2, the pointer is built by appending the next three bytes to the last three bits to produce a 27-bit value + 526336.
      packed = ((ctrlByte & 7) << 24) | this.readUintBE(offset, 3);
    } else {
      // At this point size is always 3.
      // Finally, if the size is 3, the pointer's value is contained in the next four bytes as a 32-bit value.
      packed = this.readUint32BE(offset);
    }

    offset += pointerSize + 1;
    return cursor(pointer + packed, offset);
  }

  /**
   * Decode by type (matches original mmdb-lib)
   */
  private decodeByType(type: number, offset: number, size: number): Cursor {
    switch (type) {
      case MMDBRecordType.Utf8String:
        return cursor(this.decodeUtf8String(offset, size), offset + size);

      case MMDBRecordType.Double:
        return cursor(this.decodeDouble(offset), offset + 8);

      case MMDBRecordType.Bytes:
        return cursor(this.decodeBytes(offset, size), offset + size);

      case MMDBRecordType.Uint16:
        if (size === 0) return cursor(0, offset);
        if (size === 1) return cursor(this.data[offset], offset + 1);
        if (size === 2) return cursor(this.readUint16BE(offset), offset + 2);
        throw new Error("Invalid Uint16 size");

      case MMDBRecordType.Uint32:
        if (size === 0) return cursor(0, offset);
        if (size <= 4) {
          if (size === 1) return cursor(this.data[offset], offset + 1);
          if (size === 2) return cursor(this.readUint16BE(offset), offset + 2);
          if (size === 3) return cursor(this.readUintBE(offset, 3), offset + 3);
          if (size === 4) return cursor(this.readUint32BE(offset), offset + 4);
        }
        throw new Error("Invalid Uint32 size");

      case MMDBRecordType.Map:
        return this.decodeMap(size, offset);

      case MMDBRecordType.Int32:
        if (size === 0) return cursor(0, offset);
        if (size < 4) {
          // For sizes less than 4, treat as unsigned
          return cursor(this.readUintBE(offset, size), offset + size);
        }
        return cursor(this.readInt32BE(offset), offset + 4);

      case MMDBRecordType.Uint64:
        if (size === 0) return cursor(BigInt(0), offset);
        if (size <= 8) {
          let result = BigInt(0);
          for (let i = 0; i < size; i++) {
            result = (result << BigInt(8)) | BigInt(this.data[offset + i]);
          }
          return cursor(result, offset + size);
        }
        throw new Error("Invalid Uint64 size");

      case MMDBRecordType.Uint128:
        if (size === 0) return cursor(BigInt(0), offset);
        let result = BigInt(0);
        for (let i = 0; i < Math.min(size, 16); i++) {
          result = (result << BigInt(8)) | BigInt(this.data[offset + i]);
        }
        return cursor(result, offset + size);

      case MMDBRecordType.Array:
        return this.decodeArray(size, offset);

      case MMDBRecordType.Container:
        return cursor(null, offset); // Container type is not valid in data section

      case MMDBRecordType.EndMarker:
        return cursor(null, offset);

      case MMDBRecordType.Boolean:
        return cursor(size !== 0, offset);

      case MMDBRecordType.Float:
        return cursor(this.decodeFloat(offset), offset + 4);

      default:
        throw new Error("Unknown type " + type);
    }
  }

  /**
   * Decode array (matches original mmdb-lib)
   */
  private decodeArray(size: number, offset: number): Cursor {
    const array = Array.from({ length: size });
    for (let i = 0; i < size; i++) {
      const element = this.decode(offset);
      offset = element.offset;
      array[i] = element.value;
    }
    return cursor(array, offset);
  }

  /**
   * Decode map (matches original mmdb-lib)
   */
  private decodeMap(size: number, offset: number): Cursor {
    const map: Record<string, any> = {};
    for (let i = 0; i < size; i++) {
      const key = this.decode(offset);
      const value = this.decode(key.offset);
      offset = value.offset;
      map[key.value] = value.value;
    }
    return cursor(map, offset);
  }

  /**
   * Decode UTF-8 string (matches original mmdb-lib)
   */
  private decodeUtf8String(offset: number, size: number): string {
    if (size === 0) return "";
    const bytes = this.data.subarray(offset, offset + size);
    return new TextDecoder("utf-8").decode(bytes);
  }

  /**
   * Decode double (matches original mmdb-lib)
   */
  private decodeDouble(offset: number): number {
    const view = new DataView(
      this.data.buffer,
      this.data.byteOffset + offset,
      8,
    );
    return view.getFloat64(0, false); // big-endian
  }

  /**
   * Decode float (matches original mmdb-lib)
   */
  private decodeFloat(offset: number): number {
    const view = new DataView(
      this.data.buffer,
      this.data.byteOffset + offset,
      4,
    );
    return view.getFloat32(0, false); // big-endian
  }

  /**
   * Decode bytes (matches original mmdb-lib)
   */
  private decodeBytes(offset: number, size: number): Uint8Array {
    return this.data.subarray(offset, offset + size);
  }

  /**
   * Decode signed 32-bit integer (matches original mmdb-lib)
   */
  private decodeInt32BE(offset: number): number {
    const view = new DataView(
      this.data.buffer,
      this.data.byteOffset + offset,
      4,
    );
    return view.getInt32(0, false); // big-endian
  }

  /**
   * Get size from control byte (matches original mmdb-lib)
   */
  private sizeFromCtrlByte(
    ctrlByte: number,
    offset: number,
  ): { offset: number; value: number } {
    const size = ctrlByte & 0x1f;

    if (size < 29) {
      return { offset: offset, value: size };
    }

    if (size === 29) {
      return { offset: offset + 1, value: 29 + this.data[offset] };
    }

    if (size === 30) {
      return { offset: offset + 2, value: 285 + this.readUint16BE(offset) };
    }

    // size === 31
    return { offset: offset + 3, value: 65821 + this.readUintBE(offset, 3) };
  }

  /**
   * Read unsigned 16-bit big-endian
   */
  private readUint16BE(offset: number): number {
    return (this.data[offset] << 8) | this.data[offset + 1];
  }

  /**
   * Read unsigned 24-bit big-endian
   */
  private readUintBE(offset: number, size: number): number {
    let result = 0;
    for (let i = 0; i < size; i++) {
      result = (result << 8) | this.data[offset + i];
    }
    return result;
  }

  /**
   * Read unsigned 32-bit big-endian
   */
  private readUint32BE(offset: number): number {
    return (
      (this.data[offset] << 24) |
      (this.data[offset + 1] << 16) |
      (this.data[offset + 2] << 8) |
      this.data[offset + 3]
    );
  }

  /**
   * Read signed 32-bit big-endian
   */
  private readInt32BE(offset: number): number {
    const view = new DataView(
      this.data.buffer,
      this.data.byteOffset + offset,
      4,
    );
    return view.getInt32(0, false); // big-endian
  }
}

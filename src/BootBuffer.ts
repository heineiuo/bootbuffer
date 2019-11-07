/**
 * Copyright (c) 2019-present, heineiuo.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// ValueType<varint> | KeyLength<varint> | ValueLength<varint> | Key<Buffer> | Value<Buffer> | ...repeat |

import varint from 'varint'
import assert from 'assert'

export const kTmpBufferSize = 4096
export const kUInt32MaxValue = 4294967295
export const kUInt16MaxValue = 65535
export const kUInt8MaxValue = 16
export const kFloatMaxDigits = 7
export const kDoubleMaxDigits = 16
export const kFloatRange = [1.2e-38, 3.4e38]

export enum ValueType {
  buffer,
  string,
  uint8,
  uint16,
  uint32,
  bigint,
  float,
  double,
  boolean,
}

export enum DynamicTotalSize {
  dynamic,
  fixed,
}

export type EntryValueType = Buffer | string | number | bigint | boolean

export interface Entry {
  type: ValueType
  key: string
  value: EntryValueType
}

export class ReadState {
  lastType = -1
  lastKeyLengthRead = false
  lastValueLengthRead = false
  lastKeyLength = 0
  lastValueLength = 0
  lastKeyBuf = Buffer.allocUnsafe(0)
  lastKeyBufUsedSpace = 0
  lastValueBuf = Buffer.allocUnsafe(0)
  lastValueBufUsedSpace = 0
}

async function* createAsyncIterableIteratorFromBuffer(
  buf: Buffer
): AsyncIterableIterator<Buffer> {
  yield buf
}

export class BootBuffer {
  static async *read(
    source: Buffer | AsyncIterableIterator<Buffer>
  ): AsyncIterableIterator<Entry> {
    let source2 = {} as AsyncIterableIterator<Buffer>
    if (Buffer.isBuffer(source)) {
      source2 = createAsyncIterableIteratorFromBuffer(source)
    } else {
      source2 = source
    }

    const tmpBuf = Buffer.allocUnsafe(kTmpBufferSize)
    let tmpBufUsedSpace = 0
    let lastEntry = new ReadState()

    for await (const buf0 of source2) {
      let buf = buf0
      if (tmpBufUsedSpace > 0) {
        buf = Buffer.concat([tmpBuf.slice(0, tmpBufUsedSpace), buf])
        tmpBufUsedSpace = 0
      }
      let bufUsedSpace = 0
      while (bufUsedSpace < buf.length) {
        const currentBuf = bufUsedSpace > 0 ? buf.slice(bufUsedSpace) : buf
        const tmpBufFreeSpace = kTmpBufferSize - tmpBufUsedSpace

        function fallback(): void {
          tmpBuf.fill(currentBuf, tmpBufUsedSpace)
          bufUsedSpace += kTmpBufferSize - tmpBufUsedSpace
          tmpBufUsedSpace += Math.max(currentBuf.length, tmpBufFreeSpace)
          assert(kTmpBufferSize - tmpBufUsedSpace >= 0)
        }

        if (lastEntry.lastType === -1) {
          try {
            lastEntry.lastType = varint.decode(currentBuf)
            bufUsedSpace += varint.decode.bytes
          } catch (e) {
            fallback()
          }
          continue
        }

        if (!lastEntry.lastKeyLengthRead) {
          try {
            lastEntry.lastKeyLength = varint.decode(currentBuf)
            lastEntry.lastKeyLengthRead = true
            lastEntry.lastKeyBuf = Buffer.allocUnsafe(lastEntry.lastKeyLength)
            lastEntry.lastKeyBufUsedSpace = 0
            bufUsedSpace += varint.decode.bytes
          } catch (e) {
            fallback()
          }
          continue
        }

        if (!lastEntry.lastValueLengthRead) {
          try {
            lastEntry.lastValueLength = varint.decode(currentBuf)
            lastEntry.lastValueLengthRead = true
            lastEntry.lastValueBuf = Buffer.allocUnsafe(
              lastEntry.lastValueLength
            )
            lastEntry.lastValueBufUsedSpace = 0
            bufUsedSpace += varint.decode.bytes
          } catch (e) {
            fallback()
          }
          continue
        }

        if (lastEntry.lastKeyBufUsedSpace < lastEntry.lastKeyLength) {
          if (currentBuf.length >= lastEntry.lastKeyLength) {
            lastEntry.lastKeyBuf.fill(currentBuf)
            lastEntry.lastKeyBufUsedSpace = lastEntry.lastKeyLength
            bufUsedSpace += lastEntry.lastKeyLength
          } else {
            fallback()
          }
          continue
        }

        if (lastEntry.lastValueBufUsedSpace < lastEntry.lastValueLength) {
          const lastValueBufFreeSpace =
            lastEntry.lastValueBuf.length - lastEntry.lastValueBufUsedSpace
          lastEntry.lastValueBuf.fill(
            buf.slice(bufUsedSpace),
            lastEntry.lastValueBufUsedSpace
          )
          bufUsedSpace += lastValueBufFreeSpace
          // maybe not all buf content been used
          lastEntry.lastValueBufUsedSpace += buf.length
          if (
            lastEntry.lastValueBufUsedSpace >= lastEntry.lastValueBuf.length
          ) {
            yield {
              type: lastEntry.lastType,
              key: lastEntry.lastKeyBuf.toString(),
              value: BootBuffer.parseValue(
                lastEntry.lastValueBuf,
                lastEntry.lastType
              ),
            }
            lastEntry = new ReadState()
          }
        }
      }
    }
  }

  static parseValue(valueBuffer: Buffer, type: ValueType): EntryValueType {
    switch (type) {
      case ValueType.buffer:
        return valueBuffer
      case ValueType.string:
        return valueBuffer.toString()
      case ValueType.boolean:
        return valueBuffer[0] === 0x01
      case ValueType.bigint:
        return valueBuffer.readBigUInt64LE()
      case ValueType.uint8:
        return valueBuffer.readUInt8(0)
      case ValueType.uint16:
        return valueBuffer.readUInt16LE(0)
      case ValueType.uint32:
        return valueBuffer.readUInt32LE(0)
      case ValueType.float:
        return parseFloat(valueBuffer.readFloatLE(0).toFixed(kFloatMaxDigits))
      case ValueType.double:
        return parseFloat(valueBuffer.readDoubleLE(0).toFixed(kDoubleMaxDigits))
      default:
        return valueBuffer
    }
  }

  static addEntry(key: string, value: EntryValueType): Buffer {
    let valueLength = 0
    let valueType = -1
    let valueBuffer = Buffer.allocUnsafe(8)
    if (typeof value === 'boolean') {
      valueType = ValueType.boolean
      valueBuffer.writeUInt8(value ? 0x01 : 0x00, 0)
      valueLength = 1
    } else if (typeof value === 'bigint') {
      valueType = ValueType.bigint
      valueBuffer.writeBigUInt64LE(value)
      valueLength = 8
    } else if (Buffer.isBuffer(value)) {
      valueType = ValueType.buffer
      valueBuffer = value
      valueLength = value.length
    } else if (typeof value === 'string') {
      valueType = ValueType.string
      valueBuffer = Buffer.from(value)
      valueLength = valueBuffer.length
    } else if (typeof value === 'number' && Number(value) === value) {
      if (value % 1 === 0) {
        if (value > kUInt32MaxValue) {
          valueType = ValueType.bigint
          valueBuffer.writeBigUInt64LE(BigInt(value))
          valueLength = 8
        } else if (value > kUInt16MaxValue) {
          valueType = ValueType.uint32
          valueBuffer.writeUInt32LE(value, 0)
          valueLength = 4
        } else if (value > kUInt8MaxValue) {
          valueType = ValueType.uint16
          valueBuffer.writeUInt16LE(value, 0)
          valueLength = 2
        } else {
          valueType = ValueType.uint8
          valueBuffer.writeUInt8(value, 0)
          valueLength = 1
        }
      } else {
        let isDouble = false
        if (value < kFloatRange[0] || value > kFloatRange[1]) {
          isDouble = true
        } else {
          const str = String(value)
          const digits = str.split('.')[1]
          assert(!!digits)
          if (digits.length > kFloatMaxDigits) {
            isDouble = true
          }
        }
        if (isDouble) {
          valueType = ValueType.double
          valueBuffer.writeDoubleLE(value, 0)
          valueLength = 8
        } else {
          valueType = ValueType.float
          valueBuffer.writeFloatLE(value, 0)
          valueLength = 4
        }
      }
    } else {
      throw new Error('Unsupported type.')
    }

    const keyBuf = Buffer.from(key)
    const keyLength = keyBuf.length
    return Buffer.concat([
      Buffer.from(varint.encode(valueType)),
      Buffer.from(varint.encode(keyLength)),
      Buffer.from(varint.encode(valueLength)),
      keyBuf,
      valueBuffer.slice(0, valueLength),
    ])
  }

  constructor() {
    this._buffer = Buffer.allocUnsafe(0)
  }

  protected _buffer: Buffer

  get buffer(): Buffer {
    return this._buffer
  }

  add(key: string, value: EntryValueType): void {
    this._buffer = Buffer.concat([
      this._buffer,
      BootBuffer.addEntry(key, value),
    ])
  }
}

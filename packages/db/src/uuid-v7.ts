import { randomBytes } from 'node:crypto';

let lastMillisecond = 0;
let lastSequence = 0;

// RFC 9562 version 7: a 48-bit millisecond timestamp, then a 12-bit sequence, then random bits.
// Ids sort by creation time, so new rows land at the end of the primary key index instead of all
// over it. The sequence keeps ids made in the same millisecond in the order they were made,
// which the outbox relies on. Postgres 16 has no uuidv7(), so ids are made in the app
// (docs/rules/database.md).
export function uuidv7(): string {
  let millisecond = Date.now();
  if (millisecond > lastMillisecond) {
    // Start below the top so a busy millisecond has room to count up.
    lastSequence = randomBytes(2).readUInt16BE() & 0x7ff;
  } else {
    // Same millisecond, or the clock stepped back: keep counting from the last id.
    millisecond = lastMillisecond;
    lastSequence += 1;
    if (lastSequence > 0xfff) {
      millisecond += 1;
      lastSequence = 0;
    }
  }
  lastMillisecond = millisecond;

  const bytes = randomBytes(16);
  bytes.writeUIntBE(millisecond, 0, 6);
  bytes[6] = 0x70 | (lastSequence >> 8);
  bytes[7] = lastSequence & 0xff;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

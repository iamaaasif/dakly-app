import { randomBytes } from 'node:crypto';

// RFC 9562 version 7: a 48-bit millisecond timestamp, then random bits. Ids sort by creation
// time, so new rows land at the end of the primary key index instead of all over it.
// Postgres 16 has no uuidv7(), so ids are made in the app (docs/rules/database.md).
export function uuidv7(): string {
  const bytes = randomBytes(16);
  const now = Date.now();
  bytes.writeUIntBE(now, 0, 6);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

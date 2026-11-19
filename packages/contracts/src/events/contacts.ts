import { z } from 'zod';

import { consentChannels, consentSources, consentStatuses } from '../contacts';

export const contactCreatedEventSchema = z.strictObject({
  type: z.literal('contact.created'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({ contactId: z.uuid() }),
});

export const contactDeletedEventSchema = z.strictObject({
  type: z.literal('contact.deleted'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({ contactId: z.uuid() }),
});

export const contactStatsRepairedEventSchema = z.strictObject({
  type: z.literal('contact_stats.repaired'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({ day: z.iso.date() }),
});

export const contactTagAddedEventSchema = z.strictObject({
  type: z.literal('contact.tag_added'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({ contactId: z.uuid(), tag: z.string().trim().min(1).max(50) }),
});

export const consentChangedEventSchema = z.strictObject({
  type: z.literal('consent.changed'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({
    consentId: z.uuid(),
    contactId: z.uuid(),
    channel: z.enum(consentChannels),
    status: z.enum(consentStatuses),
    source: z.enum(consentSources),
  }),
});

export const segmentSavedEventSchema = z.strictObject({
  type: z.literal('segment.saved'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({ segmentId: z.uuid() }),
});

export const importStartedEventSchema = z.strictObject({
  type: z.literal('import.started'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({ importId: z.uuid() }),
});

export const importUndoRequestedEventSchema = z.strictObject({
  type: z.literal('import.undo_requested'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({ importId: z.uuid() }),
});

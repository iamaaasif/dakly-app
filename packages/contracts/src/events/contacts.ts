import { z } from 'zod';

import { consentChannels, consentSources, consentStatuses } from '../contacts';

export const contactCreatedEventSchema = z.strictObject({
  type: z.literal('contact.created'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({ contactId: z.uuid() }),
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

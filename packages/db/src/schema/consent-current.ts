import { pgView, text, uuid } from 'drizzle-orm/pg-core';

import { consentChannels, consentSources, consentStatuses } from '@dakly/contracts/contacts';

import { timestamptz } from './columns';

// The latest consent row per contact and channel. Migration 0006 creates it with security_invoker,
// so RLS applies; `existing()` keeps drizzle-kit from generating it again.
export const contactConsentCurrent = pgView('contact_consent_current', {
  storeId: uuid('store_id').notNull(),
  contactId: uuid('contact_id').notNull(),
  channel: text('channel', { enum: consentChannels }).notNull(),
  status: text('status', { enum: consentStatuses }).notNull(),
  source: text('source', { enum: consentSources }).notNull(),
  capturedAt: timestamptz('captured_at').notNull(),
}).existing();

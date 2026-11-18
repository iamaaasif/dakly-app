import { z } from 'zod';

import { campaignApprovedEventSchema } from './campaigns';
import {
  consentChangedEventSchema,
  contactCreatedEventSchema,
  importStartedEventSchema,
  importUndoRequestedEventSchema,
  segmentSavedEventSchema,
} from './contacts';
import { knowledgeIndexRequestedEventSchema } from './knowledge';
import {
  conversationStartedEventSchema,
  messageDeliveredEventSchema,
  messageFailedEventSchema,
  messageOptedOutEventSchema,
  messageReadEventSchema,
  messageReceivedEventSchema,
  messageTappedEventSchema,
} from './messaging';
import { notificationCreatedEventSchema } from './notifications';
import {
  orderConfirmedEventSchema,
  orderCreatedEventSchema,
  orderStageChangedEventSchema,
} from './orders';
import {
  productUpdatedEventSchema,
  stockChangedEventSchema,
  variantRestockedEventSchema,
} from './products';

export const daklyEventSchema = z.discriminatedUnion('type', [
  contactCreatedEventSchema,
  productUpdatedEventSchema,
  stockChangedEventSchema,
  variantRestockedEventSchema,
  consentChangedEventSchema,
  segmentSavedEventSchema,
  importStartedEventSchema,
  importUndoRequestedEventSchema,
  knowledgeIndexRequestedEventSchema,
  campaignApprovedEventSchema,
  conversationStartedEventSchema,
  messageReceivedEventSchema,
  messageDeliveredEventSchema,
  messageReadEventSchema,
  messageFailedEventSchema,
  messageTappedEventSchema,
  messageOptedOutEventSchema,
  notificationCreatedEventSchema,
  orderStageChangedEventSchema,
  orderConfirmedEventSchema,
  orderCreatedEventSchema,
]);

export type DaklyEvent = z.infer<typeof daklyEventSchema>;

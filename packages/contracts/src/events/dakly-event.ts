import { z } from 'zod';

import { campaignApprovedEventSchema } from './campaigns';
import {
  consentChangedEventSchema,
  contactCreatedEventSchema,
  importStartedEventSchema,
  importUndoRequestedEventSchema,
  segmentSavedEventSchema,
} from './contacts';
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
  campaignApprovedEventSchema,
  conversationStartedEventSchema,
  messageReceivedEventSchema,
  messageDeliveredEventSchema,
  messageReadEventSchema,
  messageFailedEventSchema,
  messageTappedEventSchema,
  messageOptedOutEventSchema,
  notificationCreatedEventSchema,
]);

export type DaklyEvent = z.infer<typeof daklyEventSchema>;

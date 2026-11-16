import { z } from 'zod';

import {
  consentChangedEventSchema,
  contactCreatedEventSchema,
  segmentSavedEventSchema,
} from './contacts';
import {
  conversationStartedEventSchema,
  messageDeliveredEventSchema,
  messageFailedEventSchema,
  messageReadEventSchema,
  messageReceivedEventSchema,
} from './messaging';
import { notificationCreatedEventSchema } from './notifications';

export const daklyEventSchema = z.discriminatedUnion('type', [
  contactCreatedEventSchema,
  consentChangedEventSchema,
  segmentSavedEventSchema,
  conversationStartedEventSchema,
  messageReceivedEventSchema,
  messageDeliveredEventSchema,
  messageReadEventSchema,
  messageFailedEventSchema,
  notificationCreatedEventSchema,
]);

export type DaklyEvent = z.infer<typeof daklyEventSchema>;

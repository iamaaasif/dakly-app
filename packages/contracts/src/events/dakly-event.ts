import { z } from 'zod';

import { automationPausedEventSchema } from './automations';
import { campaignApprovedEventSchema } from './campaigns';
import {
  consentChangedEventSchema,
  contactCreatedEventSchema,
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
import { productUpdatedEventSchema } from './products';
import { walletCreditedEventSchema } from './wallets';

export const daklyEventSchema = z.discriminatedUnion('type', [
  contactCreatedEventSchema,
  productUpdatedEventSchema,
  consentChangedEventSchema,
  segmentSavedEventSchema,
  campaignApprovedEventSchema,
  conversationStartedEventSchema,
  messageReceivedEventSchema,
  messageDeliveredEventSchema,
  messageReadEventSchema,
  messageFailedEventSchema,
  messageTappedEventSchema,
  messageOptedOutEventSchema,
  notificationCreatedEventSchema,
  automationPausedEventSchema,
  walletCreditedEventSchema,
]);

export type DaklyEvent = z.infer<typeof daklyEventSchema>;

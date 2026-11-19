import { z } from 'zod';

import { campaignApprovedEventSchema } from './campaigns';
import {
  channelConnectedEventSchema,
  channelDisconnectedEventSchema,
  channelNeedsReconnectEventSchema,
} from './channels';
import {
  consentChangedEventSchema,
  contactBirthdayEventSchema,
  contactCreatedEventSchema,
  contactDeletedEventSchema,
  contactStatsRepairedEventSchema,
  contactTagAddedEventSchema,
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
  messageSendRequestedEventSchema,
  messageSentEventSchema,
  messageTappedEventSchema,
} from './messaging';
import { notificationCreatedEventSchema } from './notifications';
import {
  orderCodCollectedEventSchema,
  orderConfirmedEventSchema,
  orderCreatedEventSchema,
  orderEditedEventSchema,
  orderStageChangedEventSchema,
} from './orders';
import {
  paymentFailedEventSchema,
  paymentSucceededEventSchema,
  paymentVerificationRequestedEventSchema,
} from './payments';
import {
  productUpdatedEventSchema,
  stockChangedEventSchema,
  variantRestockedEventSchema,
} from './products';

export const daklyEventSchema = z.discriminatedUnion('type', [
  contactBirthdayEventSchema,
  contactCreatedEventSchema,
  contactDeletedEventSchema,
  contactStatsRepairedEventSchema,
  contactTagAddedEventSchema,
  productUpdatedEventSchema,
  stockChangedEventSchema,
  variantRestockedEventSchema,
  consentChangedEventSchema,
  segmentSavedEventSchema,
  importStartedEventSchema,
  importUndoRequestedEventSchema,
  knowledgeIndexRequestedEventSchema,
  campaignApprovedEventSchema,
  channelConnectedEventSchema,
  channelDisconnectedEventSchema,
  channelNeedsReconnectEventSchema,
  conversationStartedEventSchema,
  messageReceivedEventSchema,
  messageSendRequestedEventSchema,
  messageSentEventSchema,
  messageDeliveredEventSchema,
  messageReadEventSchema,
  messageFailedEventSchema,
  messageTappedEventSchema,
  messageOptedOutEventSchema,
  notificationCreatedEventSchema,
  orderStageChangedEventSchema,
  orderCodCollectedEventSchema,
  orderConfirmedEventSchema,
  orderCreatedEventSchema,
  orderEditedEventSchema,
  paymentFailedEventSchema,
  paymentSucceededEventSchema,
  paymentVerificationRequestedEventSchema,
]);

export type DaklyEvent = z.infer<typeof daklyEventSchema>;

import { z } from 'zod';

import { campaignApprovedEventSchema, campaignSentEventSchema } from './campaigns';
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
  conversationHandedOverEventSchema,
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
  productUpdatedEventSchema,
  stockChangedEventSchema,
  variantRestockedEventSchema,
} from './products';
import { postScheduledEventSchema } from './social';
import { walletCreditedEventSchema } from './wallets';

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
  campaignSentEventSchema,
  channelConnectedEventSchema,
  channelDisconnectedEventSchema,
  channelNeedsReconnectEventSchema,
  conversationStartedEventSchema,
  conversationHandedOverEventSchema,
  messageReceivedEventSchema,
  messageSendRequestedEventSchema,
  messageSentEventSchema,
  messageDeliveredEventSchema,
  messageReadEventSchema,
  messageFailedEventSchema,
  messageTappedEventSchema,
  messageOptedOutEventSchema,
  notificationCreatedEventSchema,
  walletCreditedEventSchema,
  orderStageChangedEventSchema,
  orderCodCollectedEventSchema,
  orderConfirmedEventSchema,
  orderCreatedEventSchema,
  orderEditedEventSchema,
  postScheduledEventSchema,
]);

export type DaklyEvent = z.infer<typeof daklyEventSchema>;

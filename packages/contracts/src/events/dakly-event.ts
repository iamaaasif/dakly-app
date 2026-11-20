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
  attributionCreatedEventSchema,
  attributionRemovedEventSchema,
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
import {
  postFailedEventSchema,
  postPublishedEventSchema,
  postScheduledEventSchema,
} from './social';
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
  attributionCreatedEventSchema,
  attributionRemovedEventSchema,
  postScheduledEventSchema,
  postPublishedEventSchema,
  postFailedEventSchema,
]);

export type DaklyEvent = z.infer<typeof daklyEventSchema>;

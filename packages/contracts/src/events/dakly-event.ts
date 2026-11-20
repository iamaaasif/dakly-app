import { z } from 'zod';

import { attributionOrdersRebuiltEventSchema } from './analytics';
import {
  campaignApprovalStartedEventSchema,
  campaignApprovedEventSchema,
  campaignSentEventSchema,
} from './campaigns';
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
  productImportStartedEventSchema,
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
  paymentFailedEventSchema,
  paymentSucceededEventSchema,
  paymentVerificationRequestedEventSchema,
} from './payments';
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
import {
  attributionRebuildContinuedEventSchema,
  attributionWindowChangedEventSchema,
} from './stores';
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
  productImportStartedEventSchema,
  importUndoRequestedEventSchema,
  knowledgeIndexRequestedEventSchema,
  campaignApprovalStartedEventSchema,
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
  attributionCreatedEventSchema,
  attributionRemovedEventSchema,
  attributionWindowChangedEventSchema,
  attributionRebuildContinuedEventSchema,
  attributionOrdersRebuiltEventSchema,
  postScheduledEventSchema,
  postPublishedEventSchema,
  postFailedEventSchema,
  paymentFailedEventSchema,
  paymentSucceededEventSchema,
  paymentVerificationRequestedEventSchema,
]);

export type DaklyEvent = z.infer<typeof daklyEventSchema>;

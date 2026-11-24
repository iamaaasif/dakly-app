import { z } from 'zod';

import { attributionOrdersRebuiltEventSchema } from './analytics';
import {
  subscriptionPastDueEventSchema,
  subscriptionReadOnlyEventSchema,
  subscriptionRenewedEventSchema,
} from './billing';
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
  contactErasedEventSchema,
  contactMergedEventSchema,
  contactMergeUndoneEventSchema,
  contactStatsRepairedEventSchema,
  contactTagAddedEventSchema,
  importStartedEventSchema,
  importUndoRequestedEventSchema,
  productImportStartedEventSchema,
  segmentSavedEventSchema,
} from './contacts';
import {
  dueAddedEventSchema,
  duePaymentRecordedEventSchema,
  dueReminderRequestedEventSchema,
  dueWrittenOffEventSchema,
} from './due-book';
import { khataPageQueuedEventSchema } from './khata-scans';
import { knowledgeIndexRequestedEventSchema } from './knowledge';
import {
  conversationHandedOverEventSchema,
  conversationStartedEventSchema,
  messageAttachmentsRequestedEventSchema,
  messageDeliveredEventSchema,
  messageFailedEventSchema,
  messageOptedOutEventSchema,
  messagePostbackReceivedEventSchema,
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
  orderImportedEventSchema,
  orderStageChangedEventSchema,
} from './orders';
import {
  paymentFailedEventSchema,
  paymentSucceededEventSchema,
  paymentVerificationRequestedEventSchema,
} from './payments';
import {
  productPhotoAddedEventSchema,
  productUpdatedEventSchema,
  stockChangedEventSchema,
  variantRestockedEventSchema,
} from './products';
import {
  commentReceivedEventSchema,
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
  contactErasedEventSchema,
  contactMergedEventSchema,
  contactMergeUndoneEventSchema,
  contactStatsRepairedEventSchema,
  contactTagAddedEventSchema,
  productUpdatedEventSchema,
  productPhotoAddedEventSchema,
  stockChangedEventSchema,
  variantRestockedEventSchema,
  consentChangedEventSchema,
  segmentSavedEventSchema,
  importStartedEventSchema,
  productImportStartedEventSchema,
  importUndoRequestedEventSchema,
  knowledgeIndexRequestedEventSchema,
  khataPageQueuedEventSchema,
  campaignApprovalStartedEventSchema,
  campaignApprovedEventSchema,
  campaignSentEventSchema,
  channelConnectedEventSchema,
  channelDisconnectedEventSchema,
  channelNeedsReconnectEventSchema,
  conversationStartedEventSchema,
  conversationHandedOverEventSchema,
  messageReceivedEventSchema,
  messagePostbackReceivedEventSchema,
  messageAttachmentsRequestedEventSchema,
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
  orderImportedEventSchema,
  orderEditedEventSchema,
  attributionCreatedEventSchema,
  attributionRemovedEventSchema,
  attributionWindowChangedEventSchema,
  attributionRebuildContinuedEventSchema,
  attributionOrdersRebuiltEventSchema,
  commentReceivedEventSchema,
  postScheduledEventSchema,
  postPublishedEventSchema,
  postFailedEventSchema,
  paymentFailedEventSchema,
  paymentSucceededEventSchema,
  paymentVerificationRequestedEventSchema,
  dueAddedEventSchema,
  duePaymentRecordedEventSchema,
  dueReminderRequestedEventSchema,
  dueWrittenOffEventSchema,
  subscriptionRenewedEventSchema,
  subscriptionPastDueEventSchema,
  subscriptionReadOnlyEventSchema,
]);

export type DaklyEvent = z.infer<typeof daklyEventSchema>;

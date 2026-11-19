import { z } from 'zod';

import { campaignApprovedEventSchema } from './campaigns';
import {
  channelConnectedEventSchema,
  channelDisconnectedEventSchema,
  channelNeedsReconnectEventSchema,
} from './channels';
import {
  consentChangedEventSchema,
  contactCreatedEventSchema,
  contactDeletedEventSchema,
  contactStatsRepairedEventSchema,
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

export const daklyEventSchema = z.discriminatedUnion('type', [
  contactCreatedEventSchema,
  contactDeletedEventSchema,
  contactStatsRepairedEventSchema,
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
]);

export type DaklyEvent = z.infer<typeof daklyEventSchema>;

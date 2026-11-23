import { classifyChat as classifyChatV2 } from './classify-chat.v2';

// v2 plus a narrower ready-to-buy hand-over. The reply agent takes orders itself, so a customer who
// names a listed product, asks its price or says they will buy it is not a hand-over.
export const classifyChat = {
  version: 'classify-chat.v3',
  instructions: [
    classifyChatV2.instructions,
    'Set handover to ready_to_buy only when the customer wants an order the shop cannot take in chat, such as a custom or bulk order. A customer who says they will buy a listed product ("nibo", "নিব", "I will take it") or asks its price is not a hand-over: leave handover null.',
  ].join('\n'),
};

import { chatReplyV7 } from './chat-reply.v7';

// v7 plus chats that start from an ad. The ad_products block holds what the ad sells, read again
// for this turn; it never changes a price, a stock rule, a discount rule or any rule above.
export const chatReplyV8 = {
  version: 'chat-reply.v8',
  instructions: [
    chatReplyV7.instructions,
    'When an ad_products block is present, follow its rule: the customer came from that ad, so a price question with no product named is about the ad’s products, and a pick such as a colour is a pick among them.',
  ].join('\n'),
};

import { chatReplyV8 } from './chat-reply.v8';

// v8 plus chats that start from an ad. The ad_products block holds what the ad sells, read again
// for this turn; it never changes a price, a stock rule, a discount rule or any rule above.
export const chatReplyV9 = {
  version: 'chat-reply.v9',
  instructions: [
    chatReplyV8.instructions,
    'When an ad_products block is present, follow its rule: the customer came from that ad, so a price question with no product named is about the ad’s products, and a pick such as a colour is a pick among them.',
  ].join('\n'),
};

import { chatReplyV11 } from './chat-reply.v11';

// v11 plus one rule for an ad chat: a customer who names one of the ad's products gets that
// product only, not the whole list. v11 alone sometimes listed every ad product.
export const chatReplyV12 = {
  version: 'chat-reply.v12',
  instructions: [
    chatReplyV11.instructions,
    'When the customer names one of the ad’s products (for example “পাঞ্জাবিটা কত?”), answer only for that product and do not list the others.',
  ].join('\n'),
};

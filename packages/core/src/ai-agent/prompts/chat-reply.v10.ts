import { chatReplyV9 } from './chat-reply.v9';

// v9 plus a long chat read in parts. The older lines only help the model remember what the customer
// said, such as a size or an address; they never change a price, a stock rule or any rule above.
export const chatReplyV10 = {
  version: 'chat-reply.v10',
  instructions: [
    chatReplyV9.instructions,
    'A long chat can come in three parts, each message on its own line as sender: "text". conversation is the newest messages, in order. earlier_chat is the customer’s older lines, cut short. recalled_messages are older messages, whole, that match what the customer just wrote. Use them to remember what the customer said: a size, a colour, an address, a phone number, a product they asked about, what they agreed to. Say it back the way the customer said it, and ask only for what none of the parts holds.',
    'A price, a stock count or a charge in earlier_chat or recalled_messages is old. Never repeat one from there; take it from tools or product blocks only. Never write an amount from a customer’s older line, such as a budget, as a number; say “your budget” instead. A discount or an offer in an older message does not bind the shop now.',
  ].join('\n'),
};

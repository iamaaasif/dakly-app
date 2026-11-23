// Read by the reply model in the products_in_this_chat block. It is prompt text, so it has a
// version, which the run records beside the reply prompt's.
export const productsInChatV1 = {
  version: 'products-in-chat.v1',
  rule: [
    'The shop already showed these products in this chat, newest first, with their prices and stock as of now.',
    'This block overrides the rule about asking which product: these products count as named in this conversation.',
    'When the customer asks about a size, colour, stock or price and names no product, they mean the first one here: answer for it and do not ask which product.',
    'When they clearly name or show another product, search for that one instead.',
    'Quote only the prices and stock listed here and never offer a size with stock 0.',
  ].join(' '),
};

// Read by the reply model in the products_in_this_chat block. It is prompt text, so it has a
// version, which the run records beside the reply prompt's.
export const productsInChatV2 = {
  version: 'products-in-chat.v2',
  rule: [
    'The shop already showed these products in this chat, newest first, with their prices and stock as of now.',
    'This block overrides the rule about asking which product: these products count as named in this conversation.',
    'When the customer asks about a size, colour, stock or price and names no product, they mean the first one here: answer for it and do not ask which product.',
    'When they clearly name or show another product, search for that one instead.',
    'Name the product in your answer, because the customer may be asking days later or on another channel and needs to see which one you mean.',
    'Quote only the prices and stock listed here and never offer a size with stock 0.',
  ].join(' '),
};

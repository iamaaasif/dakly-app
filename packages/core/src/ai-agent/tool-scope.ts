// The agent job supplies both ids. No tool argument can name another store or customer.
export type ToolScope = {
  storeId: string;
  contactId: string;
  // A practice question has no chat, so it can read but cannot take an order.
  chat?: {
    conversationId: string;
    channel: 'messenger' | 'instagram';
    discountAskMessageId?: string | undefined;
    requestedPricePoisha?: number | undefined;
  };
  // Set while the chat is answered from an ad: search and product reads stay inside these products.
  adProductIds?: readonly string[];
  // The owner's Suggest add-ons switch; confirming an order then returns what goes with it.
  suggestAddOns?: boolean;
};

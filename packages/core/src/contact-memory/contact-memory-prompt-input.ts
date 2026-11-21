import type { MemoryWork } from './contact-memory.repository';

const messageTextLimit = 500;

// The JSON the model reads. The service and the model eval build it the same way.
export function memoryPromptInput(work: MemoryWork) {
  return {
    memory: work.memory,
    new_customer_messages: work.messages
      .filter((message) => message.text.trim())
      .map(({ id, at, text }) => ({ id, at, text: text.slice(0, messageTextLimit) })),
    new_orders: work.orders.map(({ id, at, deliveryArea, items }) => ({
      id,
      at,
      items,
      ...(deliveryArea ? { delivery_area: deliveryArea } : {}),
    })),
  };
}

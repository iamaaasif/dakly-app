import { z } from 'zod';

// Length and facts are checked in code before sending, so the schema only asks for text.
export const chatReplyOutputSchema = z.strictObject({ reply: z.string().trim().min(1) });

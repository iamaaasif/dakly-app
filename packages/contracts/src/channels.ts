export const channelConnectionKinds = ['facebook_page', 'instagram', 'whatsapp'] as const;
export const channelConnectionStatuses = ['active', 'needs_reconnect', 'disconnected'] as const;
// Chat channels. SMS is sent through Dakly's own SMS driver and is never a chat.
export const chatChannels = ['messenger', 'instagram', 'whatsapp'] as const;
export const smsSenderIdStatuses = ['requested', 'in_review', 'approved', 'rejected'] as const;

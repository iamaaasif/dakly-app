export type EmailMessage = { to: string; subject: string; text: string; html?: string };
export type EmailDriver = { send(message: EmailMessage): Promise<void> };

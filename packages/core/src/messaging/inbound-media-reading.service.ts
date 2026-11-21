import { Inject, Injectable } from '@nestjs/common';

import {
  inboundAttachmentLimits,
  photoReadingSchema,
  type MessageAttachment,
  type PhotoReading,
} from '@dakly/contracts/chats';
import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';
import type { LlmImage, LlmTranscriptionRequest } from '@dakly/providers/llm/llm-driver';

import { AiService } from '../ai/ai.service';
import { FILE_STORAGE_DRIVER } from '../platform/file-storage/file-storage.provider';
import { UsageService } from '../usage/usage.service';
import { InboundAttachmentsRepository } from './inbound-attachments.repository';
import { messagingError } from './messaging.errors';
import { readCustomerPhoto } from './prompts/read-customer-photo.v1';
import { transcribeVoiceNoteHint } from './prompts/transcribe-voice-note.v1';

type Stored = Extract<MessageAttachment, { status: 'stored' }>;
type Target = { storeId: string; messageId: string; index: number; attachment: Stored };
type Reading = { kind: 'read'; text: string | undefined } | { kind: 'retry' } | { kind: 'failed' };

// Both are down for a moment, not for this file, so the queue should try again.
const transientFailures = new Set([
  'AI_PAUSED',
  'AI_STORE_BUSY',
  'LLM_TIMEOUT',
  'LLM_RATE_LIMITED',
  'LLM_UNAVAILABLE',
  'LLM_REQUEST_FAILED',
  'LLM_INVALID_RESPONSE',
]);

@Injectable()
export class InboundMediaReadingService {
  constructor(
    @Inject(InboundAttachmentsRepository) private readonly repository: InboundAttachmentsRepository,
    @Inject(AiService) private readonly ai: AiService,
    @Inject(UsageService) private readonly usage: UsageService,
    @Inject(FILE_STORAGE_DRIVER) private readonly storage: FileStorageDriver,
  ) {}

  // The text lands on the message, so staff and the AI read the same words. Runs outside any
  // transaction. A model outage throws so the queue retries; the last attempt gives up.
  async read(storeId: string, messageId: string, finalAttempt: boolean): Promise<void> {
    const message = await this.repository.find(storeId, messageId);
    if (!message) return;
    let retry = false;
    for (const [index, attachment] of message.attachments.entries()) {
      if (attachment.status !== 'stored' || attachment.read) continue;
      const target = { storeId, messageId, index, attachment };
      const reading = await this.readOne(target, message.body);
      if (reading.kind === 'retry' && !finalAttempt) retry = true;
      else
        await this.repository.saveReading(
          storeId,
          messageId,
          index,
          reading.kind === 'read' ? { read: 'done', text: reading.text } : { read: 'failed' },
        );
    }
    if (retry) throw messagingError('MEDIA_READING_UNAVAILABLE');
  }

  private async readOne(
    { storeId, messageId, index, attachment }: Target,
    caption: string | null,
  ): Promise<Reading> {
    if (attachment.kind !== 'voice' && attachment.kind !== 'image') return { kind: 'failed' };
    // One unit per file. Without allowance the file stays unread: the AI is paused anyway and
    // a retry would find the same empty allowance.
    const usageReference = `media:${messageId}:${index}`;
    if (
      !(await this.usage.isConsumed(storeId, 'ai_conversation', usageReference)) &&
      !(await this.usage.hasAllowance(storeId, 'ai_conversation', 1))
    )
      return { kind: 'failed' };
    const file = await this.storage.readBytes(
      attachment.objectKey,
      inboundAttachmentLimits[attachment.kind].maxBytes,
    );
    if (file.kind !== 'found') return { kind: 'failed' };
    const media = { contentType: attachment.contentType, bytes: file.bytes };
    return attachment.kind === 'voice'
      ? this.transcribe(storeId, media, usageReference)
      : this.describe(storeId, media, caption, usageReference);
  }

  private async transcribe(
    storeId: string,
    audio: LlmTranscriptionRequest['audio'],
    usageReference: string,
  ): Promise<Reading> {
    const result = await this.ai.transcribe(storeId, {
      audio,
      hint: transcribeVoiceNoteHint,
      usageReference,
    });
    if (result.kind === 'failure') return failed(result.code);
    return { kind: 'read', text: result.text ? `Voice note: ${result.text}` : undefined };
  }

  private async describe(
    storeId: string,
    image: LlmImage,
    caption: string | null,
    usageReference: string,
  ) {
    const result = await this.ai.run(storeId, {
      tier: 'vision',
      purpose: 'describe_image',
      usageReference,
      prompt: readCustomerPhoto,
      input: JSON.stringify({ customer_message: caption ?? '' }),
      images: [image],
      output: photoReadingSchema,
    });
    if (result.kind === 'output') return { kind: 'read', text: photoText(result.output) } as const;
    return failed(result.kind === 'failure' ? result.code : undefined);
  }
}

function failed(code: string | undefined): Reading {
  return { kind: code && transientFailures.has(code) ? 'retry' : 'failed' };
}

// Plain text, so the inbox shows it as is and a product search can match on the words.
function photoText({ subject, description, searchWords, visibleText }: PhotoReading): string {
  const label = subject === 'payment_screenshot' ? 'Payment screenshot' : 'Photo';
  const lines = [`${label}: ${description}`];
  if (searchWords.length) lines.push(`Search words: ${searchWords.join(', ')}`);
  if (visibleText) lines.push(`Text in photo: ${visibleText}`);
  return lines.join('\n');
}

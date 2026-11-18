import { Inject, Injectable } from '@nestjs/common';
import { getResolvedPDFJS } from 'unpdf';

import { knowledgeFileBytes } from '@dakly/contracts/knowledge';
import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';

import { FILE_STORAGE_DRIVER } from '../../platform/file-storage/file-storage.provider';
import { AiService } from '../ai.service';
import { KnowledgeRepository, type KnowledgeChunk } from './knowledge.repository';

const textLimit = 200_000;

type FileText = { text: string } | { rejection: string };

@Injectable()
export class KnowledgeIndexService {
  constructor(
    @Inject(KnowledgeRepository) private readonly repository: KnowledgeRepository,
    @Inject(FILE_STORAGE_DRIVER) private readonly storage: FileStorageDriver,
    @Inject(AiService) private readonly ai: AiService,
  ) {}

  async index(storeId: string, itemId: string): Promise<void> {
    const item = await this.repository.find(storeId, itemId);
    if (!item || item.status !== 'processing') return;
    const source = item.fileId
      ? await this.fileText(storeId, item.fileId)
      : { text: item.answer ?? '' };
    const rejection = 'rejection' in source ? source.rejection : 'knowledge_file_empty';
    const passages =
      'text' in source ? splitKnowledgeText(source.text.replaceAll('\u0000', '')) : [];

    const chunks: KnowledgeChunk[] = [];
    for (const content of passages) {
      const { embedding, model, usage } = await this.ai.embed(storeId, content);
      chunks.push({ content, embedding, embeddingModel: model, tokenCount: usage.inputTokens });
    }

    await this.repository.finishIndex(
      storeId,
      item.id,
      item.updatedAt,
      chunks.length ? { chunks } : { rejection },
    );
  }

  private async fileText(storeId: string, fileId: string): Promise<FileText> {
    const file = await this.repository.findFile(storeId, fileId);
    if (!file) return { rejection: 'knowledge_file_missing' };
    if (file.sizeBytes > knowledgeFileBytes) return { rejection: 'knowledge_file_size_limit' };
    const stored = await this.storage.readBytes(file.objectKey, file.sizeBytes);
    if (stored.kind === 'too_large') return { rejection: 'knowledge_file_size_limit' };
    if (stored.kind === 'missing') return { rejection: 'knowledge_file_missing' };
    if (stored.bytes.length !== file.sizeBytes) return { rejection: 'knowledge_file_invalid' };
    try {
      if (file.contentType === 'application/pdf') return await readPdf(stored.bytes);
      const text = new TextDecoder('utf-8', { fatal: true }).decode(stored.bytes);
      return text.length > textLimit ? { rejection: 'knowledge_file_text_limit' } : { text };
    } catch {
      return { rejection: 'knowledge_file_invalid' };
    }
  }
}

async function readPdf(bytes: Uint8Array): Promise<FileText> {
  const { getDocument } = await getResolvedPDFJS();
  const loading = getDocument({
    data: new Uint8Array(bytes),
    useWorkerFetch: false,
    useSystemFonts: false,
    verbosity: 0,
  });
  try {
    const pdf = await loading.promise;
    if (pdf.numPages > 100) return { rejection: 'knowledge_file_page_limit' };
    let text = '';
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const reader = page.streamTextContent().getReader();
      const pageText = await readPdfPage(reader, textLimit - text.length);
      if (pageText === null) return { rejection: 'knowledge_file_text_limit' };
      text += pageText;
      page.cleanup();
    }
    return { text };
  } finally {
    await loading.destroy();
  }
}

async function readPdfPage(
  reader: ReadableStreamDefaultReader<{
    items: Array<{ str?: string; hasEOL?: boolean } | object>;
  }>,
  limit: number,
): Promise<string | null> {
  let text = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return text;
    for (const item of value.items) {
      if (!('str' in item) || typeof item.str !== 'string') continue;
      text += item.str + ('hasEOL' in item && item.hasEOL ? '\n' : ' ');
      if (text.length <= limit) continue;
      await reader.cancel();
      return null;
    }
  }
}

const chunkBytes = 2000;
const words = new Intl.Segmenter('bn', { granularity: 'word' });

export function splitKnowledgeText(text: string): string[] {
  const chunks: string[] = [];
  let chunk = '';
  let bytes = 0;
  function append(segment: string): void {
    const length = Buffer.byteLength(segment);
    if (bytes + length > chunkBytes) {
      chunks.push(chunk.trim());
      chunk = '';
      bytes = 0;
    }
    chunk += segment;
    bytes += length;
  }

  for (const { segment } of words.segment(text.trim())) {
    if (Buffer.byteLength(segment) <= chunkBytes) append(segment);
    else for (const codePoint of segment) append(codePoint);
  }
  chunks.push(chunk.trim());
  return chunks.filter(Boolean);
}

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { photoReadingSchema } from '@dakly/contracts/chats';
import { LlmError, type LlmDriver } from '@dakly/providers/llm/llm-driver';

import { readCustomerPhoto } from '../../messaging/prompts/read-customer-photo.v1';
import { transcribeVoiceNoteHint } from '../../messaging/prompts/transcribe-voice-note.v1';
import { transcribePerMinute } from './candidate-prices';
import type { EvalMeter } from './eval-meter';
import { meteredRespond } from './reply-pipeline';

const fixtures = path.resolve(__dirname, '../../../src/ai-eval/model-eval/fixtures');
const TIMEOUT_MS = 90_000;

// A photo passes when it is read as a product, names the item and gets the colour right.
const photoCases = [
  { file: 'kurti-red-floral', item: ['kurti', 'কুর্তি', 'kurta'], colour: ['red', 'লাল'] },
  { file: 'loafer-brown', item: ['loafer', 'লোফার'], colour: ['brown', 'বাদামি'] },
  { file: 'panjabi-red', item: ['panjabi', 'punjabi', 'পাঞ্জাবি', 'kurta'], colour: ['red', 'লাল'] },
  { file: 'saree-green', item: ['saree', 'sari', 'শাড়ি'], colour: ['green', 'সবুজ'] },
  { file: 'sneakers-white', item: ['sneaker', 'স্নিকার্স'], colour: ['white', 'সাদা'] },
];

export type MediaScore = { passed: number; total: number; failures: string[] };

export async function runVisionEval(
  driver: LlmDriver,
  meter: EvalMeter,
  model: string,
): Promise<MediaScore> {
  const failures: string[] = [];
  for (const { file, item, colour } of photoCases) {
    const bytes = readFileSync(path.join(fixtures, `${file}.jpg`));
    try {
      const result = await meteredRespond(driver, meter, `vision:${model}`, {
        model,
        instructions: readCustomerPhoto.instructions,
        input: JSON.stringify({ customer_message: '' }),
        images: [{ contentType: 'image/jpeg', bytes }],
        output: photoReadingSchema,
        timeoutMs: TIMEOUT_MS,
      });
      const reading =
        result.kind === 'output' ? photoReadingSchema.safeParse(result.output) : undefined;
      if (!reading?.success) {
        failures.push(file);
        continue;
      }
      const text = [...reading.data.searchWords, reading.data.description].join(' ').toLowerCase();
      const found = (words: string[]) => words.some((word) => text.includes(word));
      if (reading.data.subject !== 'product' || !found(item) || !found(colour)) failures.push(file);
    } catch (error) {
      if (!(error instanceof LlmError)) throw error;
      failures.push(file);
    }
  }
  return { passed: photoCases.length - failures.length, total: photoCases.length, failures };
}

// Every group must be heard: one of its spellings has to appear. Prices and names are the part a
// shop acts on, so these are what a transcript is judged on.
const voiceCases = [
  {
    file: 'panjabi-price-bn',
    minutes: 0.1,
    keys: [
      ['পাঞ্জাবি', 'পাঞ্জাবী', 'panjabi', 'punjabi'],
      ['দাম', 'dam'],
      ['ঢাকা', 'dhaka'],
    ],
  },
  {
    file: 'order-kurti-bn',
    minutes: 0.15,
    keys: [
      ['কুর্তি', 'kurti'],
      ['রহিমা', 'rahima'],
      ['অর্ডার', 'order'],
    ],
  },
  {
    file: 'polo-xl-bn',
    minutes: 0.08,
    keys: [
      ['পোলো', 'polo'],
      ['এক্সএল', 'xl'],
      ['দাম', 'dam'],
    ],
  },
  {
    file: 'sneakers-banglish',
    minutes: 0.08,
    keys: [
      ['sneakers', 'স্নিকার্স', 'sneaker'],
      ['dam', 'দাম'],
    ],
  },
  {
    file: 'saree-delivery-banglish',
    minutes: 0.1,
    keys: [
      ['saree', 'শাড়ি', 'sari'],
      ['delivery', 'ডেলিভারি'],
      ['order', 'অর্ডার'],
    ],
  },
  {
    file: 'refund-bn',
    minutes: 0.07,
    keys: [
      ['ফেরত', 'ferot', 'refund'],
      ['ভেঙে', 'ভাঙা', 'ভেঙ্গে'],
    ],
  },
];

export async function runTranscribeEval(
  driver: LlmDriver,
  meter: EvalMeter,
  model: string,
): Promise<MediaScore> {
  const failures: string[] = [];
  for (const { file, minutes, keys } of voiceCases) {
    const audio = {
      contentType: 'audio/mpeg',
      bytes: readFileSync(path.join(fixtures, `${file}.mp3`)),
    };
    try {
      const result = await driver.transcribe({
        model,
        audio,
        hint: transcribeVoiceNoteHint,
        timeoutMs: TIMEOUT_MS,
      });
      meter.recordFlat(`transcribe:${model}`, (transcribePerMinute[model] ?? 0) * minutes);
      const text = result.text.toLowerCase().replace(/[\s,.?।-]/g, '');
      const heard = keys.every((group) =>
        group.some((spelling) => text.includes(spelling.toLowerCase())),
      );
      if (!heard) failures.push(`${file}: "${result.text}"`);
    } catch (error) {
      if (!(error instanceof LlmError)) throw error;
      failures.push(`${file}: ${error.code}`);
    }
  }
  return { passed: voiceCases.length - failures.length, total: voiceCases.length, failures };
}

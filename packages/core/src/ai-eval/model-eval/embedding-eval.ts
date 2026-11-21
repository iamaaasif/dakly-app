import type { LlmDriver } from '@dakly/providers/llm/llm-driver';

import type { EvalMeter } from './eval-meter';

const TIMEOUT_MS = 60_000;

// What an owner types for a product: a Bangla or English name, a category and a short description.
const documents = [
  'কুর্তি — মেয়েদের পোশাক — লাল রঙের কুর্তি, সাদা ফুলের নকশা',
  'লাল পাঞ্জাবি — ছেলেদের পোশাক — লাল সুতির পাঞ্জাবি',
  'শাড়ি — মেয়েদের পোশাক — জামদানি স্টাইল শাড়ি',
  'থ্রি পিস — মেয়েদের পোশাক — কটন থ্রি পিস সেট',
  'পোলো শার্ট — ছেলেদের পোশাক — কটন পোলো শার্ট',
  'ক্যানভাস জুতা — জুতা — আরামদায়ক ক্যানভাস জুতা',
  'স্নিকার্স — জুতা — স্পোর্টস স্নিকার্স জুতা',
  'লোফার — জুতা — চামড়ার লোফার জুতা',
  'ডেনিম জ্যাকেট — ছেলেদের পোশাক — ডেনিম জ্যাকেট',
  'হ্যান্ডব্যাগ — ব্যাগ — মেয়েদের চামড়ার হ্যান্ডব্যাগ',
  'ব্যাকপ্যাক — ব্যাগ — স্কুল ও অফিসের ব্যাকপ্যাক',
  'ঘড়ি — এক্সেসরিজ — ছেলেদের হাতঘড়ি',
  'সানগ্লাস — এক্সেসরিজ — রোদচশমা',
  'বেডশিট — ঘর সাজানো — ডাবল বেডের কটন বেডশিট',
  'কম্বল — ঘর সাজানো — শীতের নরম কম্বল',
  'হিজাব — মেয়েদের পোশাক — সফট জর্জেট হিজাব',
  'বোরকা — মেয়েদের পোশাক — নিদা কাপড়ের বোরকা',
  'ফতুয়া — ছেলেদের পোশাক — সুতির ফতুয়া',
  'লুঙ্গি — ছেলেদের পোশাক — সুতির লুঙ্গি',
  'পাওয়ার ব্যাংক — ইলেকট্রনিক্স — ১০০০০ এমএএইচ পাওয়ার ব্যাংক',
  'ইয়ারবাড — ইলেকট্রনিক্স — ব্লুটুথ ইয়ারবাড',
  'ফোন কভার — ইলেকট্রনিক্স — মোবাইল ফোনের কভার',
  'শিশুদের ফ্রক — শিশুদের পোশাক — মেয়েশিশুর ফ্রক',
  'মধু — খাবার — খাঁটি সুন্দরবনের মধু',
  'ঘি — খাবার — খাঁটি গাওয়া ঘি',
];

// The second number is the document the query is about.
const queries: [string, number][] = [
  ['কুর্তি আছে?', 0],
  ['kurti ache?', 0],
  ['kurtee koto taka', 0],
  ['লাল ফুলের জামা', 0],
  ['মেয়েদের লাল কামিজ', 0],
  ['panjabi lal', 1],
  ['লাল পাঞ্জাবির দাম কত', 1],
  ['punjabi chai', 1],
  ['eid er jonno ছেলেদের লাল পোশাক', 1],
  ['sharee dekhan', 2],
  ['জামদানি শাড়ি', 2],
  ['sari ache', 2],
  ['বিয়ের শাড়ি', 2],
  ['thri pis ache?', 3],
  ['থ্রিপিস সেট', 3],
  ['three piece cotton', 3],
  ['polo shirt', 4],
  ['পোলো টি শার্ট', 4],
  ['collar tshirt ache', 4],
  ['ক্যানভাস শু', 5],
  ['canvas jutha', 5],
  ['sneakers ache?', 6],
  ['স্পোর্টস শু', 6],
  ['running joota', 6],
  ['loafer nai? kobe asbe', 7],
  ['চামড়ার জুতা', 7],
  ['leather shoes brown', 7],
  ['denim jacket', 8],
  ['জিনসের জ্যাকেট', 8],
  ['handbag ache', 9],
  ['মেয়েদের ব্যাগ', 9],
  ['school bag', 10],
  ['bag pack dekhan', 10],
  ['hat ghori', 11],
  ['রোদের চশমা', 12],
  ['chosma koto', 12],
  ['bedsheet double', 13],
  ['শীতের কাপড় কম্বল', 14],
  ['hijab ache', 15],
  ['burka dam koto', 16],
  ['fotua', 17],
  ['lungi', 18],
  ['power bank', 19],
  ['bluetooth earbuds', 20],
  ['phone er cover', 21],
  ['baby frock', 22],
  ['মধু আছে?', 23],
  ['pure ghee', 24],
];

const TOP = 3;
export type EmbeddingScore = { top1: number; top3: number; total: number; misses: string[] };

function cosine(a: number[], b: number[]) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const [index, value] of a.entries()) {
    const other = b[index] ?? 0;
    dot += value * other;
    normA += value * value;
    normB += other * other;
  }
  return dot / Math.sqrt(normA * normB);
}

export async function runEmbeddingEval(
  driver: LlmDriver,
  meter: EvalMeter,
  model: string,
): Promise<EmbeddingScore> {
  const embedded = await driver.embed({
    model,
    input: [...documents, ...queries.map(([text]) => text)],
    timeoutMs: TIMEOUT_MS,
  });
  meter.record(`embed:${model}`, model, embedded.usage);
  const documentVectors = embedded.embeddings.slice(0, documents.length);
  let top1 = 0;
  let top3 = 0;
  const misses: string[] = [];
  for (const [index, [text, expected]] of queries.entries()) {
    const vector = embedded.embeddings[documents.length + index] ?? [];
    const ranked = documentVectors
      .map((candidate, id) => ({ id, score: cosine(vector, candidate) }))
      .sort((a, b) => b.score - a.score)
      .map(({ id }) => id);
    if (ranked[0] === expected) top1 += 1;
    if (ranked.slice(0, TOP).includes(expected)) top3 += 1;
    else misses.push(text);
  }
  return { top1, top3, total: queries.length, misses };
}

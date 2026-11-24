import type { ConversationEntry } from './chat-memory';

// How much of a chat the reply model reads. The newest messages come whole, up to a token budget.
// Older messages are never dropped: the customer's own older lines stay as short digest lines, and
// the older messages closest to what the customer just wrote come back whole.
export const RECENT_TOKEN_BUDGET = 900;
export const DIGEST_TOKEN_BUDGET = 300;
export const RECALL_COUNT = 4;
const DIGEST_LINE_LENGTH = 90;
const MIN_RECALL_SCORE = 1.5;
const MIN_DIGEST_LINE = 12;
const PHONE_LINE = /(?:[0-9০-৯][\s-]?){10,}/;

// No tokenizer runs here, so Bangla script is counted high on purpose: it costs about one token
// per character, Latin text about one per four.
export function estimateTokens(text: string): number {
  let tokens = 0;
  for (const character of text) tokens += character.charCodeAt(0) < 0x250 ? 0.25 : 0.8;
  return Math.ceil(tokens) + 4;
}

export type ConversationWindow = {
  recent: ConversationEntry[];
  digest: ConversationEntry[];
  recalled: ConversationEntry[];
};

export function windowConversation(
  entries: readonly ConversationEntry[],
  latestTexts: readonly string[],
): ConversationWindow {
  let used = 0;
  let start = entries.length;
  while (start > 0) {
    const cost = estimateTokens(entries[start - 1]?.text ?? '');
    // The latest messages always come whole, however long.
    if (used + cost > RECENT_TOKEN_BUDGET && entries.length - start > 0) break;
    used += cost;
    start -= 1;
  }
  const older = entries.slice(0, start);
  const recalled = recall(older, latestTexts.join(' '));
  return {
    recent: entries.slice(start),
    digest: digestOf(older, recalled),
    recalled,
  };
}

// Older customer lines, cut short, oldest first. A line with a phone number is always kept, and a
// one-word line such as "ok" never takes room. The rest come newest first until the budget is used.
function digestOf(older: readonly ConversationEntry[], recalled: readonly ConversationEntry[]) {
  const candidates = older.filter(
    (entry) => entry.from === 'customer' && !recalled.includes(entry),
  );
  const chosen = new Set(candidates.filter(({ text }) => PHONE_LINE.test(text)).slice(-3));
  let used = [...chosen].reduce((sum, { text }) => sum + estimateTokens(cut(text)), 0);
  for (const entry of candidates.toReversed()) {
    if (chosen.has(entry) || entry.text.length < MIN_DIGEST_LINE) continue;
    used += estimateTokens(cut(entry.text));
    if (used > DIGEST_TOKEN_BUDGET) break;
    chosen.add(entry);
  }
  return candidates
    .filter((entry) => chosen.has(entry))
    .map(({ from, text }) => ({ from, text: cut(text) }));
}

const cut = (text: string) =>
  text.length > DIGEST_LINE_LENGTH ? `${text.slice(0, DIGEST_LINE_LENGTH)}…` : text;

// Older messages that share rare words, or spelling pieces, with the latest words. Spelling pieces
// (three letters) let "mirpur" find "Mirpur-10" and "মিরপুর" find "মিরপুরে".
function recall(older: readonly ConversationEntry[], query: string): ConversationEntry[] {
  const queryPieces = piecesOf(query);
  if (!queryPieces.size || !older.length) return [];
  const pieces = older.map(({ text }) => piecesOf(text));
  const spread = new Map<string, number>();
  for (const set of pieces)
    for (const piece of set) spread.set(piece, (spread.get(piece) ?? 0) + 1);
  const scored = older.map((entry, index) => {
    let score = 0;
    for (const piece of queryPieces)
      if (pieces[index]?.has(piece)) score += Math.log(1 + older.length / (spread.get(piece) ?? 1));
    return { entry, index, score };
  });
  return scored
    .filter(({ score }) => score >= MIN_RECALL_SCORE)
    .sort((left, right) => right.score - left.score)
    .slice(0, RECALL_COUNT)
    .sort((left, right) => left.index - right.index)
    .map(({ entry }) => entry);
}

function piecesOf(text: string): Set<string> {
  const pieces = new Set<string>();
  for (const word of text.toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u)) {
    if (word.length < 3) continue;
    for (let at = 0; at + 3 <= word.length; at += 1) pieces.add(word.slice(at, at + 3));
  }
  return pieces;
}

const lines = (entries: readonly ConversationEntry[]) =>
  entries.map(({ from, text }) => `${from}: ${JSON.stringify(text)}`).join('\n');

// The blocks of the prompt, one line per message: shorter than JSON objects, and a quoted text
// cannot pass as a line of its own. Earlier lines come first and are labelled, so the model reads
// them as the past and never as a source for a price, a stock count or a charge.
export function conversationBlocks(window: ConversationWindow): string[] {
  const note = 'Older lines of this same chat. Never a source for prices, stock or charges.';
  return [
    ...(window.digest.length
      ? [`<earlier_chat untrusted="true" note="${note}">\n${lines(window.digest)}\n</earlier_chat>`]
      : []),
    ...(window.recalled.length
      ? [
          `<recalled_messages untrusted="true" note="${note}">\n${lines(window.recalled)}\n</recalled_messages>`,
        ]
      : []),
    `<conversation untrusted="true">\n${lines(window.recent)}\n</conversation>`,
  ];
}

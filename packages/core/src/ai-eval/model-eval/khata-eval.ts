import { readFileSync } from 'node:fs';
import path from 'node:path';

import { KHATA_CONFIDENCE_THRESHOLD, khataModelOutputSchema } from '@dakly/contracts/khata-scans';
import { LlmError, type LlmDriver } from '@dakly/providers/llm/llm-driver';

import {
  addKhataTurn,
  MAX_KHATA_READS,
  prepareKhataPhoto,
  type KhataTurn,
} from '../../khata-scans/khata-photo';
import { readKhataRows, type ReadKhataRow } from '../../khata-scans/khata-row-reading';
import { readKhataPage } from '../../khata-scans/prompts/read-khata-page.v3';
import type { EvalMeter } from './eval-meter';
import type { MediaScore } from './media-eval';
import { meteredRespond } from './reply-pipeline';

const fixtures = path.resolve(__dirname, '../../../src/ai-eval/model-eval/fixtures');
const TIMEOUT_MS = 120_000;
const today = new Date('2026-11-21T04:00:00Z');

export type ExpectedKhataRow = {
  name: string;
  amountPoisha: number;
  entryDate?: string;
  phone?: string;
};

// The pages are typeset in Bangla, Banglish and mixed script on ruled paper. Two are sideways.
export const khataCases: { file: string; expected: ExpectedKhataRow[] }[] = [
  {
    file: 'khata-bangla-upright',
    expected: [
      { name: 'রহিম', amountPoisha: 125_000, entryDate: '2026-11-12' },
      { name: 'করিম', amountPoisha: 80_000, entryDate: '2026-11-05' },
      { name: 'শিউলি', amountPoisha: 35_000, entryDate: '2026-11-10', phone: '01712345678' },
    ],
  },
  {
    file: 'khata-banglish-upright',
    expected: [
      { name: 'rahim', amountPoisha: 50_000, entryDate: '2026-11-12' },
      { name: 'mitu', amountPoisha: 95_000, phone: '01556781230' },
      { name: 'jahan', amountPoisha: 120_000, entryDate: '2026-11-03' },
    ],
  },
  {
    file: 'khata-mixed-upright',
    expected: [
      { name: 'rina', amountPoisha: 20_000, entryDate: '2026-11-10' },
      { name: 'সুমন', amountPoisha: 50_000, phone: '01799887766' },
      { name: 'karim', amountPoisha: 150_000 },
    ],
  },
  {
    file: 'khata-sideways-turned',
    expected: [
      { name: 'করিম', amountPoisha: 65_000, entryDate: '2026-11-07' },
      { name: 'নাসরিন', amountPoisha: 220_000, entryDate: '2026-11-14' },
    ],
  },
  {
    file: 'khata-sideways-exif',
    expected: [
      { name: 'সুমন', amountPoisha: 20_000, entryDate: '2026-10-20' },
      { name: 'ফাতেমা', amountPoisha: 95_000, entryDate: '2026-11-02', phone: '01812345678' },
    ],
  },
  {
    file: 'khata-month-heading',
    expected: [
      { name: 'সুমন', amountPoisha: 100_000, entryDate: '2026-05-16' },
      { name: 'রুবি', amountPoisha: 20_000, entryDate: '2026-06-20' },
    ],
  },
];

const sureRow = (row: ReadKhataRow) => row.confidence >= KHATA_CONFIDENCE_THRESHOLD;
const MONTH_WORDS = ['মাসের', 'মাস', 'মে', 'জুন', 'জুলাই', 'may', 'jun', 'jul'];

function wrongDetail(found: ReadKhataRow, wanted: ExpectedKhataRow): string | undefined {
  if (!sureRow(found)) return undefined;
  if (wanted.entryDate && found.entryDate !== wanted.entryDate)
    return `${wanted.name} date ${found.entryDate} not ${wanted.entryDate}`;
  if (wanted.phone && found.phone !== wanted.phone)
    return `${wanted.name} phone ${found.phone} not ${wanted.phone}`;
  return undefined;
}

function wrongSureRow(row: ReadKhataRow, expected: ExpectedKhataRow[]): string | undefined {
  if (!sureRow(row)) return undefined;
  if (!expected.some((wanted) => wanted.amountPoisha === row.amountPoisha))
    return `sure row ${row.name} ${row.amountPoisha} is not on the page`;
  if (MONTH_WORDS.includes(row.name.toLowerCase()))
    return `month word ${row.name} kept as a sure name`;
  return undefined;
}

// A page passes when every written row comes back (found by its amount) and no row the owner
// would not be asked to check is wrong: an amount that is not on the page, a wrong date or phone,
// or a month word as a name. A misread letter in a name is shown to the owner, so it is not scored.
export function scoreKhataReading(rows: ReadKhataRow[], expected: ExpectedKhataRow[]): string[] {
  const fromExpected = expected.map((wanted) => {
    const found = rows.find((row) => row.amountPoisha === wanted.amountPoisha);
    if (found) return wrongDetail(found, wanted);
    // A row with the right name but a doubtful amount is flagged for the owner: safe, not missing.
    const flagged = rows.some(
      (row) => !sureRow(row) && row.name.toLowerCase().includes(wanted.name),
    );
    return flagged ? undefined : `missing ${wanted.name} ${wanted.amountPoisha}`;
  });
  const fromRows = rows.map((row) => wrongSureRow(row, expected));
  return [...fromExpected, ...fromRows].filter((problem) => problem !== undefined);
}

type Reading = { driver: LlmDriver; meter: EvalMeter; model: string; original: Uint8Array };

async function askModel({ driver, meter, model, original }: Reading, turn: KhataTurn) {
  const photo = await prepareKhataPhoto(original, turn);
  if (!photo) return undefined;
  const result = await meteredRespond(driver, meter, `vision:${model}`, {
    model,
    instructions: readKhataPage.instructions,
    input: 'Read the attached khata page.',
    images: [photo],
    output: khataModelOutputSchema,
    timeoutMs: TIMEOUT_MS,
  });
  const parsed =
    result.kind === 'output' ? khataModelOutputSchema.safeParse(result.output) : undefined;
  return parsed?.success ? parsed.data : undefined;
}

// The same two-step read as the service: a page the model finds sideways is read again.
async function readPage(reading: Reading) {
  let turn: KhataTurn = 0;
  let output = await askModel(reading, turn);
  for (
    let reads = 1;
    reads < MAX_KHATA_READS && output && output.turnClockwiseDegrees !== 0;
    reads++
  ) {
    turn = addKhataTurn(turn, output.turnClockwiseDegrees);
    output = await askModel(reading, turn);
  }
  return output;
}

export async function runKhataEval(
  driver: LlmDriver,
  meter: EvalMeter,
  model: string,
): Promise<MediaScore> {
  const failures: string[] = [];
  for (const { file, expected } of khataCases) {
    const original = new Uint8Array(readFileSync(path.join(fixtures, `${file}.jpg`)));
    try {
      const output = await readPage({ driver, meter, model, original });
      const problems = output
        ? scoreKhataReading(readKhataRows(output, today), expected)
        : ['no reading'];
      if (problems.length > 0) failures.push(`${file}: ${problems.join(', ')}`);
    } catch (error) {
      if (!(error instanceof LlmError)) throw error;
      failures.push(`${file}: ${error.code}`);
    }
  }
  return { passed: khataCases.length - failures.length, total: khataCases.length, failures };
}

import type { ContentWriteResult } from '@dakly/contracts/content-writing';

import type { GenerateInput } from './generate-form-types';
import { ResultCard } from './result-card';

type WrittenOptionsProps = { result: ContentWriteResult | undefined; asked: GenerateInput | null };

export function WrittenOptions({ result, asked }: WrittenOptionsProps) {
  if (!result || !asked)
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-center text-text-muted">
        Your 3 options will show here. Pick a format, say what it is about, then write.
      </p>
    );
  return (
    <ul aria-label="Written options" className="space-y-3">
      {result.options.map((option) => (
        <li key={`${result.aiRunId}-${option}`}>
          <ResultCard
            text={option}
            aiRunId={result.aiRunId}
            kind={asked.kind}
            language={asked.language}
          />
        </li>
      ))}
    </ul>
  );
}

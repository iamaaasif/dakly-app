import { Languages, Scissors, Smile } from 'lucide-react';

import type { ContentPiece } from '@dakly/contracts/content';
import type { ContentWriteInput } from '@dakly/contracts/content-writing';
import { Button } from '@dakly/ui/button';

import { useWriteContent } from '../api/write-content';

type Edit = { body: string; aiRunId: string; language: ContentPiece['language'] };
type MakeItToolsProps = {
  piece: Pick<ContentPiece, 'kind' | 'language' | 'body'>;
  tone: ContentWriteInput['tone'];
  onEdited: (edit: Edit) => void;
};

// Each tool asks for one rewritten option and uses 1 AI credit.
export function MakeItTools({ piece, tone, onEdited }: MakeItToolsProps) {
  const write = useWriteContent();
  const toBangla = piece.language !== 'bn';
  const translated = toBangla ? 'bn' : 'en';
  const run = (operation: 'shorten' | 'friendlier' | 'translate') => {
    const language = operation === 'translate' ? translated : piece.language;
    write.mutate(
      { operation, kind: piece.kind, tone, language, body: piece.body },
      {
        onSuccess: ({ options: [body], aiRunId }) => body && onEdited({ body, aiRunId, language }),
      },
    );
  };
  const tools = [
    { operation: 'shorten', label: 'Shorter', icon: Scissors },
    { operation: 'friendlier', label: 'Friendlier', icon: Smile },
    { operation: 'translate', label: toBangla ? 'To Bangla' : 'To English', icon: Languages },
  ] as const;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-text-muted">Make it:</span>
      {tools.map(({ operation, label, icon: Icon }) => (
        <Button
          key={operation}
          variant="secondary"
          disabled={write.isPending}
          onClick={() => run(operation)}
        >
          <Icon aria-hidden="true" size={14} strokeWidth={1.75} /> {label}
        </Button>
      ))}
      {write.error && (
        <p role="alert" className="basis-full text-sm text-danger">
          {write.error.message}
        </p>
      )}
    </div>
  );
}

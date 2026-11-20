import { Hash, Languages, Scissors, Smile } from 'lucide-react';

import { Button } from '@dakly/ui/button';

import { useWriteCaption } from '../../api/write-caption';
import { addHashtags } from '../../post-caption';
import type { CaptionSettings } from './caption-settings';

type Rewrite = 'shorten' | 'friendlier' | 'translate';

type CaptionToolsProps = {
  caption: string;
  kind: 'facebook_post' | 'instagram_caption';
  settings: CaptionSettings;
  disabled: boolean;
  onCaption: (caption: string, byAi: boolean) => void;
};

export function CaptionTools({ caption, kind, settings, disabled, onCaption }: CaptionToolsProps) {
  const write = useWriteCaption();
  const toEnglish = settings.language === 'bn';
  const translateTo = toEnglish ? 'en' : 'bn';
  const rewrite = (operation: Rewrite) =>
    write.mutate(
      {
        operation,
        kind,
        tone: operation === 'friendlier' ? 'friendly' : settings.tone,
        language: operation === 'translate' ? translateTo : settings.language,
        body: caption,
      },
      { onSuccess: ({ options }) => options[0] && onCaption(options[0], true) },
    );
  const tools = [
    { operation: 'shorten', label: 'Shorten', icon: Scissors },
    { operation: 'friendlier', label: 'Make friendlier', icon: Smile },
    {
      operation: 'translate',
      label: toEnglish ? 'Translate to English' : 'Translate to Bangla',
      icon: Languages,
    },
  ] as const;
  const off = disabled || !caption.trim();
  return (
    <>
      {write.isError && (
        <p role="alert" className="text-sm text-danger">
          {write.error.message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {tools.map(({ operation, label, icon: Icon }) => (
          <Button
            key={operation}
            variant="secondary"
            className="min-h-9 px-3 text-sm"
            disabled={off}
            loading={write.isPending && write.variables?.operation === operation}
            onClick={() => rewrite(operation)}
          >
            <Icon aria-hidden="true" size={16} strokeWidth={1.75} /> {label}
          </Button>
        ))}
        <Button
          variant="secondary"
          className="min-h-9 px-3 text-sm"
          disabled={off}
          onClick={() => onCaption(addHashtags(caption), false)}
        >
          <Hash aria-hidden="true" size={16} strokeWidth={1.75} /> Add hashtags
        </Button>
      </div>
    </>
  );
}

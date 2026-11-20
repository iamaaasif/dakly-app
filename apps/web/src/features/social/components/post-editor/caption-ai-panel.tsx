import { Sparkles } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@dakly/ui/button';
import { Label } from '@dakly/ui/label';
import { Textarea } from '@dakly/ui/textarea';

import { useWriteCaption } from '../../api/write-caption';
import { CaptionSettingsFields, type CaptionSettings } from './caption-settings';

type CaptionAiPanelProps = {
  networkKind: 'facebook_post' | 'instagram_caption';
  settings: CaptionSettings;
  onSettings: (settings: CaptionSettings) => void;
  onPick: (caption: string) => void;
};

export function CaptionAiPanel({ networkKind, settings, onSettings, onPick }: CaptionAiPanelProps) {
  const [topic, setTopic] = useState('');
  const [missing, setMissing] = useState(false);
  const write = useWriteCaption();
  const generate = () => {
    const trimmed = topic.trim();
    setMissing(!trimmed);
    if (trimmed)
      write.mutate({ operation: 'generate', kind: networkKind, ...settings, topic: trimmed });
  };
  const problem =
    missing && !topic.trim() ? 'Tell Dakly AI what the post is about.' : write.error?.message;
  return (
    <section
      aria-labelledby="write-with-ai"
      className="space-y-4 rounded-lg border border-border bg-surface p-4"
    >
      <h2 id="write-with-ai" className="flex items-center gap-3 text-sm font-semibold">
        <span
          aria-hidden="true"
          className="grid size-8 place-items-center rounded-md bg-primary-soft text-action"
        >
          <Sparkles size={16} strokeWidth={1.75} />
        </span>
        Write with Dakly AI
      </h2>
      <div className="space-y-1.5">
        <Label htmlFor="caption-topic">What’s this post about?</Label>
        <Textarea
          id="caption-topic"
          rows={2}
          maxLength={2000}
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          placeholder="e.g. New winter kurtis, 15% off this weekend, cash on delivery"
          className="min-h-16"
        />
      </div>
      <CaptionSettingsFields settings={settings} onSettings={onSettings} />
      {problem && (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      )}
      <Button loading={write.isPending} onClick={generate}>
        <Sparkles aria-hidden="true" size={16} strokeWidth={1.75} />
        {write.isError ? 'Try again' : 'Generate captions'}
      </Button>
      {write.data && <CaptionOptions options={write.data.options} onPick={onPick} />}
    </section>
  );
}

function CaptionOptions({
  options,
  onPick,
}: {
  options: string[];
  onPick: (text: string) => void;
}) {
  return (
    <ul aria-label="Caption options" className="space-y-2">
      {options.map((option) => (
        <li key={option}>
          <Button
            variant="secondary"
            className="h-auto w-full justify-start text-left wrap-anywhere whitespace-pre-wrap"
            onClick={() => onPick(option)}
          >
            {option}
          </Button>
        </li>
      ))}
    </ul>
  );
}

import { useBrandHashtags } from '../../api/get-brand-hashtags';

type SuggestedHashtagsProps = { caption: string; disabled: boolean; onAdd: (tag: string) => void };

export function SuggestedHashtags({ caption, disabled, onAdd }: SuggestedHashtagsProps) {
  const { data } = useBrandHashtags();
  const used = new Set(caption.toLowerCase().match(/#\S+/g));
  const tags = (data ?? []).filter((tag) => !used.has(tag.toLowerCase()));
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-text-muted">Suggested hashtags</span>
      {tags.map((tag) => (
        <button
          key={tag}
          type="button"
          disabled={disabled}
          onClick={() => onAdd(tag)}
          className="min-h-8 rounded-full border border-border bg-surface-muted px-3 text-sm hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-50"
        >
          {tag}
        </button>
      ))}
    </div>
  );
}

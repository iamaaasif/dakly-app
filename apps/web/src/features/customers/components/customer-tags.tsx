import { Badge } from '@dakly/ui/badge';

export function CustomerTags({
  tags,
  variant = 'info',
}: {
  tags: string[];
  variant?: 'info' | 'neutral';
}) {
  if (!tags.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
      {tags.map((tag) => (
        <Badge key={tag} variant={variant}>
          {tag}
        </Badge>
      ))}
    </div>
  );
}

import { Badge } from '@dakly/ui/badge';

export function CustomerTags({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
      {tags.map((tag) => (
        <Badge key={tag} variant="info">
          {tag}
        </Badge>
      ))}
    </div>
  );
}

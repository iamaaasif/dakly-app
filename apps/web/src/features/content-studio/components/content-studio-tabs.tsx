import { BookOpen, Sparkles, Store } from 'lucide-react';

import { cn } from '@dakly/ui/cn';

import { contentStudioHref, type ContentStudioTab } from '../content-studio-view';
import { UrlLink } from '@/components/url-link';

const tabs = [
  { id: 'create', label: 'Create', icon: Sparkles },
  { id: 'library', label: 'Library', icon: BookOpen },
  { id: 'brand', label: 'Brand profile', icon: Store },
] as const;

export function ContentStudioTabs({ tab }: { tab: ContentStudioTab }) {
  return (
    <nav
      aria-label="Content Studio tabs"
      className="flex gap-1 overflow-x-auto border-b border-border"
    >
      {tabs.map(({ id, label, icon: Icon }) => (
        <UrlLink
          key={id}
          href={contentStudioHref({ tab: id })}
          aria-current={tab === id ? 'page' : undefined}
          className={cn(
            '-mb-px inline-flex min-h-10 shrink-0 items-center gap-2 border-b-2 border-transparent px-3 text-base text-text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
            tab === id && 'border-action font-medium text-text',
          )}
        >
          <Icon aria-hidden="true" size={16} strokeWidth={1.75} className="hidden sm:block" />
          {label}
        </UrlLink>
      ))}
    </nav>
  );
}

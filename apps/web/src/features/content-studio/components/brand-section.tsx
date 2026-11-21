import type { ReactNode } from 'react';

type BrandSectionProps = { title: string; hint: string; children: ReactNode };

export function BrandSection({ title, hint, children }: BrandSectionProps) {
  return (
    <section className="space-y-4 rounded-lg border border-border bg-surface p-4 md:p-5">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-text-muted">{hint}</p>
      </div>
      {children}
    </section>
  );
}

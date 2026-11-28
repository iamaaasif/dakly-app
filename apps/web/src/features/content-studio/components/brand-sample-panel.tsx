import type { BrandValues } from './brand-form';
import { brandSample } from './brand-sample';

type BrandSamplePanelProps = { values: BrandValues; shopName: string };

export function BrandSamplePanel({ values, shopName }: BrandSamplePanelProps) {
  return (
    <aside
      aria-label="Sample with these settings"
      className="space-y-3 rounded-lg border border-border bg-surface p-4 md:p-5 lg:sticky lg:top-4"
    >
      <h2 className="text-xs font-semibold tracking-wide text-text-muted uppercase">
        Sample with these settings
      </h2>
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-on-primary"
        >
          {shopName.slice(0, 2).toUpperCase()}
        </span>
        <div>
          <p className="font-semibold">{shopName}</p>
          <p className="text-sm text-text-muted">Facebook post</p>
        </div>
      </div>
      <div className="space-y-3">
        {brandSample(values, shopName).map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </aside>
  );
}

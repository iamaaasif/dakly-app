import { Download } from 'lucide-react';

import type { AnalyticsView } from '@dakly/contracts/analytics';
import { Button } from '@dakly/ui/button';

import { useDownloadAnalytics } from '../api/analytics-attribution';

export function AnalyticsDownloadButton({ view }: { view: AnalyticsView }) {
  const download = useDownloadAnalytics();
  // The AI agent report has no file yet.
  const { tab, period } = view;
  if (tab === 'ai-agent') return null;
  return (
    <div>
      <Button
        variant="secondary"
        loading={download.isPending}
        onClick={() => download.mutate({ tab, period })}
      >
        <Download aria-hidden="true" size={16} strokeWidth={1.75} />
        Download
      </Button>
      {download.isError && (
        <p role="alert" className="mt-1 text-sm text-danger">
          The file could not be downloaded. Try again.
        </p>
      )}
    </div>
  );
}

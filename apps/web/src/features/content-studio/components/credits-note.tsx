import { useContentCredits } from '../api/get-credits';
import { creditsLeftLabel } from './credits-left-label';

export function CreditsNote() {
  const credits = useContentCredits().data;
  return (
    <p className="text-center text-sm text-text-muted">
      Uses 3 AI credits{credits && ` · ${creditsLeftLabel(credits.remaining)}`}
    </p>
  );
}

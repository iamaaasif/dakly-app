import { useContentCredits } from '../api/get-credits';

export function CreditsNote() {
  const credits = useContentCredits().data;
  return (
    <p className="text-center text-sm text-text-muted">
      Uses 3 AI credits{credits && ` · ${credits.remaining} AI credits left`}
    </p>
  );
}

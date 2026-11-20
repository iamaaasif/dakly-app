import type { ReactNode } from 'react';

import { Button } from '@dakly/ui/button';

type ImportStepActionsProps = {
  onBack?: () => void;
  next: ReactNode;
  onNext?: () => void;
  loading?: boolean;
  disabled?: boolean;
};

export function ImportStepActions({
  onBack,
  next,
  onNext,
  loading,
  disabled,
}: ImportStepActionsProps) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
      {onBack ? (
        <Button variant="secondary" onClick={onBack} disabled={loading}>
          Back
        </Button>
      ) : null}
      <Button
        type={onNext ? 'button' : 'submit'}
        onClick={onNext}
        loading={loading}
        disabled={disabled}
      >
        {next}
      </Button>
    </div>
  );
}

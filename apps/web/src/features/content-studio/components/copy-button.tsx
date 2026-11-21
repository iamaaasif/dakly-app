import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@dakly/ui/button';

export function CopyButton({
  text,
  label = 'Copy',
  className,
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState<boolean | null>(null);
  return (
    <>
      <Button
        variant="secondary"
        className={className}
        onClick={() =>
          void navigator.clipboard.writeText(text).then(
            () => setCopied(true),
            () => setCopied(false),
          )
        }
      >
        {copied ? <Check aria-hidden="true" size={14} /> : <Copy aria-hidden="true" size={14} />}
        {copied ? 'Copied' : label}
      </Button>
      {copied === false && (
        <p role="alert" className="basis-full text-sm text-danger">
          Dakly could not copy this. Select the text and copy it.
        </p>
      )}
    </>
  );
}

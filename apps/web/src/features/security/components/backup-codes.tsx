import { Button } from '@dakly/ui/button';
export function BackupCodes({ codes, onSaved }: { codes: string[]; onSaved: () => void }) {
  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Save your backup codes</h3>
      <p>
        These ten codes are shown once. Keep them privately in a safe place. Each code works once.
        Leaving or reloading this page clears this copy.
      </p>
      <ul data-private aria-label="Backup codes" className="grid gap-2 font-mono sm:grid-cols-2">
        {codes.map((code) => (
          <li key={code} className="break-all">
            {code}
          </li>
        ))}
      </ul>
      <Button onClick={() => onSaved()}>I saved my backup codes</Button>
    </div>
  );
}

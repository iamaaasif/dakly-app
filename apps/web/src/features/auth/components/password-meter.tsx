import { passwordSchema } from '@dakly/contracts/auth';
import { cn } from '@dakly/ui/cn';

const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
const fills = ['bg-border', 'bg-danger', 'bg-warning', 'bg-success', 'bg-success'];
const colours = ['', 'text-danger', 'text-warning', 'text-success', 'text-success'];

// 1 to 4: length, a number, mixed case, and a symbol or 12 characters. Empty is 0.
function meterScore(password: string): number {
  if (!password) return 0;
  const checks = [
    passwordSchema.safeParse(password).success,
    /\d/.test(password),
    /[a-z]/.test(password) && /[A-Z]/.test(password),
    /[^A-Za-z0-9]/.test(password) || password.length >= 12,
  ];
  return Math.max(1, checks.filter(Boolean).length);
}

export function PasswordMeter({ password }: { password: string }) {
  const score = meterScore(password);
  if (!score) return null;
  return (
    <div className="flex items-center gap-2">
      <div aria-hidden="true" className="grid flex-1 grid-cols-4 gap-1">
        {[1, 2, 3, 4].map((bar) => (
          <span
            key={bar}
            className={cn('h-1 rounded-full', bar <= score ? fills[score] : 'bg-border')}
          />
        ))}
      </div>
      <span role="status" className={cn('text-xs font-medium whitespace-nowrap', colours[score])}>
        {labels[score]}
      </span>
    </div>
  );
}

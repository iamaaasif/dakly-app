import { passwordSchema } from '@dakly/contracts/auth';

const fills = ['bg-border', 'bg-danger', 'bg-warning', 'bg-success'];
type Strength = { level: 0 | 1 | 2 | 3; label: string };
// The API only requires 8 characters and a number; the meter nudges toward longer passwords.
export function passwordStrength(password: string): Strength {
  if (!password) return { level: 0, label: '' };
  if (!passwordSchema.safeParse(password).success)
    return { level: 1, label: 'Too weak: use 8 characters and a number' };
  const varied = /[a-z]/.test(password) && /[A-Z]/.test(password) && /[^A-Za-z0-9]/.test(password);
  return password.length >= 12 || varied
    ? { level: 3, label: 'Strong' }
    : { level: 2, label: 'Good: longer is stronger' };
}

export function PasswordStrength({ password }: { password: string }) {
  const { level, label } = passwordStrength(password);
  return (
    <div className="space-y-1">
      <div aria-hidden="true" className="flex gap-1">
        {[1, 2, 3].map((bar) => (
          <span
            key={bar}
            className={`h-1 flex-1 rounded-full ${bar <= level ? fills[level] : 'bg-border'}`}
          />
        ))}
      </div>
      <p role="status" className="text-sm text-text-muted">
        {label}
      </p>
    </div>
  );
}

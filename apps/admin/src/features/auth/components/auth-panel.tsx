import type { ReactNode } from 'react';
import { cn } from '@dakly/ui/cn';
import { Card } from '@dakly/ui/card';
type AuthPanelProps = {
  title: string;
  description: string;
  children: ReactNode;
  centered?: boolean;
};
export function AuthPanel({ title, description, children, centered = true }: AuthPanelProps) {
  return (
    <main
      className={cn('mx-auto flex w-full max-w-lg p-4', centered && 'min-h-screen items-center')}
    >
      <Card className="w-full space-y-6 p-6">
        <div className="space-y-2">
          <p className="text-sm font-medium text-action">Dakly staff</p>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-muted">{description}</p>
        </div>
        {children}
      </Card>
    </main>
  );
}

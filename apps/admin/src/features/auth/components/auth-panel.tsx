import type { ReactNode } from 'react';
import { Card } from '@dakly/ui/card';
type AuthPanelProps = { title: string; description: string; children: ReactNode };
export function AuthPanel({ title, description, children }: AuthPanelProps) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg items-center p-4">
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

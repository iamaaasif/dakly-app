'use client';
import { Button } from '@dakly/ui/button';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-lg space-y-4 p-6">
      <h1 className="text-title">Could not load your staff account</h1>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}

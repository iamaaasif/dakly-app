'use client';
import { useState } from 'react';
import type { BusinessDraft } from '../auth.types';
import { BusinessDetails } from './business-details';
import { PlanPicker } from './plan-picker';
export function SetupScreen() {
  const [draft, setDraft] = useState<BusinessDraft>();
  const [planning, setPlanning] = useState(false);
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <h1 className="text-xl font-bold">
        {planning ? 'Pick a plan · Step 4 of 4' : 'Business details · Step 3 of 4'}
      </h1>
      <p>
        Your account is ready. Your shop is saved only when you finish choosing a plan. Reloading
        clears unfinished business details; sign in again to resume here.
      </p>
      {planning && draft ? (
        <PlanPicker draft={draft} onBack={() => setPlanning(false)} />
      ) : (
        <BusinessDetails
          draft={draft}
          onNext={(values) => {
            setDraft(values);
            setPlanning(true);
          }}
        />
      )}
    </main>
  );
}

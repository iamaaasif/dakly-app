'use client';
import { Suspense } from 'react';

import { AlertList } from './alert-list';

export function StaffAlerts() {
  return (
    <Suspense fallback={<p role="status">Loading staff alerts…</p>}>
      <AlertList />
    </Suspense>
  );
}

'use client';
import { useState } from 'react';

import { killSwitchFeatures, type KillSwitchFeature } from '@dakly/contracts/kill-switches';
import { Card } from '@dakly/ui/card';
import { Input } from '@dakly/ui/input';

import { featureNames } from './feature-names';
import { KillSwitchForm } from './kill-switch-form';

const shopIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ShopPauseForm() {
  const [storeId, setStoreId] = useState('');
  const [feature, setFeature] = useState<KillSwitchFeature>('ai_replies');
  const valid = shopIdPattern.test(storeId.trim());
  return (
    <Card className="space-y-3">
      <h3 className="font-semibold">Pause one shop</h3>
      <label htmlFor="pause-store-id">Shop ID</label>
      <Input
        id="pause-store-id"
        value={storeId}
        onChange={(event) => setStoreId(event.target.value)}
      />
      <label htmlFor="pause-feature">Feature</label>
      <select
        id="pause-feature"
        className="min-h-10 w-full rounded-md border border-input-border bg-surface p-2"
        value={feature}
        onChange={(event) => setFeature(event.target.value as KillSwitchFeature)}
      >
        {killSwitchFeatures.map((item) => (
          <option key={item} value={item}>
            {featureNames[item]}
          </option>
        ))}
      </select>
      {valid ? (
        <KillSwitchForm
          key={`${feature}-${storeId.trim()}`}
          feature={feature}
          storeId={storeId.trim()}
          paused={false}
          label="Pause for this shop"
        />
      ) : (
        <p className="text-muted">Enter a full shop ID to pause it.</p>
      )}
    </Card>
  );
}

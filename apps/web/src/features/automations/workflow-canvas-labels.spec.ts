import { describe, expect, it } from 'vitest';

import { automationTemplates } from '@dakly/contracts/automations/templates';

import { triggerRows, waitParts } from './workflow-canvas-labels';

describe('workflow canvas labels', () => {
  it('describes the trigger card of the welcome template', () => {
    const { graph } = automationTemplates.welcome_new_subscriber;
    expect(triggerRows(graph, () => 1)).toEqual([
      ['Trigger filters', 'None'],
      ['Audience', 'Everyone'],
      ['Frequency', 'Once ever'],
      ['Exit when', 'Places an order'],
      ['Channels', 'WhatsApp, Messenger, SMS: subscribed'],
    ]);
  });

  it('splits a wait into its words and its amount', () => {
    expect(waitParts({ until: 'duration', minutes: 90 })).toEqual(['Wait for', '90 minutes']);
    expect(waitParts({ until: 'duration', minutes: 1440 })).toEqual(['Wait for', '1 day']);
    expect(waitParts({ until: 'weekday', weekday: 'mon', time: '10:00' })).toEqual([
      'Wait until',
      'Mon 10:00',
    ]);
  });
});

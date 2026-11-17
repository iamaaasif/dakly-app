import { describe, expect, it } from 'vitest';

import { currentState } from './shell-navigation';

const settings = {
  href: '/settings',
  related: ['/security', '/team/ownership', '/support-access'],
};
const storeSettings = { href: '/settings?tab=store' };
const extensions = { href: '/settings?tab=extensions' };
const team = { href: '/team' };

describe('currentState', () => {
  it('marks Settings as the page on /settings without a tab', () => {
    expect(currentState(settings, '/settings', null)).toBe('page');
    expect(currentState(storeSettings, '/settings', null)).toBeUndefined();
  });
  it('marks the tab link as the page and Settings as the location on a tab', () => {
    expect(currentState(storeSettings, '/settings', 'store')).toBe('page');
    expect(currentState(settings, '/settings', 'store')).toBe('location');
    expect(currentState(extensions, '/settings', 'extensions')).toBe('page');
  });
  it('marks Settings as the location on the screens it leads to', () => {
    expect(currentState(settings, '/security', null)).toBe('location');
    expect(currentState(team, '/team/ownership', null)).toBeUndefined();
  });
});

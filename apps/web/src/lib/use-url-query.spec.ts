// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { changeUrl } from './use-url-query';

afterEach(() => window.history.replaceState(null, '', '/'));

describe('changeUrl', () => {
  it('adds one history entry when the same address is pushed twice', () => {
    const before = window.history.length;
    changeUrl('/customers?type=vip');
    changeUrl('/customers?type=vip');
    expect(window.history.length).toBe(before + 1);
    expect(window.location.search).toBe('?type=vip');
  });

  it('replaces the address without adding an entry', () => {
    const before = window.history.length;
    changeUrl('/customers?search=rahim', 'replace');
    expect(window.history.length).toBe(before);
    expect(window.location.search).toBe('?search=rahim');
  });
});

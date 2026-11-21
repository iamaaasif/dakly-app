import { describe, expect, it } from 'vitest';

import { passwordStrength } from './password-strength';

describe('passwordStrength', () => {
  it.each([
    ['', 0],
    ['short1', 1],
    ['longpasswordnonumber', 1],
    ['password1', 2],
    ['a-much-longer-password-1', 3],
    ['Passw0rd!', 3],
  ])('rates %j as level %i', (password, level) => {
    expect(passwordStrength(password).level).toBe(level);
  });
});

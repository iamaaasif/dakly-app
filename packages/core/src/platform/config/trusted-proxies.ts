import { BlockList, isIP } from 'node:net';
import { z } from 'zod';

function range(value: string) {
  const [address = '', prefix, extra] = value.split('/');
  const version = isIP(address);
  const bits = version === 4 ? 32 : 128;
  if (!version || address.includes('%') || extra !== undefined) return undefined;
  if (prefix !== undefined && (!/^[1-9]\d*$/.test(prefix) || Number(prefix) > bits))
    return undefined;
  return { address, prefix: prefix === undefined ? bits : Number(prefix), version };
}

export const trustedProxiesSchema = z
  .string()
  .default('')
  .transform((value) => (value === '' ? [] : value.split(',').map((entry) => entry.trim())))
  .pipe(z.array(z.string().refine((value) => range(value) !== undefined)).max(64));

export function compileProxyTrust(ranges: string[]): (address: string) => boolean {
  const allowed = new BlockList();
  for (const value of ranges) {
    const parsed = range(value);
    if (!parsed) throw new Error('Invalid trusted proxy range');
    allowed.addSubnet(parsed.address, parsed.prefix, parsed.version === 4 ? 'ipv4' : 'ipv6');
  }
  return (address) => {
    const version = isIP(address);
    return version !== 0 && allowed.check(address, version === 4 ? 'ipv4' : 'ipv6');
  };
}

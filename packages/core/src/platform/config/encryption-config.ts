import { createSecretKey, type KeyObject } from 'node:crypto';
import { z } from 'zod';

const keyVersionSchema = z
  .string()
  .regex(/^[1-9]\d{0,4}$/)
  .refine((value) => Number(value) <= 32767);
const masterKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9+/]{43}=$/)
  .refine((value) => {
    const key = Buffer.from(value, 'base64');
    return key.length === 32 && key.toString('base64') === value;
  });
const configurationSchema = z
  .object({
    currentKeyVersion: keyVersionSchema,
    masterKeys: z.record(keyVersionSchema, masterKeySchema),
  })
  .refine(({ currentKeyVersion, masterKeys }) => Object.hasOwn(masterKeys, currentKeyVersion));

export type EncryptionConfiguration = {
  currentKeyVersion: number;
  masterKeys: ReadonlyMap<number, KeyObject>;
};

export function parseEncryptionConfiguration(
  currentKeyVersion: string | undefined,
  masterKeys: string | undefined,
): EncryptionConfiguration | undefined {
  if (currentKeyVersion === undefined && masterKeys === undefined) return undefined;
  try {
    if (masterKeys === undefined || masterKeys.length > 65536) throw new Error();
    const configuration = configurationSchema.parse({
      currentKeyVersion,
      masterKeys: JSON.parse(masterKeys),
    });
    return {
      currentKeyVersion: Number(configuration.currentKeyVersion),
      masterKeys: new Map(
        Object.entries(configuration.masterKeys).map(([version, key]) => [
          Number(version),
          createSecretKey(Buffer.from(key, 'base64')),
        ]),
      ),
    };
  } catch {
    // Parser errors can contain supplied keys or JSON fragments.
    throw new Error('Invalid encryption configuration');
  }
}

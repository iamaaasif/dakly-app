import 'reflect-metadata';
import { randomBytes } from 'node:crypto';

import { NestFactory } from '@nestjs/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetEnvForTests } from '../config/env';
import { CryptoModule } from './crypto.module';
import { EnvelopeEncryption } from './envelope-encryption';

describe('CryptoModule', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvForTests();
  });

  function configureEnvironment() {
    vi.stubEnv('DATABASE_URL', 'postgres://localhost/dakly');
    vi.stubEnv('REDIS_URL', 'redis://localhost');
    vi.stubEnv('ENCRYPTION_CURRENT_KEY_VERSION', undefined);
    vi.stubEnv('ENCRYPTION_MASTER_KEYS', undefined);
  }

  it('refuses consumer startup without encryption keys', async () => {
    configureEnvironment();
    await expect(
      NestFactory.createApplicationContext(CryptoModule, {
        logger: false,
        abortOnError: false,
      }),
    ).rejects.toThrow('Encryption keys are required');
  });

  it('provides encryption with the configured current version', async () => {
    configureEnvironment();
    vi.stubEnv('ENCRYPTION_CURRENT_KEY_VERSION', '32767');
    vi.stubEnv(
      'ENCRYPTION_MASTER_KEYS',
      JSON.stringify({ 32767: randomBytes(32).toString('base64') }),
    );
    const application = await NestFactory.createApplicationContext(CryptoModule, {
      logger: false,
      abortOnError: false,
    });
    try {
      const encryption = application.get(EnvelopeEncryption);
      const context = {
        owner: 'user',
        userId: '018cc001-0000-7000-8000-000000000001',
        purpose: 'totp',
      } as const;
      const secret = encryption.encrypt(context, Buffer.from('account secret'));
      expect(secret.keyVersion).toBe(32767);
      expect(encryption.decrypt(context, secret).toString()).toBe('account secret');
    } finally {
      await application.close();
    }
  });
});

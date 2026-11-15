import { Module } from '@nestjs/common';
import { loadEnv } from '../config/env';
import { EnvelopeEncryption } from './envelope-encryption';

@Module({
  providers: [
    { provide: EnvelopeEncryption, useFactory: () => new EnvelopeEncryption(loadEnv().encryption) },
  ],
  exports: [EnvelopeEncryption],
})
export class CryptoModule {}

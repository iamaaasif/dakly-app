import { Module } from '@nestjs/common';

import { ClockModule } from '../platform/clock.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { WalletLedgerRepository } from './wallet-ledger.repository';
import { WalletService } from './wallet.service';
import { WalletsController } from './wallets.controller';

@Module({
  imports: [ClockModule, OutboxModule],
  controllers: [WalletsController],
  providers: [WalletService, WalletLedgerRepository],
  exports: [WalletService],
})
export class WalletsModule {}

import { Module } from '@nestjs/common';

import { WalletLedgerRepository } from './wallet-ledger.repository';
import { WalletService } from './wallet.service';
import { WalletsController } from './wallets.controller';

@Module({
  controllers: [WalletsController],
  providers: [WalletService, WalletLedgerRepository],
  exports: [WalletService],
})
export class WalletsModule {}

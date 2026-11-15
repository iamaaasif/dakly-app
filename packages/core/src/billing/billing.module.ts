import { Module } from '@nestjs/common';
import { Clock } from '../platform/clock';
import { BillingRepository } from './billing.repository';
import { BillingService } from './billing.service';
@Module({ providers: [Clock, BillingRepository, BillingService], exports: [BillingService] })
export class BillingModule {}

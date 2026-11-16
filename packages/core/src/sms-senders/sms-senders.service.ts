import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import type {
  OpenSmsSenderIdListResponse,
  RequestSmsSenderIdInput,
  SmsSenderIdListQuery,
  SmsSenderIdListResponse,
  SmsSenderIdResponse,
  SmsSenderIdStatus,
} from '@dakly/contracts/sms-senders';

import { UsersService } from '../auth/users.service';
import { Clock } from '../platform/clock';
import { SmsService } from '../sms/sms.service';
import { smsSenderError } from './sms-senders.errors';
import { type SmsSender, SmsSendersRepository } from './sms-senders.repository';

// Staff decide a request once, from requested or in review (docs/data/state-machines.md).
const UNDECIDED_STATUSES = ['requested', 'in_review'] as const satisfies SmsSenderIdStatus[];

// The reason goes to the staff audit; a rejection also shows it to the shop.
type SmsSenderDecisionInput = { status: 'approved' | 'rejected'; reason: string };

@Injectable()
export class SmsSendersService {
  constructor(
    @Inject(SmsSendersRepository) private readonly repository: SmsSendersRepository,
    @Inject(SmsService) private readonly smsService: SmsService,
    @Inject(UsersService) private readonly usersService: UsersService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async request(
    storeId: string,
    input: RequestSmsSenderIdInput,
    actor: { kind: 'user'; userId: string },
  ): Promise<SmsSenderIdResponse> {
    const created = await this.repository.insert(storeId, input.senderName, actor.userId);
    if (!created) throw smsSenderError('SMS_SENDER_ID_ALREADY_ACTIVE');
    return toSmsSenderIdResponse(created);
  }

  async list(storeId: string, query: SmsSenderIdListQuery): Promise<SmsSenderIdListResponse> {
    const rows = await this.repository.list(storeId, query);
    const items = rows.slice(0, query.limit).map(toSmsSenderIdResponse);
    return { items, nextCursor: rows.length > query.limit ? (items.at(-1)?.id ?? null) : null };
  }

  // Undefined means the message goes from Dakly's shared sender.
  approvedSenderName(storeId: string): Promise<string | undefined> {
    return this.repository.findApprovedName(storeId);
  }

  async decideRequest(
    storeId: string,
    smsSenderIdId: string,
    decision: SmsSenderDecisionInput,
    _actor: AuditEntry['actor'],
  ): Promise<SmsSenderIdResponse> {
    const decided = await this.repository.decide(storeId, smsSenderIdId, UNDECIDED_STATUSES, {
      status: decision.status,
      rejectionReason: decision.status === 'rejected' ? decision.reason : null,
      decidedAt: this.clock.now(),
    });
    if (decided) return toSmsSenderIdResponse(decided);
    if (await this.repository.findById(storeId, smsSenderIdId))
      throw smsSenderError('SMS_SENDER_ID_ALREADY_DECIDED');
    throw smsSenderError('SMS_SENDER_ID_NOT_FOUND');
  }

  // Goes only to the member's own verified phone, so a test cannot reach a customer.
  async sendTest(storeId: string, smsSenderIdId: string, userId: string): Promise<void> {
    const sender = await this.repository.findById(storeId, smsSenderIdId);
    if (!sender) throw smsSenderError('SMS_SENDER_ID_NOT_FOUND');
    if (sender.status !== 'approved') throw smsSenderError('SMS_SENDER_ID_NOT_APPROVED');
    const member = await this.usersService.profile(userId);
    if (!member.phone || !member.isPhoneVerified)
      throw smsSenderError('SMS_SENDER_TEST_PHONE_REQUIRED');
    await this.smsService.send({
      to: member.phone,
      text: `This is a test SMS from ${sender.senderName} on Dakly.`,
      sender: sender.senderName,
    });
  }

  async listOpen(query: SmsSenderIdListQuery): Promise<OpenSmsSenderIdListResponse> {
    const rows = await this.repository.listOpen(query);
    const items = rows
      .slice(0, query.limit)
      .map((row) => ({ ...row, createdAt: new Date(row.createdAt).toISOString() }));
    return { items, nextCursor: rows.length > query.limit ? (items.at(-1)?.id ?? null) : null };
  }
}

function toSmsSenderIdResponse(sender: SmsSender): SmsSenderIdResponse {
  return {
    ...sender,
    createdAt: sender.createdAt.toISOString(),
    decidedAt: sender.decidedAt?.toISOString() ?? null,
  };
}

import { randomInt, randomUUID } from 'node:crypto';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { expect } from 'vitest';

import { StaffSessionsService } from '@dakly/core/admin/staff-sessions.service';
import { SupportService } from '@dakly/core/admin/support.service';
import { StaffTransaction } from '@dakly/core/platform/database/staff-transaction';
import { SessionsService } from '@dakly/core/sessions/sessions.service';
import { createDatabase } from '@dakly/db/client';

export type Actor = { id: string; phone: string; cookie: string };
export type Shop = {
  id: string;
  owner: Actor;
  member: Actor;
  membership: string;
  ownerMembership: string;
};
export class IsolationFixture {
  readonly admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
  readonly stores: string[] = [];
  readonly plan = randomUUID();
  private planCreated = false;
  readonly users: string[] = [];
  readonly staff: string[] = [];
  readonly sms: { to: string; text: string; sender?: string }[] = [];
  constructor(readonly app: NestFastifyApplication) {}
  request(
    actor: Actor | string,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    payload?: object,
    headers?: Record<string, string>,
  ) {
    return this.app.inject({
      method,
      url,
      payload,
      headers: {
        host: 'localhost:3000',
        origin: 'http://localhost:3000',
        cookie: typeof actor === 'string' ? actor : actor.cookie,
        ...headers,
      },
      remoteAddress: `2001:db8::${randomInt(1, 65535).toString(16)}`,
    });
  }

  async account(): Promise<Actor> {
    const id = randomUUID(),
      phone = `017${randomInt(10000000, 99999999)}`;
    this.users.push(id);
    await this.admin.pool.query(
      'insert into users(id,name,phone,phone_verified_at) values($1,$2,$3,now())',
      [id, 'রিনা', phone],
    );
    const session = await this.app.get(SessionsService).create(id, { isRemembered: false });
    return { id, phone, cookie: `dakly_session=${session.token}` };
  }

  async shop(): Promise<Shop> {
    if (!this.planCreated) {
      await this.admin.pool.query(
        `insert into plans(id,code,name,monthly_price_poisha,yearly_price_poisha,limits,is_public) values($1::uuid,$1::text,'Isolation fixture',0,0,'{"seats":10}',false)`,
        [this.plan],
      );
      this.planCreated = true;
    }
    const id = randomUUID(),
      owner = await this.account(),
      member = await this.account();
    const membership = randomUUID(),
      ownerMembership = randomUUID();
    this.stores.push(id);
    await this.admin.pool.query('insert into stores(id,name) values($1,$2)', [id, `দোকান ${id}`]);
    await this.admin.pool.query(
      "insert into subscriptions(id,store_id,plan_id,status,current_period_price_poisha,current_period_start,current_period_end) values(gen_random_uuid(),$1,$2,'active',0,now(),now()+interval '1 day')",
      [id, this.plan],
    );
    await this.admin.pool.query(
      "insert into memberships(id,store_id,user_id,built_in_role,status) values($1,$2,$3,'owner','active'),($4,$2,$5,'support_agent','active')",
      [ownerMembership, id, owner.id, membership, member.id],
    );
    for (const actor of [owner, member]) {
      const selected = await this.request(actor, 'POST', '/me/active-store', { storeId: id });
      expect(selected.statusCode, selected.body).toBe(204);
    }
    return { id, owner, member, membership, ownerMembership };
  }

  code(actor: Actor) {
    const message = this.sms.findLast((item) => item.to === actor.phone);
    expect(message).toBeDefined();
    return message!.text.match(/\b\d{6}\b/)![0];
  }

  async transfer(shop: Shop) {
    const proof = await this.request(shop.owner, 'POST', '/store/ownership-transfer/code', {
      membershipId: shop.membership,
    });
    expect(proof.statusCode, proof.body).toBe(204);
    const result = await this.request(shop.owner, 'POST', '/store/ownership-transfer', {
      membershipId: shop.membership,
      code: this.code(shop.owner),
    });
    expect(result.statusCode, result.body).toBe(201);
    return result.json().id as string;
  }

  private async staffUser() {
    const id = randomUUID();
    this.staff.push(id);
    await this.admin.pool.query(
      "insert into staff_users(id,email,name,role,access_subject,enrolled_at) values($1::uuid,$2,'রিনা','support',$1::text,now())",
      [id, `${id}@example.test`],
    );
    return id;
  }

  async grant(shop: Shop, sendCode = true) {
    const id = await this.staffUser();
    await this.app
      .get(StaffTransaction)
      .run(id, () =>
        this.app
          .get(StaffSessionsService)
          .issue({ id, name: 'রিনা', role: 'support' }, '127.0.0.1'),
      );
    const sessionId = (
      await this.admin.pool.query('select id from staff_sessions where staff_user_id=$1', [id])
    ).rows[0].id as string;
    const staff = { id, name: 'রিনা', role: 'support' as const, sessionId };
    if (!sendCode) {
      const grantId = randomUUID();
      await this.admin.pool.query(
        "insert into support_grants(id,store_id,staff_user_id,reason,access,scopes,duration_minutes) values($1,$2,$3,'Investigate customer issue','write',ARRAY['customers'],30)",
        [grantId, shop.id, id],
      );
      return { id: grantId, staff };
    }
    const grant = await this.app.get(SupportService).request(
      staff,
      {
        targetId: shop.id,
        reason: 'Investigate customer issue',
        access: 'write',
        scopes: ['customers'],
        durationMinutes: 30,
      },
      `2001:db8::${randomInt(1, 65535).toString(16)}`,
    );
    expect(grant.codeSent).toBe(true);
    return { id: grant.id, staff };
  }

  async support(shop: Shop) {
    const grant = await this.grant(shop);
    const approved = await this.request(shop.owner, 'POST', `/support-access/${grant.id}/approve`, {
      code: this.code(shop.owner),
    });
    expect(approved.statusCode, approved.body).toBe(201);
    const handoff = await this.app
      .get(SupportService)
      .issueHandoff(grant.staff, grant.id, '127.0.0.1');
    const exchange = await this.app.inject({
      method: 'POST',
      url: '/support/exchange',
      headers: {
        host: 'localhost:3000',
        origin: 'http://localhost:3010',
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: `token=${handoff.token}`,
    });
    expect(exchange.statusCode, exchange.body).toBe(303);
    return String(exchange.headers['set-cookie']).split(';')[0]!;
  }

  async row(table: string, id: string) {
    // Table names are test-owned constants, never request data.
    return (
      await this.admin.pool.query(`select to_jsonb(t) as row from ${table} t where id=$1`, [id])
    ).rows[0]?.row;
  }

  async recovery(shop: Shop) {
    const auditId = randomUUID(),
      staffId = await this.staffUser();
    await this.admin.pool.query(
      "insert into staff_audit_log(id,action,target_type,target_id,reason,action_details,staff_user_id) values($1,'account.recovered','user',$2,'Verified recovery', $3,$4)",
      [auditId, shop.member.id, JSON.stringify({ reasonType: 'lost_authenticator' }), staffId],
    );
    await this.admin.pool.query(
      'insert into staff_recovery_history(store_id,audit_id) values($1,$2)',
      [shop.id, auditId],
    );
    return auditId;
  }

  async close() {
    // Versions and workflows point at each other.
    await this.admin.pool.query(
      'update automations set published_version_id=null where store_id=any($1::uuid[])',
      [this.stores],
    );
    for (const table of [
      'automation_runs',
      'automation_versions',
      'automations',
      'support_sessions',
      'support_grants',
      'staff_recovery_history',
      'ownership_transfers',
      'campaigns',
      'segments',
      'orders',
      'messages',
      'conversations',
      'channel_connections',
      'contacts',
      'stock_movements',
      'delivery_zones',
      'store_counters',
      'product_variants',
      'products',
      'imports',
      'knowledge_items',
      'files',
      'sms_sender_ids',
      'saved_replies',
      'notifications',
      'outbox_events',
      'audit_log',
      'memberships',
      'roles',
      'subscriptions',
      'wallet_ledger',
    ])
      await this.admin.pool.query(`delete from ${table} where store_id=any($1::uuid[])`, [
        this.stores,
      ]);
    await this.admin.pool.query(
      'delete from staff_alert_deliveries where audit_id in (select id from staff_audit_log where staff_user_id=any($1::uuid[]) or actor_user_id=any($2::uuid[]))',
      [this.staff, this.users],
    );
    await this.admin.pool.query(
      'delete from staff_audit_log where staff_user_id=any($1::uuid[]) or actor_user_id=any($2::uuid[]) or target_id=any($2::uuid[])',
      [this.staff, this.users],
    );
    await this.admin.pool.query('delete from staff_sessions where staff_user_id=any($1::uuid[])', [
      this.staff,
    ]);
    await this.admin.pool.query('delete from staff_users where id=any($1::uuid[])', [this.staff]);
    await this.admin.pool.query('delete from sessions where user_id=any($1::uuid[])', [this.users]);
    await this.admin.pool.query(
      'delete from account_security_events where user_id=any($1::uuid[])',
      [this.users],
    );
    await this.admin.pool.query('delete from stores where id=any($1::uuid[])', [this.stores]);
    await this.admin.pool.query('delete from users where id=any($1::uuid[])', [this.users]);
    await this.admin.pool.query('delete from plans where id=$1', [this.plan]);
    await this.admin.pool.end();
  }
}

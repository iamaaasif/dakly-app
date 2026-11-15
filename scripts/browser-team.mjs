import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { deleteMessages } from './browser-registration.mjs';

export function browserTeam(database, mailpitUrl) {
  const storeId = randomUUID(),
    ownerId = randomUUID(),
    emailUserId = randomUUID(),
    planId = randomUUID();
  const phone = `018${randomInt(10000000, 99999999)}`;
  const ownerPhone = `016${randomInt(10000000, 99999999)}`;
  const email = `${emailUserId}@example.test`;
  const name = `Team recipient ${randomUUID()}`;
  const token = randomBytes(32).toString('base64url');
  const recipients = [`${phone}@sms.test`, `${ownerPhone}@sms.test`, email];
  let owned = false;
  return {
    browser: { storeId, ownerId, emailUserId, ownerPhone, phone, email, name, token },
    async seed() {
      const found = await database.pool.query(
        'select id from users where phone=any($1::text[]) or email=$2',
        [[phone, ownerPhone], email],
      );
      if (found.rowCount) throw new Error('Team fixture contact is already in use');
      for (const recipient of recipients) {
        const response = await fetch(
          `${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:${recipient}`)}&limit=1`,
          { signal: AbortSignal.timeout(5000) },
        );
        if (!response.ok || (await response.json()).messages.length)
          throw new Error('Team fixture message address is already in use');
      }
      owned = true;
      const client = await database.pool.connect();
      try {
        await client.query('begin');
        await client.query(
          "insert into users(id,name,phone,phone_verified_at) values($1,'Team Owner',$2,now())",
          [ownerId, ownerPhone],
        );
        await client.query(
          "insert into users(id,name,email,email_verified_at) values($1,'Email Recipient',$2,now())",
          [emailUserId, email],
        );
        await client.query("insert into stores(id,name) values($1,'Team browser shop')", [storeId]);
        await client.query(
          "insert into memberships(id,store_id,user_id,built_in_role,status) values($3,$1,$2,'owner','active')",
          [storeId, ownerId, randomUUID()],
        );
        await client.query(
          'insert into plans(id,code,name,monthly_price_poisha,yearly_price_poisha,limits,is_public) values($1,$2,$3,0,0,$4,false)',
          [planId, `team-${planId}`, 'Team fixture', { seats: 5 }],
        );
        await client.query(
          "insert into subscriptions(id,store_id,plan_id,status,current_period_price_poisha,current_period_start,current_period_end) values($3,$1,$2,'active',0,now(),now()+interval '1 month')",
          [storeId, planId, randomUUID()],
        );
        await client.query(
          "insert into sessions(id,user_id,active_store_id,token_hash,expires_at) values($4,$1,$2,$3,now()+interval '1 hour')",
          [ownerId, storeId, createHash('sha256').update(token).digest(), randomUUID()],
        );
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    },
    async close() {
      if (!owned) return;
      const joined = await database.pool.query('select id from users where phone=$1 and name=$2', [
        phone,
        name,
      ]);
      const userIds = [ownerId, emailUserId, ...joined.rows.map((row) => row.id)];
      for (const table of [
        'ownership_transfers',
        'audit_log',
        'memberships',
        'roles',
        'subscriptions',
      ])
        await database.pool.query(`delete from ${table} where store_id=$1`, [storeId]);
      await database.pool.query('delete from sessions where user_id=any($1::uuid[])', [userIds]);
      await database.pool.query(
        'delete from account_security_events where user_id=any($1::uuid[])',
        [userIds],
      );
      await database.pool.query('delete from stores where id=$1', [storeId]);
      await database.pool.query('delete from users where id=any($1::uuid[])', [userIds]);
      await database.pool.query('delete from plans where id=$1', [planId]);
      for (const recipient of recipients) await deleteMessages(mailpitUrl, recipient);
      const remaining = await database.pool.query(
        'select id from users where id=any($1::uuid[]) union all select id from stores where id=$2 union all select id from plans where id=$3',
        [userIds, storeId, planId],
      );
      if (remaining.rowCount) throw new Error('Team fixture cleanup was incomplete');
    },
  };
}

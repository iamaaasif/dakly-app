import { randomInt, randomUUID } from 'node:crypto';

export function browserRegistration(database, mailpitUrl) {
  const marker = randomUUID();
  const phone = `019${randomInt(10000000, 99999999)}`;
  const planId = randomUUID();
  const planCode = `browser-${marker}`;
  const name = `Browser account ${marker}`;
  let owned = false;
  return {
    browser: { phone, name, planCode },
    async seed() {
      const found = await database.pool.query('select id from users where phone=$1', [phone]);
      if (found.rowCount) throw new Error('Registration fixture contact is already in use');
      const previous = await fetch(
        `${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:${phone}@sms.test`)}&limit=1`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (!previous.ok || (await previous.json()).messages.length)
        throw new Error('Registration fixture message address is already in use');
      owned = true;
      await database.pool.query(
        'insert into plans(id,code,name,monthly_price_poisha,yearly_price_poisha,trial_days,limits) values($1,$2,$3,0,0,0,$4)',
        [planId, planCode, 'Browser Free', { customers: 500, seats: 5 }],
      );
    },
    async close() {
      if (!owned) return;
      const account = await database.pool.query('select id from users where phone=$1 and name=$2', [
        phone,
        name,
      ]);
      const ids = account.rows.map((row) => row.id);
      const memberships = await database.pool.query(
        "select store_id from memberships where user_id=any($1::uuid[]) and built_in_role='owner'",
        [ids],
      );
      const stores = memberships.rows.map((row) => row.store_id);
      await database.pool.query('delete from sessions where user_id=any($1::uuid[])', [ids]);
      for (const table of [
        'contacts',
        'store_daily_metrics',
        'audit_log',
        'memberships',
        'subscriptions',
        'store_counters',
      ])
        await database.pool.query(`delete from ${table} where store_id=any($1::uuid[])`, [stores]);
      await database.pool.query('delete from stores where id=any($1::uuid[])', [stores]);
      await database.pool.query(
        'delete from account_security_events where user_id=any($1::uuid[])',
        [ids],
      );
      await database.pool.query('delete from users where id=any($1::uuid[])', [ids]);
      await database.pool.query('delete from plans where id=$1', [planId]);
      await deleteMessages(mailpitUrl, `${phone}@sms.test`);
      const remaining = await database.pool.query(
        'select id from users where id=any($1::uuid[]) union all select id from stores where id=any($2::uuid[]) union all select id from plans where id=$3',
        [ids, stores, planId],
      );
      if (remaining.rowCount) throw new Error('Registration fixture cleanup was incomplete');
    },
  };
}

export async function deleteMessages(api, recipient) {
  const response = await fetch(
    `${api}/api/v1/search?query=${encodeURIComponent(`to:${recipient}`)}&limit=100`,
    { signal: AbortSignal.timeout(5000) },
  );
  if (!response.ok) throw new Error('Could not inspect owned browser messages');
  const result = await response.json();
  if (result.messages.length > 100 || result.messages_count > 100)
    throw new Error('Owned browser message bound exceeded');
  const ids = [];
  for (const item of result.messages) {
    const message = await fetch(`${api}/api/v1/message/${item.ID}`, {
      signal: AbortSignal.timeout(5000),
    });
    const detail = await message.json();
    if (detail.To.length === 1 && detail.To[0].Address === recipient) ids.push(item.ID);
  }
  if (!ids.length) return;
  const deleted = await fetch(`${api}/api/v1/messages`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ IDs: ids }),
    signal: AbortSignal.timeout(5000),
  });
  if (!deleted.ok) throw new Error('Could not remove owned browser messages');
  for (const id of ids) {
    const remaining = await fetch(`${api}/api/v1/message/${id}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (remaining.status !== 404) throw new Error('Owned browser message cleanup was incomplete');
  }
}

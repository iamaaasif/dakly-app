import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const requireCore = createRequire(new URL('../packages/core/package.json', import.meta.url));

export function browserReview(database, environment, accessKey) {
  const ownerIds = Array.from({ length: 55 }, () => randomUUID());
  const userId = randomUUID(),
    staffId = randomUUID(),
    parentId = randomUUID();
  const storeIds = Array.from({ length: 55 }, () => randomUUID()).sort();
  const grantIds = [randomUUID(), randomUUID()];
  const token = randomBytes(32).toString('base64url');
  const customerId = randomUUID();
  const browser = {
    userId,
    staffId,
    storeIds,
    grantIds,
    token,
    customerId,
    staffToken: '',
    assertion: '',
  };
  return {
    browser,
    async seed() {
      const previous = process.env.STAFF_SESSION_SIGNING_KEY;
      try {
        process.env.STAFF_SESSION_SIGNING_KEY = environment.STAFF_SESSION_SIGNING_KEY;
        const { StaffTokens } = requireCore('./dist/admin/staff-tokens.js');
        browser.staffToken = await new StaffTokens().issue(
          { id: staffId, name: 'Review Support', role: 'support' },
          parentId,
          new Date(),
        );
      } finally {
        if (previous === undefined) delete process.env.STAFF_SESSION_SIGNING_KEY;
        else process.env.STAFF_SESSION_SIGNING_KEY = previous;
      }
      const { SignJWT } = requireCore('jose');
      browser.assertion = await new SignJWT({ email: `${staffId}@example.test`, type: 'app' })
        .setProtectedHeader({ alg: 'RS256', kid: 'browser-fixture' })
        .setIssuer('https://browser-fixture.cloudflareaccess.com')
        .setAudience('browser-fixture')
        .setSubject(staffId)
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(accessKey);
      const client = await database.pool.connect();
      try {
        await client.query('begin');
        await client.query(
          "insert into users(id,name,email,email_verified_at) select id,'Review Owner',id::text || '@example.test',now() from unnest($1::uuid[]) id",
          [ownerIds],
        );
        await client.query(
          "insert into users(id,name,email,email_verified_at) values($1::uuid,'Rina Akter Chowdhury Long Account Name',$1::uuid::text || '@example.test',now())",
          [userId],
        );
        await client.query(
          "insert into stores(id,name) select id,case when id=$2 then 'Dhaka Threads Mirpur South' else 'Dhaka Threads Mirpur North ' || ord end from unnest($1::uuid[]) with ordinality as item(id,ord)",
          [storeIds, storeIds.at(-1)],
        );
        for (const [index, storeId] of storeIds.entries()) {
          await client.query(
            "insert into memberships(id,store_id,user_id,built_in_role,status) values(gen_random_uuid(),$1,$2,'owner','active'),(gen_random_uuid(),$1,$3,'admin','active')",
            [storeId, ownerIds[index], userId],
          );
        }
        await client.query(
          "insert into sessions(id,user_id,active_store_id,token_hash,expires_at) values(gen_random_uuid(),$1,$2,$3,now()+interval '1 hour')",
          [userId, storeIds.at(-1), createHash('sha256').update(token).digest()],
        );
        await client.query(
          "insert into staff_users(id,email,name,role,access_subject,enrolled_at) values($1::uuid,$2,'Review Support','support',$1::uuid::text,now())",
          [staffId, `${staffId}@example.test`],
        );
        await client.query(
          "insert into staff_sessions(id,staff_user_id,token_hash,last_seen_at,expires_at) values($1,$2,$3,now(),now()+interval '1 hour')",
          [parentId, staffId, createHash('sha256').update(browser.staffToken).digest()],
        );
        for (const [index, grantId] of grantIds.entries()) {
          await client.query(
            "insert into support_grants(id,store_id,staff_user_id,scopes,access,status,reason,duration_minutes,approved_by_user_id,approved_at,expires_at) values($1,$2,$3,array['customers'],'write','approved','Review approved support access',30,$4,now(),now()+interval '30 minutes')",
            [grantId, storeIds[index], staffId, ownerIds[index]],
          );
        }
        await client.query(
          "insert into customers(id,store_id,name,phone) values($1,$2,'Private A customer','01712345678')",
          [customerId, storeIds[0]],
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
      for (const table of [
        'support_sessions',
        'support_grants',
        'customers',
        'audit_log',
        'memberships',
      ])
        await database.pool.query(`delete from ${table} where store_id=any($1::uuid[])`, [
          storeIds,
        ]);
      await database.pool.query('delete from sessions where user_id=$1', [userId]);
      await database.pool.query('delete from staff_audit_log where staff_user_id=$1', [staffId]);
      await database.pool.query('delete from staff_sessions where staff_user_id=$1', [staffId]);
      await database.pool.query('delete from staff_users where id=$1', [staffId]);
      await database.pool.query('delete from stores where id=any($1::uuid[])', [storeIds]);
      await database.pool.query('delete from users where id=any($1::uuid[])', [
        [userId, ...ownerIds],
      ]);
      const remaining = await database.pool.query(
        'select id from users where id=any($1::uuid[]) union all select id from stores where id=any($2::uuid[]) union all select id from staff_users where id=$3',
        [[userId, ...ownerIds], storeIds, staffId],
      );
      if (remaining.rowCount) throw new Error('Review browser fixture cleanup was incomplete');
    },
  };
}

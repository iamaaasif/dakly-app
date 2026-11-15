import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { browserRegistration } from './browser-registration.mjs';
import { browserTeam } from './browser-team.mjs';
import { browserSecurity } from './browser-security.mjs';

const requireWeb = createRequire(new URL('../apps/web/package.json', import.meta.url));

export function browserFixture(databaseUrl, mailpitUrl) {
  const { createDatabase } = requireWeb('@dakly/db/client');
  const database = createDatabase(databaseUrl);
  const registration = browserRegistration(database, mailpitUrl);
  const team = browserTeam(database, mailpitUrl);
  const security = browserSecurity(database, mailpitUrl);
  const userIds = [randomUUID(), randomUUID()];
  const storeIds = [randomUUID(), randomUUID()];
  const token = randomBytes(32).toString('base64url');
  return {
    browser: {
      token,
      storeIds,
      registration: registration.browser,
      team: team.browser,
      security: security.browser,
    },
    async seed() {
      await registration.seed();
      await team.seed();
      await security.seed();
      const client = await database.pool.connect();
      try {
        await client.query('begin');
        for (const id of userIds)
          await client.query(
            "insert into users(id,name,phone,phone_verified_at,email,email_verified_at) values($1,'রিনা',$2,now(),$3,now())",
            [id, `017${randomInt(10000000, 99999999)}`, `${id}@example.test`],
          );
        for (const [index, id] of storeIds.entries()) {
          await client.query('insert into stores(id,name) values($1,$2)', [
            id,
            index === 0 ? 'Dhaka Threads' : 'Sylhet Books',
          ]);
          await client.query(
            "insert into memberships(id,store_id,user_id,built_in_role,status) values($3,$1,$2,'owner','active')",
            [id, userIds[index], randomUUID()],
          );
        }
        await client.query(
          "insert into memberships(id,store_id,user_id,built_in_role,status) values($3,$1,$2,'marketer','active')",
          [storeIds[1], userIds[0], randomUUID()],
        );
        await client.query(
          "insert into sessions(id,user_id,active_store_id,token_hash,expires_at) values($4,$1,$2,$3,now()+interval '1 hour')",
          [userIds[0], storeIds[0], createHash('sha256').update(token).digest(), randomUUID()],
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
      try {
        const results = await Promise.allSettled([
          registration.close(),
          team.close(),
          security.close(),
          (async () => {
            for (const table of ['customers', 'audit_log', 'memberships'])
              await database.pool.query(`delete from ${table} where store_id=any($1::uuid[])`, [
                storeIds,
              ]);
            await database.pool.query('delete from sessions where user_id=any($1::uuid[])', [
              userIds,
            ]);
            await database.pool.query('delete from stores where id=any($1::uuid[])', [storeIds]);
            await database.pool.query('delete from users where id=any($1::uuid[])', [userIds]);
            const remaining = await database.pool.query(
              'select id from users where id=any($1::uuid[]) union all select id from stores where id=any($2::uuid[])',
              [userIds, storeIds],
            );
            if (remaining.rowCount !== 0) throw new Error('Browser fixture cleanup was incomplete');
          })(),
        ]);
        if (results.some((result) => result.status === 'rejected'))
          throw new Error('Owned browser fixture cleanup failed');
      } finally {
        await database.pool.end();
      }
    },
  };
}

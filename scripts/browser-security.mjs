import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { browserTeam } from './browser-team.mjs';
const require = createRequire(import.meta.url);

export function browserSecurity(database, mailpitUrl) {
  const fixture = browserTeam(database, mailpitUrl);
  const accountToken = randomBytes(32).toString('base64url');
  const password = randomBytes(24).toString('base64url') + '7';
  const deviceIds = [randomUUID(), randomUUID(), randomUUID()];
  return {
    browser: { ...fixture.browser, accountToken, password, deviceIds },
    async seed() {
      await fixture.seed();
      const { hashPassword } = require('../packages/core/dist/platform/crypto/password.js');
      await database.pool.query(
        'update users set phone=$2,phone_verified_at=now(),email_verified_at=null,password_hash=$3 where id=$1',
        [fixture.browser.emailUserId, fixture.browser.phone, await hashPassword(password)],
      );
      for (const [index, id] of deviceIds.entries()) {
        const token = index === 0 ? accountToken : randomBytes(32).toString('base64url');
        await database.pool.query(
          "insert into sessions(id,user_id,token_hash,user_agent,expires_at) values($1,$2,$3,$4,now()+interval '1 hour')",
          [
            id,
            fixture.browser.emailUserId,
            createHash('sha256').update(token).digest(),
            ['Chrome/1 Linux', 'Firefox/1 Windows', 'Safari/1 Macintosh'][index],
          ],
        );
      }
    },
    close: () => fixture.close(),
  };
}

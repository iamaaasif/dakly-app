import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import { createDatabase } from '@dakly/db/client';

test('shows what the AI agent did from chats, orders and AI runs', async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as {
    token: string;
    storeIds: [string, string];
  };
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const [shop] = fixture.storeIds;
  const staffUser = (
    await database.pool.query<{ user_id: string }>(
      'select user_id from memberships where store_id=$1 limit 1',
      [shop],
    )
  ).rows[0]!.user_id;
  try {
    const connection = (
      await database.pool.query<{ id: string }>('select gen_random_uuid()::text as id')
    ).rows[0]!.id;
    await database.pool.query(
      "insert into channel_connections(id,store_id,kind,external_account_id,display_name) values($1::uuid,$2,'facebook_page',$1::text,'Page')",
      [connection, shop],
    );
    // Twelve chats: seven resolved, two answered by a person, two handed over, one replied in the last hour.
    await database.pool.query(
      `with chats as (
         select n, gen_random_uuid() as contact_id, gen_random_uuid() as conversation_id
         from generate_series(1,12) n
       ), made as (
         insert into contacts(id,store_id,name,source,kind)
         select contact_id,$1,'গ্রাহক '||n,'messenger','chat_only' from chats returning id
       ), convos as (
         insert into conversations(id,store_id,contact_id,channel_connection_id,channel,handed_over_at,handover_reason)
         select c.conversation_id,$1,c.contact_id,$2,'messenger',
           case when n in (10,11) then now() - interval '2 days' end,
           case when n = 10 then 'refund' when n = 11 then 'discount' end
         from chats c join made m on m.id = c.contact_id returning id
       )
       insert into messages(id,store_id,conversation_id,direction,author_type,author_user_id,kind,body,status,created_at)
       select gen_random_uuid(),$1,c.conversation_id,'out','ai',null::uuid,'text','x','sent',
         case when n = 12 then now() - interval '1 hour' else now() - interval '3 days' end
       from chats c join convos v on v.id = c.conversation_id
       union all
       select gen_random_uuid(),$1,c.conversation_id,'out','user',$3::uuid,'text','x','sent',now() - interval '3 days'
       from chats c join convos v on v.id = c.conversation_id where n in (8,9)`,
      [shop, connection, staffUser],
    );
    const buyer = (
      await database.pool.query<{ id: string }>(
        'select id from contacts where store_id=$1 limit 1',
        [shop],
      )
    ).rows[0]!.id;
    for (let number = 1; number <= 4; number += 1)
      await database.pool.query(
        `insert into orders(id,store_id,number,source,created_by_type,buyer_contact_id,recipient_name,
           recipient_phone,recipient_address,recipient_district,items_subtotal_poisha,order_discount_poisha,
           cod_amount_poisha,stage,cancel_reason,created_at)
         values(gen_random_uuid(),$1,$2,'messenger','ai',$3,'x','01710000009','Mirpur','Dhaka',$4,0,$4,$5,
           case when $5 = 'cancelled' then 'duplicate' end, now() - interval '2 days')`,
        [shop, 9000 + number, buyer, 125000 * number, number === 4 ? 'cancelled' : 'to_pack'],
      );
    await database.pool.query(
      `insert into ai_runs(id,store_id,purpose,tier,model,prompt_version,cost_micro_usd,cost_poisha,outcome,created_at)
       select gen_random_uuid(),$1,'chat_reply','reply','m','v1',9000,110,'completed',now() - interval '2 days'
       from generate_series(1,30)`,
      [shop],
    );
    await context.addCookies([
      {
        name: 'dakly_session',
        value: fixture.token,
        url: baseURL!,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/analytics?tab=ai-agent');

    const figures = page.getByRole('list', { name: 'Key figures' });
    await expect(figures.getByText('12', { exact: true })).toBeVisible();
    // 7 resolved of 11 chats not replied in the last day.
    await expect(figures.getByText('63.6%')).toBeVisible();
    await expect(figures.getByText('৳33')).toBeVisible();
    await expect(page.getByText('Refund or exchange')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download' })).toHaveCount(0);

    const evidence = process.env.ANA4_EVIDENCE;
    if (evidence) await mkdir(evidence, { recursive: true });
    await page.evaluate(async () => document.fonts.ready);
    for (const [width, height] of [
      [1440, 900],
      [360, 800],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.reload();
      await expect(page.getByText('Refund or exchange')).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
      await page.evaluate(() => window.scrollTo(0, 0));
      if (evidence && width === 1440)
        await page.setViewportSize({
          width,
          height: Math.max(1240, await page.evaluate(() => document.documentElement.scrollHeight)),
        });
      if (evidence)
        await page.screenshot({ path: resolve(evidence, `ai-agent-${width}.png`), fullPage: true });
    }
  } finally {
    await database.pool.query('delete from ai_runs where store_id=$1', [shop]);
    await database.pool.query('delete from orders where store_id=$1 and number >= 9000', [shop]);
    await database.pool.query('delete from messages where store_id=$1', [shop]);
    await database.pool.query('delete from conversations where store_id=$1', [shop]);
    // Other specs count every contact in the shop, so leave none of these behind.
    await database.pool.query(
      "delete from contacts where store_id=$1 and kind='chat_only' and source='messenger'",
      [shop],
    );
    await database.pool.query(
      "delete from channel_connections where store_id=$1 and kind='facebook_page' and display_name='Page'",
      [shop],
    );
    await database.pool.end();
  }
});

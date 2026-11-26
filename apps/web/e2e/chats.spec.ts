import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { createDatabase } from '@dakly/db/client';

test.use({ screenshot: 'off' });

const people = [
  ['Sadia Islam', 'messenger', 'ai', 'open', 'Price koto? Mirpur e delivery charge koto?', 3],
  [
    'Mizan (Pathao rider)',
    'messenger',
    'human',
    'needs_you',
    'Bhai ami Pathao theke, apnar 3ta parcel',
    1,
  ],
  ['Rumana Akter', 'instagram', 'ai', 'open', 'eta ache? M size', 2],
  ['Habib Rahman', 'whatsapp', 'ai', 'later', 'Name Habib Rahman, address: House 12, Road 4', 1],
] as const;

test('lists chats by tab and channel and shows the tab counts', async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as {
    token: string;
    storeIds: [string, string];
  };
  const [storeId] = fixture.storeIds;
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const connectionId = randomUUID();
  const extraConnectionIds: string[] = [];
  const contactIds: string[] = [];
  let firstConversationId = '';
  try {
    await database.pool.query(
      "update stores set extensions = array['sales', 'chats', 'social_auto_post', 'physical_shop'] where id = $1",
      [storeId],
    );
    await database.pool.query(
      `insert into channel_connections (id, store_id, kind, external_account_id, display_name)
       values ($1::uuid, $2, 'facebook_page', $3, 'Dhaka Threads')`,
      [connectionId, storeId, connectionId],
    );
    // The channel filter lists only connected channels, so each channel in the fixture needs one.
    for (const kind of ['instagram', 'whatsapp']) {
      const extraId = randomUUID();
      extraConnectionIds.push(extraId);
      await database.pool.query(
        `insert into channel_connections (id, store_id, kind, external_account_id, display_name)
         values ($1::uuid, $2, $3, $1::text, $3)`,
        [extraId, storeId, kind],
      );
    }
    for (const [index, [name, channel, responder, status, preview, unread]] of people.entries()) {
      const contactId = randomUUID();
      contactIds.push(contactId);
      await database.pool.query(
        "insert into contacts (id, store_id, name, source, kind) values ($1, $2, $3, 'messenger', 'chat_only')",
        [contactId, storeId, name],
      );
      const conversationId = randomUUID();
      if (index === 0) firstConversationId = conversationId;
      await database.pool.query(
        `insert into conversations (id, store_id, contact_id, channel_connection_id, channel, status,
           responder, unread_count, last_message_at, last_message_preview, window_expires_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, now() - make_interval(mins => $9), $10, now() + interval '23 hours')`,
        [
          conversationId,
          storeId,
          contactId,
          connectionId,
          channel,
          status,
          responder,
          unread,
          index * 30,
          preview,
        ],
      );
    }
    const senderIdentityId = randomUUID();
    await database.pool.query(
      `insert into contact_identities (id, store_id, contact_id, channel_connection_id, channel, external_id)
       values ($1::uuid, $2, $3, $4, 'messenger', $1::text)`,
      [senderIdentityId, storeId, contactIds[0], connectionId],
    );
    const thread = [
      ['in', 'customer', 'Kurti ta M size ache?', 'received', 20],
      ['out', 'ai', 'Ji, M size ache. Dam ৳1,200.', 'sent', 19],
      ['in', 'customer', 'Price koto? Mirpur e delivery charge koto?', 'received', 18],
    ] as const;
    for (const [direction, authorType, body, status, minutesAgo] of thread) {
      await database.pool.query(
        `insert into messages (id, store_id, conversation_id, direction, author_type, kind, body, status,
           sender_identity_id, created_at, sent_at)
         values ($1, $2, $3, $4, $5, 'text', $6, $7, $8, now() - make_interval(mins => $9),
           case when $4 = 'out' then now() - make_interval(mins => $9) end)`,
        [
          randomUUID(),
          storeId,
          firstConversationId,
          direction,
          authorType,
          body,
          status,
          direction === 'in' ? senderIdentityId : null,
          minutesAgo,
        ],
      );
    }
    await database.pool.query(
      'insert into ai_agent_settings (store_id, is_auto_reply_on) values ($1, true)',
      [storeId],
    );
    const productId = randomUUID();
    await database.pool.query(
      "insert into products(id, store_id, name, is_stock_tracked, price_poisha) values ($1, $2, 'Women''s Kurti', true, 125000)",
      [productId, storeId],
    );
    for (const [title, onHand] of [
      ['M', 3],
      ['L', 0],
    ] as const)
      await database.pool.query(
        'insert into product_variants(id, store_id, product_id, title, on_hand) values ($1, $2, $3, $4, $5)',
        [randomUUID(), storeId, productId, title, onHand],
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
    expect(
      (
        await context.request.post('/api/me/active-store', {
          headers: { Origin: baseURL! },
          data: { storeId },
        })
      ).status(),
    ).toBe(204);

    // The folder column starts open only at 1,536px and wider.
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto('/chats');
    await expect(page.getByRole('link', { name: /^All conversations\s*4$/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Needs you\s*1$/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /^AI handling\s*3$/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Follow up\s*1$/ })).toBeVisible();
    await expect(page.getByText('Sadia Islam')).toBeVisible();
    await capture(page, 'all');
    // A mouse picks chats from the tick box that covers the avatar on hover.
    await page.getByRole('link', { name: /Sadia Islam/ }).hover();
    await page.getByRole('checkbox', { name: 'Select Sadia Islam' }).click();
    await expect(page.getByText('1 selected')).toBeVisible();
    await capture(page, 'bulk-select');
    await page.getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('link', { name: /^Needs you/ }).click();
    await expect(page).toHaveURL(/tab=needs-you/);
    await expect(page.getByText('Mizan (Pathao rider)')).toBeVisible();
    await expect(page.getByText('Sadia Islam')).toBeHidden();

    await page.getByRole('link', { name: /^All conversations\s*4$/ }).click();
    // Wait for the tab to clear, or the Instagram link is clicked with the old tab still in it.
    await expect(page).not.toHaveURL(/tab=/);
    await page.getByRole('button', { name: 'Channels' }).click();
    await page
      .getByRole('navigation', { name: 'Channel' })
      .getByRole('link', { name: 'Instagram' })
      .click();
    await expect(page).toHaveURL(/channel=instagram/);
    await expect(page.getByText('Rumana Akter')).toBeVisible();
    await expect(page.getByText('Sadia Islam')).toBeHidden();
    await page.getByRole('button', { name: 'Channels' }).click();
    await page
      .getByRole('navigation', { name: 'Channel' })
      .getByRole('link', { name: 'All', exact: true })
      .click();

    await page.getByRole('link', { name: /Sadia Islam/ }).click();
    await expect(page).toHaveURL(/chat=/);
    const chat = page.getByRole('region', { name: 'Conversation', exact: true });
    await expect(chat).toBeVisible();
    await expect(page.getByLabel('Write a reply')).toBeVisible();
    const inboxToggle = page.getByRole('button', { name: /^(Collapse|Expand) inbox folders$/ });
    const chatList = page.getByRole('region', { name: 'Chat list' });
    const replyBox = page.getByLabel('Write a reply');
    await replyBox.fill('Unsent reply');
    const expandedLeft = await chatList.evaluate((element) => element.getBoundingClientRect().left);
    await inboxToggle.click();
    await expect(inboxToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('navigation', { name: 'Chat tabs' })).toBeHidden();
    const controls = page.getByRole('group', { name: 'Inbox controls' });
    await expect(controls.getByRole('heading', { name: 'Inbox' })).toBeVisible();
    await expect(controls.getByRole('button', { name: 'Expand inbox folders' })).toBeFocused();
    const workspaceLeft = await page
      .getByRole('main')
      .evaluate((element) => element.getBoundingClientRect().left);
    expect(workspaceLeft).toBeLessThan(expandedLeft);
    await expect
      .poll(() => chatList.evaluate((element) => element.getBoundingClientRect().left))
      .toBe(workspaceLeft);
    await expect(replyBox).toHaveValue('Unsent reply');
    await inboxToggle.click();
    await expect(inboxToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('navigation', { name: 'Chat tabs' })).toBeVisible();
    await replyBox.clear();
    await capture(page, 'thread');
    await expect(page.getByText('Dakly AI is handling this chat')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Take over' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Done' })).toBeVisible();
    await capture(page, 'take-over');
    await database.pool.query(
      'update ai_agent_settings set is_auto_reply_on = false where store_id = $1',
      [storeId],
    );
    await page.reload();
    await expect(page.getByText(/AI auto-reply is off, so Dakly AI will not answer/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Turn on AI auto-reply' })).toBeVisible();
    await capture(page, 'auto-reply-off');
    await database.pool.query(
      'update ai_agent_settings set is_auto_reply_on = true where store_id = $1',
      [storeId],
    );
    await page.reload();
    await expect(page.getByText('Dakly AI is handling this chat')).toBeVisible();
    await page.getByRole('button', { name: /^Label/ }).click();
    await page.getByLabel('New label').fill('VIP');
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByRole('checkbox', { name: 'VIP' })).toBeChecked();
    await capture(page, 'labels');
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: 'Internal note' }).click();
    await page.getByLabel('Write an internal note').fill('Call at 5 pm');
    await page.getByRole('button', { name: 'Save note' }).click();
    await expect(page.getByText('Call at 5 pm')).toBeVisible();
    await expect(page.getByRole('form', { name: 'Make an order' })).toBeVisible();
    await expect(page.getByText('No delivery history yet.')).toBeVisible();
    await page.getByLabel('Product').selectOption({ label: "Women's Kurti" });
    await expect(page.getByRole('option', { name: 'L · sold out' })).toBeDisabled();
    await page.getByLabel('Size').selectOption({ label: 'M · only 3 left' });
    await capture(page, 'customer-panel');

    const conversationPanel = page.getByRole('region', { name: 'Conversation' });
    const customer = page.getByRole('complementary', { name: 'Customer' });
    await page.setViewportSize({ width: 360, height: 800 });
    await expect(conversationPanel).toBeVisible();
    await expect(page.getByRole('region', { name: 'Chat list' })).toBeHidden();
    await conversationPanel.getByRole('link', { name: 'Customer' }).click();
    await expect(customer.getByRole('form', { name: 'Make an order' })).toBeVisible();
    await expect(conversationPanel).toBeHidden();
    await customer.getByRole('link', { name: 'Back to chat' }).click();
    await expect(conversationPanel).toBeVisible();

    await database.pool.query(
      `insert into messages (id, store_id, conversation_id, direction, author_type, kind, body, status,
         sender_identity_id, created_at)
       select gen_random_uuid(), $1, $2, 'in', 'customer', 'text', 'Earlier message ' || age, 'received', $3,
              now() - make_interval(hours => 3, mins => age)
       from generate_series(1, 60) as age`,
      [storeId, firstConversationId, senderIdentityId],
    );
    await page.reload();
    const history = conversationPanel.getByRole('region', { name: 'Message history' });
    await expect(history.getByText('Call at 5 pm')).toBeInViewport();
    await history.evaluate((element) => {
      element.scrollTop = 0;
    });
    const firstLoaded = await history.getByRole('listitem').first().textContent();
    await history.getByRole('button', { name: 'Show earlier messages' }).click();
    await expect(history.getByText('Earlier message 60', { exact: true })).toBeAttached();
    await expect(
      history.getByRole('listitem').filter({ hasText: firstLoaded ?? '' }),
    ).toBeInViewport();

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/chats');

    await page.getByRole('searchbox', { name: 'Search chats' }).fill('Habib');
    await expect(page).toHaveURL(/q=Habib/);
    await expect(page.getByText('Habib Rahman', { exact: true })).toBeVisible();
    await expect(page.getByText('Sadia Islam')).toBeHidden();
    await page.getByRole('button', { name: 'Filter' }).click();
    await expect(page.getByText('Assigned to')).toBeVisible();
    await capture(page, 'search-filter');
    await page.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('searchbox', { name: 'Search chats' }).fill('');
    await page.getByRole('combobox', { name: 'Sort chats' }).click();
    await page.getByRole('option', { name: 'Unread first' }).click();
    await expect(page).toHaveURL(/sort=unread/);
    await expect(page.getByText('Sadia Islam')).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
  } finally {
    await database.pool.query('delete from ai_agent_settings where store_id = $1', [storeId]);
    await database.pool.query('delete from product_variants where store_id = $1', [storeId]);
    await database.pool.query('delete from products where store_id = $1', [storeId]);
    await database.pool.query('delete from messages where store_id = $1', [storeId]);
    await database.pool.query('delete from contact_identities where store_id = $1', [storeId]);
    await database.pool.query('delete from conversations where store_id = $1', [storeId]);
    await database.pool.query('delete from contacts where id = any($1::uuid[])', [contactIds]);
    await database.pool.query('delete from channel_connections where id = any($1::uuid[])', [
      [connectionId, ...extraConnectionIds],
    ]);
    await database.pool.end();
  }
});

async function capture(page: Page, screen: string) {
  const evidence = process.env.CHAT5_SCREENSHOT_DIR;
  if (!evidence) return;
  await mkdir(evidence, { recursive: true });
  for (const [width, height] of [
    [1600, 900],
    [360, 800],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await page.screenshot({ path: resolve(evidence, `${screen}-${width}.png`) });
  }
  await page.setViewportSize({ width: 1600, height: 900 });
}

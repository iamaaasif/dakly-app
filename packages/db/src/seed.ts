import { eq } from 'drizzle-orm';

import { createDatabase } from './client';
import { platformSettings } from './schema/admin';
import { aiAgentSettings } from './schema/ai';
import { users } from './schema/auth';
import { plans, subscriptions } from './schema/billing';
import { contacts } from './schema/contacts';
import { deliveryZones } from './schema/orders';
import { productCategories, products, productVariants } from './schema/products';
import { brandProfiles } from './schema/social';
import { storeCounters, stores } from './schema/stores';
import { memberships } from './schema/team';

// Local development data only. Runs as the table owner (DATABASE_ADMIN_URL), so RLS does not
// apply. Prices are the prototype's and the limits are placeholders until Q1; the models are the
// Q8 working assumption. None of these are decisions.
const DEMO_SLUG = 'demo-shop';
const DAY = 24 * 60 * 60 * 1000;

type Database = ReturnType<typeof createDatabase>['db'];
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

async function seed(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('The seed is for local development only');
  }
  const url = process.env.DATABASE_ADMIN_URL;
  if (!url) {
    throw new Error('DATABASE_ADMIN_URL is not set');
  }
  const { db, pool } = createDatabase(url);

  await seedPlatform(db);

  const existing = await db
    .select({ id: stores.id })
    .from(stores)
    .where(eq(stores.slug, DEMO_SLUG));
  if (existing.length > 0) {
    await pool.end();
    return;
  }

  await db.transaction(async (tx) => {
    const storeId = await seedStore(tx);
    await seedCatalogue(tx, storeId);
    await seedContacts(tx, storeId);
  });

  await pool.end();
}

async function seedPlatform(db: Database): Promise<void> {
  await db
    .insert(plans)
    .values([
      planRow('free', 'Free', 0, 0, 0),
      planRow('starter', 'Starter', 149_000, 1_490_000, 1),
      planRow('growth', 'Growth', 349_000, 3_490_000, 2),
      planRow('pro', 'Pro', 799_000, 7_990_000, 3),
    ])
    .onConflictDoNothing({ target: plans.code });

  await db
    .insert(platformSettings)
    .values([
      {
        key: 'ai.models',
        value: {
          reply: 'gpt-6-luna',
          writer: 'gpt-6.1-terra',
          vision: 'gpt-6-luna',
          fast: 'gpt-6-luna',
          embed: 'text-embedding-3-large',
          transcribe: 'gpt-4o-transcribe',
        },
      },
      { key: 'billing.vat_rate_basis_points', value: 1500 },
    ])
    .onConflictDoNothing({ target: platformSettings.key });
}

async function seedStore(tx: Transaction): Promise<string> {
  const [owner] = await tx
    .insert(users)
    .values({ name: 'Demo Owner', phone: '01700000000', phoneVerifiedAt: new Date() })
    .returning({ id: users.id });
  const [store] = await tx
    .insert(stores)
    .values({
      name: 'Demo Shop',
      slug: DEMO_SLUG,
      district: 'Dhaka',
      howYouSell: ['social_media'],
      extensions: ['chats', 'sales', 'social_auto_post'],
    })
    .returning({ id: stores.id });
  const storeId = store!.id;
  const [growth] = await tx.select({ id: plans.id }).from(plans).where(eq(plans.code, 'growth'));
  const now = new Date();

  await tx.insert(memberships).values({
    storeId,
    userId: owner!.id,
    builtInRole: 'owner',
    status: 'active',
    joinedAt: now,
  });
  await tx.insert(storeCounters).values({ storeId });
  await tx.insert(subscriptions).values({
    storeId,
    planId: growth!.id,
    status: 'trialing',
    currentPeriodPricePoisha: 349_000,
    trialEndsAt: new Date(now.getTime() + 14 * DAY),
    currentPeriodStart: now,
    currentPeriodEnd: new Date(now.getTime() + 14 * DAY),
  });
  await tx.insert(aiAgentSettings).values({ storeId });
  await tx
    .insert(brandProfiles)
    .values({ storeId, defaultTone: 'friendly', languages: ['bn', 'en'] });
  // Area ids from the bd_areas seed: 301 Dhaka, 303 Gazipur, 309 Narayanganj.
  await tx.insert(deliveryZones).values([
    { storeId, name: 'Inside Dhaka', chargePoisha: 6_000, bdAreaIds: [301], position: 0 },
    { storeId, name: 'Dhaka suburbs', chargePoisha: 10_000, bdAreaIds: [303, 309], position: 1 },
    { storeId, name: 'Outside Dhaka', chargePoisha: 12_000, isDefault: true, position: 2 },
  ]);
  return storeId;
}

async function seedCatalogue(tx: Transaction, storeId: string): Promise<void> {
  const [clothing] = await tx
    .insert(productCategories)
    .values({ storeId, name: 'Clothing' })
    .returning({ id: productCategories.id });
  const [kurti] = await tx
    .insert(products)
    .values({
      storeId,
      name: "Women's Cotton Kurti",
      categoryId: clothing!.id,
      aliases: ['kurti', 'কুর্তি'],
      pricePoisha: 185_000,
      options: [{ name: 'Size', values: ['S', 'M', 'L'] }],
    })
    .returning({ id: products.id });
  await tx.insert(productVariants).values(
    ['S', 'M', 'L'].map((size, position) => ({
      storeId,
      productId: kurti!.id,
      title: size,
      optionValues: { Size: size },
      costPoisha: 110_000,
      onHand: 5,
      position,
    })),
  );
  const [panjabi] = await tx
    .insert(products)
    .values({
      storeId,
      name: 'Cotton Panjabi',
      categoryId: clothing!.id,
      aliases: ['panjabi', 'পাঞ্জাবি'],
      pricePoisha: 220_000,
    })
    .returning({ id: products.id });
  await tx.insert(productVariants).values({
    storeId,
    productId: panjabi!.id,
    title: 'Default',
    isDefault: true,
    costPoisha: 140_000,
    onHand: 2,
  });
}

async function seedContacts(tx: Transaction, storeId: string): Promise<void> {
  await tx.insert(contacts).values([
    {
      storeId,
      name: 'Sadia Islam',
      phone: '01711000001',
      district: 'Dhaka',
      source: 'manual',
      kind: 'customer',
    },
    {
      storeId,
      name: 'Habib Rahman',
      phone: '01811000002',
      district: 'Sylhet',
      source: 'messenger',
      kind: 'lead',
    },
  ]);
}

function planRow(code: string, name: string, monthly: number, yearly: number, position: number) {
  const limits = {
    customers: [500, 2_000, 10_000, 50_000][position],
    seats: [1, 2, 5, 15][position],
    ai_conversation: [0, 300, 1_500, 5_000][position],
    ai_content: [20, 100, 400, 1_500][position],
    ai_ask: [20, 100, 400, 1_500][position],
    // Placeholder for local data; the real per-plan page quota is set in the plan catalogue.
    ai_scan: [10, 50, 200, 800][position],
  };
  return {
    code,
    name,
    trialDays: code === 'free' ? 0 : 14,
    monthlyPricePoisha: monthly,
    yearlyPricePoisha: yearly,
    limits,
    position,
  };
}

void seed();

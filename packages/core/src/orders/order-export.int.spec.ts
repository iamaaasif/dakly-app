import 'reflect-metadata';

import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { readSheet } from 'read-excel-file/node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { DatabaseModule } from '../platform/database/database.module';
import { AppErrorFilter } from '../platform/errors/app-error.filter';
import { registerSessionCookies } from '../platform/http/session-cookie';
import { SessionsModule } from '../sessions/sessions.module';
import { SessionsService } from '../sessions/sessions.service';
import { OrdersModule } from './orders.module';

class TestModule {}
Module({ imports: [DatabaseModule, SessionsModule, OrdersModule] })(TestModule);

describe('order export over Fastify and Postgres', () => {
  const fixture = new OwnerIsolationFixture();
  const sql = (query: string, values: unknown[] = []) =>
    fixture.connection.pool.query(query, values);
  let app: NestFastifyApplication;
  let cookie: string;
  let roleId: string;
  let buyerId: string;

  beforeAll(async () => {
    await fixture.setup();
    await sql("update stores set time_zone='Asia/Dhaka', extensions='{sales}' where id=$1", [
      fixture.a,
    ]);
    const role = await sql(
      "insert into roles(id,store_id,name,permissions,can_export_lists) values(gen_random_uuid(),$1,'Orders test','{}',true) returning id",
      [fixture.a],
    );
    roleId = role.rows[0].id;
    await sql('update memberships set built_in_role=null,role_id=$1 where id=$2', [
      roleId,
      fixture.memberA,
    ]);
    const buyer = await sql(
      "insert into contacts(id,store_id,name,kind,source) values(gen_random_uuid(),$1,'Updated buyer name','customer','manual') returning id",
      [fixture.a],
    );
    buyerId = buyer.rows[0].id;
    const product = await sql(
      "insert into products(id,store_id,name) values(gen_random_uuid(),$1,'Live catalog name'),(gen_random_uuid(),$2,'Other shop') returning id",
      [fixture.a, fixture.b],
    );
    const variants = await sql(
      "insert into product_variants(id,store_id,product_id,title,price_override_poisha) values(gen_random_uuid(),$1,$2,'Live',990000),(gen_random_uuid(),$3,$4,'Other',990000) returning id",
      [fixture.a, product.rows[0].id, fixture.b, product.rows[1].id],
    );
    await sql(
      `insert into orders(id,store_id, number, source, created_by_type, stage, on_hold_reason, courier,
        created_at, buyer_contact_id, buyer_name, recipient_name, recipient_phone, recipient_address,
        recipient_district, items_subtotal_poisha, delivery_charge_poisha, order_discount_poisha,
        advance_paid_poisha, cod_amount_poisha)
      select gen_random_uuid(), store_id, number, source, 'user', stage, case when stage='on_hold' then 'pre_order' end,
        courier, created_at, buyer_id, buyer_name, people.recipient_name, '01712345678', 'Road 1',
        'Dhaka', 28400, 6350, 1110, 5030, 28610
      from (values
        ($1::uuid,101,'manual','on_hold','pathao','2026-10-11T19:00Z'::timestamptz,$3::uuid,'=Buyer'),
        ($1,102,'manual','to_pack','pathao','2026-10-11T19:00Z',$3,'=Buyer'),
        ($1,103,'whatsapp','to_confirm','pathao','2026-10-11T19:00Z',$3,'=Buyer'),
        ($1,104,'manual','to_confirm','redx','2026-10-11T19:00Z',$3,'=Buyer'),
        ($1,105,'manual','to_confirm','pathao','2026-10-11T17:59Z',$3,'=Buyer'),
        ($1,106,'manual','to_confirm','pathao','2026-10-11T19:00Z',$3,'Other'),
        ($1,107,'manual','to_confirm','pathao','2026-10-11T19:00Z',null,'=Buyer'),
        ($2,108,'manual','to_confirm','pathao','2026-10-11T19:00Z',null,'=Buyer')
      ) as matches(store_id, number, source, stage, courier, created_at, buyer_id, buyer_name)
      cross join lateral (select case when number=106 then 'Unrelated' else '"Recipient", Dhaka' end as recipient_name) as people`,
      [fixture.a, fixture.b, buyerId],
    );
    await sql(
      `insert into order_items(id,store_id,order_id,variant_id,product_name,variant_title,quantity,
        unit_price_poisha,line_discount_poisha,is_stock_tracked,created_at)
      select gen_random_uuid(),store_id,id,case when store_id=$1 then $3::uuid else $4::uuid end,
        '  +Saved product','@Saved variant',2,12525,100,false,'2026-10-10T00:00Z'
      from orders where store_id in ($1,$2)`,
      [fixture.a, fixture.b, variants.rows[0].id, variants.rows[1].id],
    );
    await sql(
      `insert into order_items(id,store_id,order_id,variant_id,product_name,variant_title,quantity,
        unit_price_poisha,line_discount_poisha,is_stock_tracked,created_at)
      select gen_random_uuid(),store_id,id,$2,'Second line','Small',1,3450,0,false,'2026-10-10T00:01Z'
      from orders where store_id=$1 and number=101`,
      [fixture.a, variants.rows[0].id],
    );
    app = await NestFactory.create<NestFastifyApplication>(TestModule, new FastifyAdapter(), {
      logger: false,
    });
    await registerSessionCookies(app);
    app.useGlobalFilters(new AppErrorFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    const sessions = app.get(SessionsService);
    const created = await sessions.create(fixture.userA, { isRemembered: true });
    await sessions.setActiveStore(fixture.userA, created.session.id, fixture.a);
    cookie = `dakly_session=${created.token}`;
  });

  afterAll(async () => {
    await app?.close();
    await sql('delete from sessions where user_id=$1', [fixture.userA]);
    for (const table of ['orders', 'product_variants', 'products'])
      await sql(`delete from ${table} where store_id in ($1,$2)`, [fixture.a, fixture.b]);
    await fixture.close();
  });

  const access = (view: boolean, exportLists: boolean, fullPhone = false) =>
    sql('update roles set permissions=$1,can_export_lists=$2,can_see_full_phone=$3 where id=$4', [
      view ? { orders: 'view' } : {},
      exportLists,
      fullPhone,
      roleId,
    ]);

  const download = (query: string) =>
    app.inject({ url: `/orders/export?${query}`, headers: { cookie } });

  it.each([
    [false, true, 'PERMISSION_DENIED'],
    [true, false, 'ORDER_EXPORT_NOT_ALLOWED'],
  ])('requires Orders view %s and list export %s', async (view, exportLists, code) => {
    await access(view, exportLists);
    const response = await download('format=csv');
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe(code);
  });

  it('exports saved lines that match the pipeline filters and masks the phone in CSV', async () => {
    await access(true, true);
    const response = await download(
      `format=csv&stage=on_hold&search=Buyer&source=manual&courier=pathao&createdFrom=2026-10-12&createdThrough=2026-10-12&buyerContactId=${buyerId}`,
    );
    expect(response.statusCode).toBe(200);
    expect(response.headers).toMatchObject({
      'cache-control': 'no-store',
      'content-type': 'text/csv; charset=utf-8',
      'x-row-count': '2',
    });
    expect(response.body.split('\r\n')).toEqual([
      '\uFEFF"Order number","Order date","Stage","Buyer","Recipient","Phone","District","Product","Variant","Quantity","Unit price","Line discount","Delivery charge","Order discount","Advance","COD to collect"',
      `"101","2026-10-12","On hold","'=Buyer","""Recipient"", Dhaka","01712-XXX678","Dhaka","'  +Saved product","'@Saved variant","2","125.25","1.00","63.50","11.10","50.30","286.10"`,
      `"101","2026-10-12","On hold","'=Buyer","""Recipient"", Dhaka","01712-XXX678","Dhaka","Second line","Small","1","34.50","0.00","63.50","11.10","50.30","286.10"`,
      '',
    ]);
    const audit = await sql(
      "select actor_user_id, after->>'state' as state from audit_log where store_id=$1 and action='orders.exported'",
      [fixture.a],
    );
    expect(audit.rows).toEqual([{ actor_user_id: fixture.userA, state: '2_rows' }]);
  });

  it('keeps formula-like values as XLSX text and honors both phone search and alert access', async () => {
    await access(true, true, true);
    const response = await download(
      'format=xlsx&alert=waiting&search=01712345678&source=manual&courier=redx',
    );
    expect(response.statusCode).toBe(200);
    const [, row] = await readSheet(response.rawPayload, { trim: false });
    expect(response.headers['x-row-count']).toBe('1');
    expect(row?.slice(0, 9)).toEqual([
      104,
      '2026-10-12',
      'To confirm',
      '=Buyer',
      '"Recipient", Dhaka',
      '01712345678',
      'Dhaka',
      '  +Saved product',
      '@Saved variant',
    ]);
    await access(true, true);
    const searched = await download('format=xlsx&alert=waiting&search=01712345678');
    expect(searched.headers['x-row-count']).toBe('0');
    const masked = await download('format=xlsx&search=%23104');
    expect((await readSheet(masked.rawPayload))[1]?.[5]).toBe('01712-XXX678');
  });

  it('exports the delivered quantities and discounts that match a part delivery total', async () => {
    await access(true, true);
    const updated = await sql(
      `update orders set stage='partially_delivered', delivered_items_subtotal_poisha=12475,
         delivered_order_discount_poisha=555, cod_amount_poisha=13240
       where store_id=$1 and number=103 returning id`,
      [fixture.a],
    );
    await sql(
      `update order_items set delivered_quantity=1, delivered_line_discount_poisha=50
       where store_id=$1 and order_id=$2`,
      [fixture.a, updated.rows[0].id],
    );
    const response = await download('format=csv&stage=delivered&search=%23103');
    expect(response.statusCode).toBe(200);
    expect(response.headers['x-row-count']).toBe('1');
    expect(response.body.split('\r\n')[1]).toContain(
      '"1","125.25","0.50","63.50","5.55","50.30","132.40"',
    );
  });

  it('never includes order lines from another shop', async () => {
    await access(true, true);
    const response = await download('format=csv&search=%23108');
    expect(response.statusCode).toBe(200);
    expect(response.headers['x-row-count']).toBe('0');
  });

  it('returns an error when the file would exceed 50,000 saved lines', async () => {
    await access(true, true);
    await sql(
      `insert into order_items(id,store_id,order_id,variant_id,product_name,variant_title,quantity,
        unit_price_poisha,is_stock_tracked)
      select gen_random_uuid(), item.store_id, item.order_id, item.variant_id, item.product_name,
        item.variant_title, 1, item.unit_price_poisha, false
      from order_items as item join orders on (orders.id = item.order_id and orders.store_id = item.store_id)
      cross join generate_series(1, 50000)
      where item.store_id=$1 and orders.number=106`,
      [fixture.a],
    );
    const response = await download('format=csv&search=%23106');
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('ORDER_EXPORT_TOO_LARGE');
  });
});

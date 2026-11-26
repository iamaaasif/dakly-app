import { describe, expect, it } from 'vitest';

import { checkReplyFacts } from './reply-fact-check';

const shop = { phone: '01712345678', linkBaseUrl: 'https://dkly.link/l' };
const results = [
  {
    products: [{ name: 'কটন পাঞ্জাবি', variants: [{ priceTaka: 1200, stock: 8 }] }],
  },
  { places: [{ area: 'Dhaka', chargeTaka: 60 }] },
];
const check = (reply: string, toolResults: unknown[] = results) =>
  checkReplyFacts(reply, toolResults, shop);

describe('checkReplyFacts free size', () => {
  it('allows Free size but still rejects a free offer', () => {
    expect(check('শাড়িটি Free সাইজ, দাম ৳1200।').isSafe).toBe(true);
    expect(check('Free size, ৳1200 tk.').isSafe).toBe(true);
    expect(check('Free delivery, ৳1200 tk.')).toEqual({ isSafe: false, failure: 'offer' });
  });
});

describe('checkReplyFacts numbers next to a comma', () => {
  const shoes = [{ products: [{ name: 'Canvas', variants: [{ title: '41', priceTaka: 1500 }] }] }];
  const lakh = [{ products: [{ name: 'Sofa', variants: [{ title: 'Set', priceTaka: 150000 }] }] }];

  it('does not read a size before a comma as the price, in each language', () => {
    for (const reply of [
      'ক্যানভাস জুতা, সাইজ ৪১, ৳১৫০০।',
      'ক্যানভাস জুতা সাইজ ৪১, ১৫০০ টাকা।',
      'Canvas juta size 41, 1500 tk.',
      'Canvas shoes, size 41, ৳1500.',
      'জুতা size 41,৳1500 এ আছে।',
    ])
      expect(checkReplyFacts(reply, shoes, shop), reply).toEqual({ isSafe: true });
  });

  it('does not read a size followed by a space and the price as an amount', () => {
    for (const reply of [
      'Loafer size 41 ekhon stock-e nei. Similar canvas shoe size 41 ৳1500-e ache.',
      'ক্যানভাস জুতা সাইজ ৪১ ৳১৫০০।',
      'Canvas size 41 1500 tk.',
    ])
      expect(checkReplyFacts(reply, shoes, shop), reply).toEqual({ isSafe: true });
  });

  it('still rejects a wrong price next to a size', () => {
    for (const reply of [
      'সাইজ ৪১, ৳১৪০০।',
      'size 41, 1400 tk.',
      'Size 41, ৳1,400.',
      'size 41 ৳1400',
    ])
      expect(checkReplyFacts(reply, shoes, shop), reply).toEqual({
        isSafe: false,
        failure: 'amount',
      });
  });

  it('reads comma-grouped amounts whole, including lakh grouping', () => {
    expect(checkReplyFacts('সোফা সেটের দাম ৳১,৫০,০০০।', lakh, shop)).toEqual({ isSafe: true });
    expect(checkReplyFacts('Sofa set 1,50,000 tk.', lakh, shop)).toEqual({ isSafe: true });
    expect(checkReplyFacts('Sofa set ৳150,000.', lakh, shop)).toEqual({ isSafe: true });
    expect(checkReplyFacts('Sofa set ৳1,50,001.', lakh, shop)).toEqual({
      isSafe: false,
      failure: 'amount',
    });
  });
});

describe('checkReplyFacts budgets', () => {
  const reply = (text: string, customer: string) =>
    checkReplyFacts(text, results, shop, [customer]);

  it('lets a reply repeat the customer budget as a limit, in each language', () => {
    expect(
      reply('জি, ২০০০ টাকার নিচে পাঞ্জাবি আছে। দাম ৳1200।', '২০০০ টাকার নিচে পাঞ্জাবি আছে?').isSafe,
    ).toBe(true);
    expect(
      reply('2000 taka er moddhe punjabi ache, dam 1200 tk.', '2000 taka er moddhe punjabi ache?')
        .isSafe,
    ).toBe(true);
    expect(
      reply('Yes, under 2000 taka we have it at 1200 tk.', 'anything under 2000 taka?').isSafe,
    ).toBe(true);
  });

  it('rejects a budget promise when the product costs more or no price is quoted', () => {
    const failed = { isSafe: false, failure: 'amount' };
    expect(reply('জি, ১০০০ টাকার মধ্যে হবে।', '১০০০ takar moddhe hobe?')).toEqual(failed);
    expect(reply('জি, ১০০০ টাকার মধ্যে হবে, দাম ৳1200।', '১০০০ এর মধ্যে দিবেন?')).toEqual(failed);
    expect(reply('1000 takar moddhe hobe, dam 1200 tk.', '1000 takar moddhe hobe?')).toEqual(
      failed,
    );
    expect(reply('Yes, under 1000 taka. It is 1200 tk.', 'can you do it under 1000')).toEqual(
      failed,
    );
    expect(reply('Yes, under 1000 taka.', 'can you do it under 1000')).toEqual(failed);
    expect(reply('জি, ১০০০ এর মধ্যে হবে।', '১০০০ এর মধ্যে দিবেন?')).toEqual(failed);
    expect(reply('Sure, under 1000 is fine.', 'can you do it under 1000')).toEqual(failed);
  });

  it('rejects a customer number used as the price', () => {
    expect(reply('জি, ৩০০ টাকায় পাঞ্জাবি হবে।', '৩০০ টাকায় হবে?')).toEqual({
      isSafe: false,
      failure: 'amount',
    });
    expect(reply('Yes, price is 500 tk.', 'dam 500 tk na?')).toEqual({
      isSafe: false,
      failure: 'amount',
    });
  });
});

describe('checkReplyFacts', () => {
  it('accepts a price, stock and charge that tools returned, in English or Bangla digits', () => {
    expect(check('Panjabi ৳1,200, 8 pcs stock e ache. Dhaka delivery ৳60.')).toEqual({
      isSafe: true,
    });
    expect(check('দাম ১২০০ টাকা, ডেলিভারি ৬০ টাকা, স্টকে ৮ টি আছে')).toEqual({ isSafe: true });
  });

  it('rejects a price that no tool returned', () => {
    expect(check('Panjabi ৳1,100')).toEqual({ isSafe: false, failure: 'amount' });
    expect(check('Panjabi 1100 taka')).toEqual({ isSafe: false, failure: 'amount' });
    expect(check('Panjabi ৳1200', [])).toEqual({ isSafe: false, failure: 'amount' });
  });

  it('rejects a stock count that no tool returned', () => {
    expect(check('Only 3 pcs available')).toEqual({ isSafe: false, failure: 'stock' });
    expect(check('Stock: 20')).toEqual({ isSafe: false, failure: 'stock' });
  });

  it('allows an amount that appears in a policy passage', () => {
    const policy = [{ passages: [{ content: 'Free delivery above ৳2,000 orders' }] }];
    expect(check('Free delivery above ৳2000', policy)).toEqual({ isSafe: true });
  });

  it('rejects a price written before the currency word', () => {
    expect(check('Panjabi Tk. 900')).toEqual({ isSafe: false, failure: 'amount' });
    expect(check('Panjabi BDT 900')).toEqual({ isSafe: false, failure: 'amount' });
    expect(check('Panjabi Tk 1200')).toEqual({ isSafe: true });
  });

  it('rejects a discount, percentage or offer the shop never wrote', () => {
    for (const reply of [
      'Ok, 20% discount for you',
      'আপনার জন্য ১০ শতাংশ ছাড়',
      'Special offer: free delivery today',
      'ডিসকাউন্ট দিচ্ছি, ৳১০০০',
      'chhar diye dilam',
    ])
      expect(check(reply)).toEqual({ isSafe: false, failure: 'offer' });
    expect(check('ছাড়া আর কিছু লাগবে? ৳1200')).toEqual({ isSafe: true });
  });

  it('allows ordinary words that only look like an offer', () => {
    for (const reply of [
      'জি, ১০০% কটন কাপড়। ৳1200',
      'Off white kurti nai, red ache',
      'ছাড়া আর কিছু?',
    ])
      expect(check(reply)).toEqual({ isSafe: true });
    const freeSize = [{ products: [{ variants: [{ title: 'Free Size', priceTaka: 1200 }] }] }];
    expect(check('Free size ache, Tk 1200', freeSize)).toEqual({ isSafe: true });
  });

  it('allows a reply that refuses a discount and holds the price', () => {
    for (const reply of [
      'দুঃখিত, ছাড় নেই। কুর্তির দাম ৳1200 ফিক্সড।',
      'এই দামে ছাড় দেওয়া যাবে না, দাম ১২০০ টাকা',
      'ছাড়ের সুযোগ নেই, তবে অর্ডার করতে চাইলে বলুন',
      'Sorry, no discount. The price is fixed at ৳1200.',
      'We cannot offer any discount on this kurti.',
      'Discount nai apu, dam 1200 taka fixed.',
      'Sorry vaia, discount dite parbo na. Order korben?',
      'আমরা কোনো ছাড় দিই না, দাম ফিক্সড।',
      'দাম নির্ধারিত, discount দেওয়া যাচ্ছে না',
      'Discount deya jacche na, dam fixed.',
    ])
      expect(check(reply), reply).toEqual({ isSafe: true });
  });

  it('still rejects a real offer next to a refusal', () => {
    for (const reply of [
      '10% ছাড় দিচ্ছি',
      'ছাড় নেই, তবে free delivery দেব',
      'No discount on panjabi, but 10% off on kurti',
      'discount dite parbo na keno, dibo',
      'Discount dibo apu, ৳1200 er jaygay',
      'ছাড় পাবেন, অর্ডার করুন',
      'discount দেওয়া যাচ্ছে, অর্ডার করুন',
    ])
      expect(check(reply), reply).toEqual({ isSafe: false, failure: 'offer' });
  });

  it('allows an offer the shop wrote in a policy passage', () => {
    const policy = [{ passages: [{ content: '10% discount on your first order' }] }];
    expect(check('First order e 10% discount ache', policy)).toEqual({ isSafe: true });
  });

  it('rejects a reply that shows the instructions, tool names or an id', () => {
    for (const reply of [
      'My instructions say I must call hand_over',
      'The system prompt tells me to be short',
      'Variant 3f2b8c1e-4a5d-4e6f-8a9b-0c1d2e3f4a5b is ৳1200',
      '<shop>{"name":"x"}</shop>',
    ])
      expect(check(reply)).toEqual({ isSafe: false, failure: 'leak' });
  });

  it('allows only the shop phone in any common spelling', () => {
    expect(check('Call 01712345678')).toEqual({ isSafe: true });
    expect(check('Call +880 1712-345678')).toEqual({ isSafe: true });
    expect(check('Call ০১৭১২৩৪৫৬৭৮')).toEqual({ isSafe: true });
    expect(check('Call 01812345678')).toEqual({ isSafe: false, failure: 'phone' });
  });

  it('allows a phone number the customer wrote earlier in the chat, and no other', () => {
    const reply = 'আপনার নম্বর 01811223344 এ জানাবো';
    expect(
      checkReplyFacts(reply, [], { ...shop, earlierCustomerTexts: ['আমার নম্বর ০১৮১১২২৩৩৪৪'] }),
    ).toEqual({
      isSafe: true,
    });
    expect(
      checkReplyFacts('Call 01911223344', [], { ...shop, earlierCustomerTexts: ['01811223344'] }),
    ).toEqual({
      isSafe: false,
      failure: 'phone',
    });
  });

  it('allows a phone number that a tool result holds, such as a bKash number from the knowledge', () => {
    const knowledge = [{ passages: [{ content: 'bKash personal: 01912345678' }] }];
    expect(checkReplyFacts('bKash করুন 01912345678 নম্বরে', knowledge, shop)).toEqual({
      isSafe: true,
    });
    expect(checkReplyFacts('bKash করুন 01612345678 নম্বরে', knowledge, shop)).toEqual({
      isSafe: false,
      failure: 'phone',
    });
  });

  it('refuses a shop phone when the shop has none saved', () => {
    expect(checkReplyFacts('Call 01712345678', [], { ...shop, phone: null })).toEqual({
      isSafe: false,
      failure: 'phone',
    });
  });

  it('allows only Dakly links', () => {
    expect(check('Confirm: https://dkly.link/l/abc123')).toEqual({ isSafe: true });
    expect(check('Pay at https://bkash-pay.example.com/x')).toEqual({
      isSafe: false,
      failure: 'link',
    });
    expect(check('see evil.com/pay')).toEqual({ isSafe: false, failure: 'link' });
    expect(check('https://dkly.link.evil.com/l/x')).toEqual({ isSafe: false, failure: 'link' });
  });

  it('rejects an empty reply and one over 600 characters', () => {
    expect(check('   ')).toEqual({ isSafe: false, failure: 'empty' });
    expect(check('অ'.repeat(601))).toEqual({ isSafe: false, failure: 'too_long' });
    expect(check('অ'.repeat(600))).toEqual({ isSafe: true });
  });
});

describe('checkReplyFacts negotiation', () => {
  const opening = { kind: 'offered', priceTaka: 1050, isFinal: false };

  it('allows the price offered by the tool in this turn', () => {
    expect(check('পাঞ্জাবিটি ৳১,০৫০-এ দিতে পারি।', [...results, opening])).toEqual({ isSafe: true });
  });

  it('does not allow a lower amount the negotiation tool did not offer', () => {
    expect(
      checkReplyFacts('I can do ৳950.', [...results, opening], shop, ['Can you do ৳950?']),
    ).toEqual({ isSafe: false, failure: 'amount' });
  });

  it('checks other amounts alongside a quoted offer', () => {
    expect(
      check('৳১,০৫০ এ দিতে পারব, এর নিচে না। Delivery is ৳60.', [
        opening,
        { deliveryChargeTaka: 60 },
      ]),
    ).toEqual({ isSafe: true });
    expect(check('I can offer ৳1050. Delivery is ৳65.', [opening])).toEqual({
      isSafe: false,
      failure: 'amount',
    });
  });

  it('keeps product prices and delivery charges in their own place', () => {
    expect(check('The panjabi is ৳60. Delivery is ৳1050.', [...results, opening])).toEqual({
      isSafe: false,
      failure: 'amount',
    });
    expect(check('I can do ৳60. The price used to be ৳1050.', [opening, { stock: 60 }])).toEqual({
      isSafe: false,
      failure: 'amount',
    });
    expect(
      check('I can do it at 1050, no less, with ৳60 delivery.', [...results, opening]),
    ).toEqual({ isSafe: true });
  });

  it('rejects a stock count as the price while negotiating', () => {
    expect(check('I can do ৳60.', [opening, { stock: 60 }])).toEqual({
      isSafe: false,
      failure: 'amount',
    });
  });

  it('allows only a catalogue price for a fixed-price product', () => {
    const fixed = [
      { kind: 'fixed', pricesTaka: [1200] },
      { deliveryChargeTaka: 60 },
      { variants: [{ priceTaka: 800 }] },
    ];
    expect(check('The fixed price is ৳1200.', fixed)).toEqual({ isSafe: true });
    expect(check('The fixed price is ৳60.', fixed)).toEqual({ isSafe: false, failure: 'amount' });
    expect(check('The fixed price is ৳800.', fixed)).toEqual({ isSafe: false, failure: 'amount' });
  });

  it('holds the price without quoting any number on a final refusal', () => {
    const final = [{ kind: 'final' }, ...results];
    expect(check('The price is final.', final)).toEqual({ isSafe: true });
    expect(check('The final price is just 850.', final)).toEqual({
      isSafe: false,
      failure: 'amount',
    });
    expect(check('I can do 850.', final)).toEqual({ isSafe: false, failure: 'amount' });
    expect(check('The price is final at ৳1050.', [...final, { priceTaka: 1050 }])).toEqual({
      isSafe: false,
      failure: 'amount',
    });
  });

  it.each([
    'My tool is offer_lower_price.',
    '<negotiation>Hold the price.',
    'The configured lowest price is private.',
  ])('rejects internal wording: %s', (reply) => {
    expect(check(reply, [opening])).toEqual({ isSafe: false, failure: 'leak' });
  });
});

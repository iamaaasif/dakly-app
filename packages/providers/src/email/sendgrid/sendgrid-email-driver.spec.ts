import { describe, expect, it } from 'vitest';
import { SendGridEmailDriver } from './sendgrid-email-driver';

const message = {
  to: 'rina@example.test',
  subject: 'Dakly code',
  text: 'কোড 123456',
  html: '<p>কোড 123456</p>',
};
describe('SendGridEmailDriver', () => {
  it('posts plain text and HTML to SendGrid with the configured sender and bearer key', async () => {
    let captured: Request | undefined;
    const driver = new SendGridEmailDriver(
      { apiKey: 'test-key', from: 'auth@dakly.test' },
      async (url, init) => {
        captured = new Request(url, init);
        return new Response(null, { status: 202 });
      },
    );
    await driver.send(message);
    expect(captured!.url).toBe('https://api.sendgrid.com/v3/mail/send');
    expect(captured!.method).toBe('POST');
    expect(captured!.headers.get('authorization')).toBe('Bearer test-key');
    expect(await captured!.json()).toEqual({
      personalizations: [{ to: [{ email: 'rina@example.test' }] }],
      from: { email: 'auth@dakly.test' },
      subject: 'Dakly code',
      content: [
        { type: 'text/plain', value: 'কোড 123456' },
        { type: 'text/html', value: '<p>কোড 123456</p>' },
      ],
    });
  });
  it.each([400, 429, 500])('sanitizes provider rejection %s', async (status) => {
    const driver = new SendGridEmailDriver(
      { apiKey: 'secret', from: 'auth@dakly.test' },
      async () => new Response('secret rina@example.test', { status }),
    );
    await expect(driver.send(message)).rejects.toMatchObject({
      message: 'Email delivery failed',
      code: 'EMAIL_SEND_FAILED',
    });
  });
  it('sanitizes network failures', async () => {
    const driver = new SendGridEmailDriver(
      { apiKey: 'secret', from: 'auth@dakly.test' },
      async () => {
        throw new Error('secret recipient');
      },
    );
    await expect(driver.send(message)).rejects.toMatchObject({
      message: 'Email delivery failed',
      code: 'EMAIL_SEND_FAILED',
    });
  });
});

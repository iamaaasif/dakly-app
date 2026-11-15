import type {
  StaffAlertDriver,
  StaffAlertMessage,
  StaffAlertCredentials,
} from '../staff-alert-driver';
export class SlackAlertDriver implements StaffAlertDriver {
  constructor(private readonly request: typeof fetch = fetch) {}
  async send(message: StaffAlertMessage, credentials: StaffAlertCredentials): Promise<void> {
    try {
      const response = await this.request('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
        headers: {
          Authorization: `Bearer ${credentials.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: credentials.channel,
          text: message.text,
          client_msg_id: message.id,
          mrkdwn: false,
          unfurl_links: false,
          unfurl_media: false,
        }),
      });
      if (!response.ok) throw new Error('Slack rejected alert');
      const result: unknown = await response.json();
      if (!result || typeof result !== 'object' || !('ok' in result) || result.ok !== true)
        throw new Error('Slack rejected alert');
    } catch {
      // Never retain vendor responses or credentials in persisted job errors.
      throw Object.assign(new Error('Staff alert delivery failed'), {
        code: 'STAFF_ALERT_SEND_FAILED',
      });
    }
  }
}

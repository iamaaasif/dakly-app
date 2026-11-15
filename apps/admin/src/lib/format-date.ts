export function formatDate(value: string): string {
  const formatted = new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'Asia/Dhaka',
  }).format(new Date(value));
  return `${formatted} (Asia/Dhaka)`;
}

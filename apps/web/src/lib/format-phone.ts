export function formatPhone(value: string): string {
  if (!/^01[0-9X]{9}$/.test(value)) return value;
  return `${value.slice(0, 5)}-${value.slice(5)}`;
}

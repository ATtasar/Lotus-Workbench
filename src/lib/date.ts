export function dateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function parseDate(key: string): Date {
  return new Date(`${key}T12:00:00`);
}
export function addDays(key: string, amount: number): string {
  const d = parseDate(key);
  d.setDate(d.getDate() + amount);
  return dateKey(d);
}
export function shiftMonth(key: string, amount: number): string {
  const d = parseDate(key);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + amount);
  const max = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, max));
  return dateKey(d);
}
export function weekDays(key: string, start: 'monday' | 'sunday' = 'monday'): string[] {
  const day = parseDate(key).getDay();
  const offset = start === 'monday' ? (day + 6) % 7 : day;
  return Array.from({ length: 7 }, (_, i) => addDays(key, i - offset));
}
export function monthDays(key: string, start: 'monday' | 'sunday'): string[] {
  const d = parseDate(key);
  d.setDate(1);
  const first = weekDays(dateKey(d), start)[0];
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}
export const shortDate = (key: string) =>
  key ? `${parseDate(key).getMonth() + 1}月${parseDate(key).getDate()}日` : '未设置日期';
export const weekday = (key: string) =>
  ['日', '一', '二', '三', '四', '五', '六'][parseDate(key).getDay()];
export const money = (value: number | null) =>
  value === null
    ? '未填写'
    : new Intl.NumberFormat('zh-CN', {
        style: 'currency',
        currency: 'CNY',
        maximumFractionDigits: 2,
      }).format(value);
export function validDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (value === '' ||
      (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
        !isNaN(parseDate(value).getTime()) &&
        dateKey(parseDate(value)) === value))
  );
}
export function defaultReminder(date: string, time: string, minutes: number): string {
  if (!date) return '';
  const d = new Date(`${date}T${time || '09:00'}:00`);
  d.setMinutes(d.getMinutes() - minutes);
  return `${dateKey(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

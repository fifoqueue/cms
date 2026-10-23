/** Weekday numbers (0 Sunday … 6 Saturday) in display order, starting at `weekStartsOn`. */
export const weekdayOrder = (weekStartsOn: number) =>
  Array.from({ length: 7 }, (_, column) => (weekStartsOn + column) % 7);

/**
 * The days of a month (UTC) as weeks of seven cells, `null` before the first and after the
 * last day; the first column is `weekStartsOn` (Settings → General).
 */
export const monthGrid = (
  year: number,
  month: number,
  weekStartsOn: number,
) => {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const length = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells = [
    ...Array.from<null>({ length: (first - weekStartsOn + 7) % 7 }).fill(null),
    ...Array.from({ length }, (_, index) => index + 1),
  ];
  return Array.from({ length: Math.ceil(cells.length / 7) }, (_, row) =>
    Array.from({ length: 7 }, (_, column) => cells[row * 7 + column] ?? null),
  );
};

export interface MonthCount {
  year: number;
  month: number;
  count: number;
}

/** Published entries per calendar month, keyed `year-month`. */
export type MonthCounts = Map<string, MonthCount>;

export const countMonth = (
  counts: MonthCounts,
  year: number,
  month: number,
) => {
  const key = `${year}-${month}`;
  const item = counts.get(key) ?? { year, month, count: 0 };
  item.count += 1;
  counts.set(key, item);
};

/** Newest months first, at most `limit`. */
export const newestMonths = (counts: MonthCounts, limit: number) =>
  [...counts.values()]
    .sort((a, b) => b.year - a.year || b.month - a.month)
    .slice(0, limit);

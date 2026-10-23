export const calendar = (timeZone = 'UTC') => {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  return (date: Date) =>
    Object.fromEntries(
      format
        .formatToParts(date)
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, Number(part.value)]),
    ) as Record<
      'year' | 'month' | 'day' | 'hour' | 'minute' | 'second',
      number
    >;
};

/** First instant of a local calendar date; handles midnight changes and skipped dates. */
export const calendarBounds = (
  year: number,
  month = 0,
  day = 0,
  timeZone = 'UTC',
) => {
  const parts = calendar(timeZone);
  const start = (date: Date) => {
    const target =
      date.getUTCFullYear() * 10000 +
      (date.getUTCMonth() + 1) * 100 +
      date.getUTCDate();
    let lo = date.getTime() - 2 * 86400000;
    let hi = date.getTime() + 2 * 86400000;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      const value = parts(new Date(mid));
      if (value.year * 10000 + value.month * 100 + value.day < target) lo = mid;
      else hi = mid;
    }
    return new Date(hi);
  };
  return {
    gte: start(new Date(Date.UTC(year, month ? month - 1 : 0, day || 1))),
    lt: start(
      new Date(
        Date.UTC(
          month ? year : year + 1,
          day ? month - 1 : month,
          day ? day + 1 : 1,
        ),
      ),
    ),
  };
};

import { getContext, setContext } from 'svelte';
import type { DateFormat } from '@cms/sdk';

/** How the site shows dates (Settings → Reading). */
export interface DateStyle {
  locale: string;
  dateFormat: DateFormat;
  timeZone: string;
}

const OPTIONS: Record<
  Exclude<DateFormat, 'iso'>,
  Intl.DateTimeFormatOptions
> = {
  long: { year: 'numeric', month: 'long', day: 'numeric' },
  medium: { year: 'numeric', month: 'short', day: 'numeric' },
  short: { dateStyle: 'short' },
};

export const formatDate = (
  iso: string,
  { locale, dateFormat, timeZone }: DateStyle,
) => {
  const date = new Date(iso);
  if (dateFormat === 'iso')
    // `en-CA` writes YYYY-MM-DD in the site's time zone.
    return date.toLocaleDateString('en-CA', { timeZone });
  try {
    return date.toLocaleDateString(locale, {
      ...OPTIONS[dateFormat],
      timeZone,
    });
  } catch {
    return date.toLocaleDateString('en', OPTIONS[dateFormat]);
  }
};

/** A month of a date archive, such as "March 2026", in UTC like the archive itself. */
export const formatMonth = (year: number, month: number, locale: string) => {
  const date = new Date(Date.UTC(year, month - 1, 1));
  try {
    return date.toLocaleDateString(locale, {
      year: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    });
  } catch {
    return `${year}-${String(month).padStart(2, '0')}`;
  }
};

const KEY = Symbol('date-style');

/** Called by the site layout; read lazily so settings follow navigation. */
export const provideDateStyle = (style: () => DateStyle) =>
  setContext(KEY, style);

/** Formats dates in the site's style; English long dates in UTC outside the site layout. */
export const useDateFormat = () => {
  const style = getContext<(() => DateStyle) | undefined>(KEY);
  return (iso: string) =>
    formatDate(
      iso,
      style?.() ?? { locale: 'en', dateFormat: 'long', timeZone: 'UTC' },
    );
};

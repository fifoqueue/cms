/** `datetime-local` value in the browser's zone for an ISO time. */
export const localTime = (iso: string | null | undefined) => {
  if (!iso) return '';
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
};

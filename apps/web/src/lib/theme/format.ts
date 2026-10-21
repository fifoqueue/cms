export const formatDate = (iso: string, locale: string) => {
  try {
    return new Date(iso).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return new Date(iso).toLocaleDateString('en', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }
};

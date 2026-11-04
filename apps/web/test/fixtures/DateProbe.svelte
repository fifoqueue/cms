<script lang="ts">
  import { useI18n } from '#lib/i18n/context.js';
  import {
    formatMonth,
    useDateFormat,
    useDateLocale,
  } from '#lib/theme/format.js';

  /** Shows what the site layout provides to the page: a date, a month and the catalog language. */
  const formatDate = useDateFormat();
  const dateLocale = useDateLocale();
  const i18n = useI18n();
</script>

<p data-probe="date">{formatDate('2026-03-01T12:00:00.000Z')}</p>
<p data-probe="month">{formatMonth(2026, 3, dateLocale())}</p>
<p data-probe="language">{i18n.language}</p>

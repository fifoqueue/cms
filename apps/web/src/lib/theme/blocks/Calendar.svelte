<script lang="ts">
  import { resolve } from '$app/paths';
  import { formatMonth } from '#lib/theme/format.js';
  import { useScope } from '#lib/theme/scope.js';

  /**
   * A month by day (UTC, like the date archives); days with posts link to the month archive
   * (there are no day archives), and the nearest months with posts are linked below.
   */
  const scope = useScope();
  const calendar = $derived(scope().calendar);
  const locale = $derived(scope().site.locale);

  /** Sunday-first weekday names in the site language. */
  const weekdays = $derived(
    Array.from({ length: 7 }, (_, day) => {
      const date = new Date(Date.UTC(2023, 0, 1 + day));
      try {
        return {
          short: date.toLocaleDateString(locale, {
            weekday: 'narrow',
            timeZone: 'UTC',
          }),
          long: date.toLocaleDateString(locale, {
            weekday: 'long',
            timeZone: 'UTC',
          }),
        };
      } catch {
        return { short: String(day), long: String(day) };
      }
    }),
  );
  const monthParams = ({ year, month }: { year: number; month: number }) => ({
    year: String(year),
    month: String(month).padStart(2, '0'),
  });
  const weeks = $derived.by(() => {
    if (!calendar) return [];
    const first = new Date(
      Date.UTC(calendar.year, calendar.month - 1, 1),
    ).getUTCDay();
    const length = new Date(
      Date.UTC(calendar.year, calendar.month, 0),
    ).getUTCDate();
    const cells = [
      ...Array.from({ length: first }, () => null),
      ...Array.from({ length }, (_, index) => index + 1),
    ];
    return Array.from({ length: Math.ceil(cells.length / 7) }, (_, row) =>
      Array.from({ length: 7 }, (_, column) => cells[row * 7 + column] ?? null),
    );
  });
</script>

{#if calendar}
  <table class="cms-block-calendar w-full table-fixed text-center text-sm">
    <caption class="pb-2 font-medium"
      >{formatMonth(calendar.year, calendar.month, locale)}</caption
    >
    <thead>
      <tr>
        {#each weekdays as day (day.long)}
          <th scope="col" class="py-1 font-normal text-muted-foreground"
            ><abbr title={day.long} class="no-underline">{day.short}</abbr></th
          >
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each weeks as week, row (row)}
        <tr>
          {#each week as day, column (column)}
            <td class="py-1">
              {#if day && calendar.days[day]}
                <a
                  href={resolve(
                    '/(site)/date/[year]/[[month]]',
                    monthParams(calendar),
                  )}
                  class="font-semibold text-primary hover:underline">{day}</a
                >
              {:else if day}{day}{/if}
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
    {#if calendar.previous || calendar.next}
      <tfoot>
        <tr>
          <td colspan="3" class="pt-2 text-left">
            {#if calendar.previous}
              <a
                href={resolve(
                  '/(site)/date/[year]/[[month]]',
                  monthParams(calendar.previous),
                )}
                class="hover:underline"
                >« {formatMonth(
                  calendar.previous.year,
                  calendar.previous.month,
                  locale,
                )}</a
              >
            {/if}
          </td>
          <td></td>
          <td colspan="3" class="pt-2 text-right">
            {#if calendar.next}
              <a
                href={resolve(
                  '/(site)/date/[year]/[[month]]',
                  monthParams(calendar.next),
                )}
                class="hover:underline"
                >{formatMonth(calendar.next.year, calendar.next.month, locale)} »</a
              >
            {/if}
          </td>
        </tr>
      </tfoot>
    {/if}
  </table>
{/if}

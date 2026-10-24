<script lang="ts">
  import { applyAction, deserialize } from '$app/forms';
  import { afterNavigate, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { errorMessage } from '#lib/admin/form-errors.js';
  import {
    announceResult,
    forgetParams,
    notifyFailure,
    notifySuccess,
  } from '#lib/feedback.js';
  import { useI18n } from '#lib/i18n/index.js';

  // A notice that survives a redirect travels as `?notice=<catalog key>`; `undo` names the
  // trashed entry to restore. Unknown keys show nothing, so the address cannot inject text.
  // The toast shows once: the parameters leave the address, so a reload does not repeat it.
  const i18n = useI18n();

  /** Restores the trashed entry in place; the result shows like any other action's. */
  const restore = async (id: string) => {
    const response = await fetch(
      `/admin/content/${encodeURIComponent(id)}?/restore`,
      {
        method: 'POST',
        body: new FormData(),
        headers: { 'x-sveltekit-action': 'true' },
      },
    ).catch(() => null);
    const result = response && deserialize(await response.text());
    if (!result || result.type === 'error') {
      notifyFailure(i18n.m.errorGeneric);
      return;
    }
    // Announced here: the admin may have left the screen that would show the result.
    if (result.type === 'failure') {
      notifyFailure(errorMessage(i18n.m, i18n.language, result.data ?? {}));
      return;
    }
    if (result.type === 'success') {
      announceResult(i18n, result.data);
      await invalidateAll();
    }
    await applyAction(result);
  };

  afterNavigate(({ shallow }) => {
    // `forgetParams` below navigates shallowly; the notice is already shown.
    if (shallow) return;
    const params = page.url.searchParams;
    const key = params.get('notice');
    if (!key) return;
    const text = (i18n.m as Record<string, unknown>)[key];
    const undo = params.get('undo');
    if (typeof text === 'string')
      notifySuccess(text, {
        action: undo
          ? { label: i18n.m.undo, onClick: () => void restore(undo) }
          : undefined,
      });
    forgetParams('notice', 'undo');
  });
</script>

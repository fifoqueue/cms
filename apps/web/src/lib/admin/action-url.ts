/**
 * A form action on the current page that keeps its query (the editor's `theme` and `edit`), so the
 * same panel renders after the action, with or without JavaScript. Other actions and one-time
 * notices are dropped.
 */
export const actionUrl = (search: string, action: string) => {
  const params = new URLSearchParams(search);
  for (const key of [...params.keys()])
    if (key.startsWith('/') || key === 'notice') params.delete(key);
  const query = params.toString();
  return `?${query ? `${query}&` : ''}/${action}`;
};

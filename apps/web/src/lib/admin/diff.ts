export interface DiffLine {
  kind: 'same' | 'removed' | 'added';
  text: string;
}

/**
 * Line diff by longest common subsequence: what `before` loses and `after` gains.
 * Quadratic, so it is meant for one entry's text, not whole sites.
 */
export const lineDiff = (before: string[], after: string[]): DiffLine[] => {
  const rows = before.length;
  const columns = after.length;
  const lengths: number[][] = Array.from({ length: rows + 1 }, () =>
    Array<number>(columns + 1).fill(0),
  );
  for (let i = rows - 1; i >= 0; i--)
    for (let j = columns - 1; j >= 0; j--)
      lengths[i]![j] =
        before[i] === after[j]
          ? lengths[i + 1]![j + 1]! + 1
          : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < rows && j < columns)
    if (before[i] === after[j]) {
      lines.push({ kind: 'same', text: before[i]! });
      i++;
      j++;
    } else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!)
      lines.push({ kind: 'removed', text: before[i++]! });
    else lines.push({ kind: 'added', text: after[j++]! });
  while (i < rows) lines.push({ kind: 'removed', text: before[i++]! });
  while (j < columns) lines.push({ kind: 'added', text: after[j++]! });
  return lines;
};

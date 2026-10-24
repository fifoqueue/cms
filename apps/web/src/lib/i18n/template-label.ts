/**
 * A template's label from the labels of the base templates: `single-post` is labelled
 * `<single>: post`; names without a known base stay as they are.
 */
export const templateLabels =
  (labels: Readonly<Record<string, string>>) => (name: string) => {
    const base = Object.keys(labels).find(
      (key) => name === key || name.startsWith(`${key}-`),
    );
    return !base
      ? name
      : name === base
        ? labels[base]!
        : `${labels[base]}: ${name.slice(base.length + 1)}`;
  };

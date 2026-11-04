export const safeMediaKey = (key: string) =>
  key.length <= 255 &&
  key
    .split('/')
    .every(
      (part) =>
        /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(part) && !part.includes('..'),
    );

export const storageKeyOf = (
  value: {
    key: string;
    directory: string;
    basename: string;
    extension: string;
  },
  initialKey: string,
  extension: string,
) => {
  const key =
    value.key === initialKey
      ? `${value.directory ? `${value.directory}/` : ''}${value.basename}.${extension}`
      : value.key.replace(/\.[^/.]*$/, '') + `.${extension}`;

  return key;
};

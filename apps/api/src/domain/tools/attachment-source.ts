/** Only known cache-version parameters are discarded; signed/semantic queries remain distinct. */
const CACHE_PARAMS = new Set(['ver', 'v', 'version', 'cachebust', 'cb', '_']);

export const attachmentSource = (source: string, original = false) => {
  const url = new URL(source);
  const slash = url.pathname.lastIndexOf('/');
  let filename = decodeURIComponent(url.pathname.slice(slash + 1)).normalize(
    'NFC',
  );
  const size = /-(\d+)x(\d+)(?=\.[^.]+$)/.exec(filename);
  if (original && size) filename = filename.replace(size[0], '');
  filename = filename.replace(/-scaled(?=\.[^.]+$)/, '');
  url.pathname =
    url.pathname.slice(0, slash + 1) + encodeURIComponent(filename);
  for (const key of [...url.searchParams.keys()])
    if (CACHE_PARAMS.has(key.toLowerCase())) url.searchParams.delete(key);
  url.hash = '';
  return {
    key: url.href,
    width: size ? Number(size[1]) : null,
    height: size ? Number(size[2]) : null,
  };
};

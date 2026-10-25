import type { MediaType } from '@cms/sdk';

const ascii = (bytes: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...bytes.subarray(start, end));

/** Each prelude character is visited at most once, within the bounded prefix. */
const svgPrefix = (text: string) => {
  let offset = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const whitespace = (char: string | undefined) =>
    char !== undefined && ' \t\r\n'.includes(char);
  const skipSpace = () => {
    while (whitespace(text[offset])) offset++;
  };
  skipSpace();
  if (text.startsWith('<?xml', offset) && whitespace(text[offset + 5])) {
    const end = text.indexOf('?>', offset + 6);
    if (end < 0) return false;
    offset = end + 2;
    skipSpace();
  }
  while (text.startsWith('<!--', offset)) {
    const end = text.indexOf('-->', offset + 4);
    if (end < 0) return false;
    offset = end + 3;
    skipSpace();
  }
  return (
    text.startsWith('<svg', offset) &&
    (whitespace(text[offset + 4]) ||
      text[offset + 4] === '>' ||
      text.startsWith('/>', offset + 4))
  );
};

/**
 * The real type of an upload from its first bytes; null for anything not accepted. The declared
 * type and file name are never trusted.
 */
export const sniffMediaType = (bytes: Uint8Array): MediaType | null => {
  // UTF-16/32 BOMs must not be confused with MPEG sync bytes.
  if (
    (bytes[0] === 0xff && bytes[1] === 0xfe) ||
    (bytes[0] === 0xfe && bytes[1] === 0xff) ||
    (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 0xfe && bytes[3] === 0xff)
  )
    return null;
  // Identification only: the upload service must sanitize before storage.
  const prefix = new TextDecoder().decode(bytes.subarray(0, 4096));
  if (svgPrefix(prefix)) return 'image/svg+xml';
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'image/jpeg';
  if (ascii(bytes, 0, 8) === '\x89PNG\r\n\x1a\n') return 'image/png';
  if (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a')
    return 'image/gif';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP')
    return 'image/webp';
  if (
    ascii(bytes, 0, 3) === 'ID3' ||
    (bytes[0] === 0xff &&
      (bytes[1]! & 0xe0) === 0xe0 &&
      (bytes[1]! & 0x18) !== 0x08 &&
      (bytes[1]! & 6) !== 0 &&
      (bytes[2]! & 0xf0) !== 0xf0 &&
      (bytes[2]! & 0x0c) !== 0x0c)
  )
    return 'audio/mpeg';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WAVE')
    return 'audio/wav';
  if (ascii(bytes, 0, 4) === 'OggS') return 'audio/ogg';
  if (ascii(bytes, 0, 5) === '%PDF-') return 'application/pdf';
  // Font signatures: WOFF 2, WOFF, OpenType with CFF outlines, TrueType (version 1.0 or 'true').
  if (ascii(bytes, 0, 4) === 'wOF2') return 'font/woff2';
  if (ascii(bytes, 0, 4) === 'wOFF') return 'font/woff';
  if (ascii(bytes, 0, 4) === 'OTTO') return 'font/otf';
  if (
    (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0) ||
    ascii(bytes, 0, 4) === 'true'
  )
    return 'font/ttf';
  if (
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  )
    return 'video/webm';
  if (ascii(bytes, 4, 8) === 'ftyp') {
    const brand = ascii(bytes, 8, 12);
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
    // ISO media brands used by MP4 video (isom, mp41, mp42, avc1, M4V, dash …).
    if (/^(isom|iso\d|mp4\d|avc1|M4V |dash|mmp4)$/.test(brand))
      return 'video/mp4';
  }
  return null;
};

import type { MediaType } from '@cms/sdk';

const ascii = (bytes: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...bytes.subarray(start, end));

/**
 * The real type of an upload from its first bytes; null for anything not accepted. The declared
 * type and file name are never trusted.
 */
export const sniffMediaType = (bytes: Uint8Array): MediaType | null => {
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
    (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0 && (bytes[1]! & 6) !== 0)
  )
    return 'audio/mpeg';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WAVE')
    return 'audio/wav';
  if (ascii(bytes, 0, 4) === 'OggS') return 'audio/ogg';
  if (ascii(bytes, 0, 5) === '%PDF-') return 'application/pdf';
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

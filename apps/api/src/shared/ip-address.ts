import { isIP } from 'node:net';

const ipv4 = (address: string): bigint | null => {
  const parts = address.split('.');
  if (parts.length !== 4) return null;
  let value = 0n;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = (value << 8n) | BigInt(octet);
  }
  return value;
};

const ipv6 = (input: string): bigint | null => {
  let address = input.split('%')[0]!.toLowerCase();
  const dotted = /(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(address)?.[1];
  if (dotted) {
    const value = ipv4(dotted);
    if (value === null) return null;
    address = `${address.slice(0, -dotted.length)}${(
      (value >> 16n) &
      0xffffn
    ).toString(16)}:${(value & 0xffffn).toString(16)}`;
  }
  if (!/^[0-9a-f:]+$/.test(address) || address.split('::').length > 2)
    return null;
  const [left = '', right = ''] = address.split('::');
  const before = left ? left.split(':') : [];
  const after = right ? right.split(':') : [];
  const missing = 8 - before.length - after.length;
  if (
    (address.includes('::') && missing < 1) ||
    (!address.includes('::') && missing !== 0)
  )
    return null;
  const groups = [
    ...before,
    ...Array.from({ length: missing }, () => '0'),
    ...after,
  ];
  if (
    groups.length !== 8 ||
    groups.some((part) => !/^[0-9a-f]{1,4}$/.test(part))
  )
    return null;
  return groups.reduce(
    (value, part) => (value << 16n) | BigInt(`0x${part}`),
    0n,
  );
};

export interface ParsedAddress {
  family: 4 | 6;
  value: bigint;
}

export const parseAddress = (address: string): ParsedAddress | null => {
  const plain = address.split('%')[0]!;
  const family = isIP(plain);
  if (family === 4) {
    const value = ipv4(plain);
    return value === null ? null : { family, value };
  }
  if (family === 6) {
    const value = ipv6(plain);
    return value === null ? null : { family, value };
  }
  return null;
};

export const parseRange = (range: string) => {
  const [address, prefixText, extra] = range.split('/');
  if (!address || extra !== undefined) return null;
  const parsed = parseAddress(address);
  if (!parsed) return null;
  const bits = parsed.family === 4 ? 32 : 128;
  const prefix = prefixText === undefined ? bits : Number(prefixText);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > bits) return null;
  return { ...parsed, prefix };
};

export const inRange = (address: ParsedAddress, range: string) => {
  const network = parseRange(range);
  if (!network || network.family !== address.family) return false;
  const bits = address.family === 4 ? 32 : 128;
  const shift = BigInt(bits - network.prefix);
  return address.value >> shift === network.value >> shift;
};

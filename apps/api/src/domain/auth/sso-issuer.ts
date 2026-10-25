/** Compare configured URL spelling without changing the verified issuer bytes stored in identities. */
export const sameIssuer = (left: string, right: string): boolean => {
  try {
    return new URL(left).href === new URL(right).href;
  } catch {
    return false;
  }
};

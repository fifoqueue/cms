/** Request provenance supplied by a trusted adapter, never by content input. */
export interface ContentOrigin {
  ip: string | null;
  userAgent: string | null;
}

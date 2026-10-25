export interface SetupToken {
  userId: string;
  expiresAt: Date;
}

/** Invitation/reset proof. A successful consume is the sole winner across processes. */
export interface SetupTokens {
  find(tokenHash: string, now: Date): Promise<SetupToken | null>;
  consume(tokenHash: string, userId: string, now: Date): Promise<boolean>;
}

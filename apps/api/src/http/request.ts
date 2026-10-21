import type { UserProfile } from '@cms/sdk';
import { invalidInput, unauthorized } from '../shared/errors';

export interface Authenticator {
  authenticate(token: string): Promise<UserProfile | null>;
}

export const readJson = async (request: Request): Promise<unknown> => {
  try {
    return await request.json();
  } catch {
    throw invalidInput('Request body must be JSON');
  }
};

export const bearerToken = (request: Request) => {
  const header = request.headers.get('authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() || null : null;
};

export const currentUser = async (auth: Authenticator, request: Request) => {
  const token = bearerToken(request);
  return token ? auth.authenticate(token) : null;
};

export const requireUser = async (auth: Authenticator, request: Request) => {
  const user = await currentUser(auth, request);
  if (!user) throw unauthorized();
  return user;
};

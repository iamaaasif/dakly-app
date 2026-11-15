import { hash, verify, argon2id } from 'argon2';
export const hashPassword = (password: string): Promise<string> =>
  hash(password, { type: argon2id });
export const verifyPassword = (hash: string, password: string): Promise<boolean> =>
  verify(hash, password);

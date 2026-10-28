import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

// Existing D1 records use 210,000 rounds, UTF-8 salt TEXT (not hex-decoded),
// and a 32-byte key. Changing these parameters would lock existing users out.
// Workers caps native PBKDF2 at 100,000, including node:crypto. Use the
// portable implementation, with async yielding, without rewriting credentials.
export async function hashPassword(password: string, salt: string): Promise<string> {
  const encode = new TextEncoder();
  return bytesToHex(await pbkdf2Async(sha256, encode.encode(password), encode.encode(salt), {
    c: 210_000, dkLen: 32, asyncTick: 10,
  }));
}

export function equalPasswordHash(actual: string, expected: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(expected)) return false;
  let difference = actual.length ^ expected.length;
  for (let i = 0; i < 64; i++) difference |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return difference === 0;
}

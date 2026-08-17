import { randomInt } from 'node:crypto';

// Excludes visually ambiguous characters (0/O, 1/I) so codes are easy to
// read aloud or type from a screen.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return code;
}

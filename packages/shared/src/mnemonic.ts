/**
 * Mnemonic phrase encoder/decoder for recovery keys.
 * Converts 32-byte keys to 24-word BIP39 phrases and back.
 * Backward compatible: accepts both mnemonic phrases and base64 keys.
 */
import { entropyToMnemonic, mnemonicToEntropy, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

/** Convert a base64 recovery key to a 24-word mnemonic phrase. */
export function keyToMnemonic(base64Key: string): string {
  const bytes = Uint8Array.from(Buffer.from(base64Key, 'base64'));
  return entropyToMnemonic(bytes, wordlist);
}

/** Convert a 24-word mnemonic phrase back to a base64 recovery key. */
export function mnemonicToKey(phrase: string): string {
  const bytes = mnemonicToEntropy(phrase.trim().toLowerCase(), wordlist);
  return Buffer.from(bytes).toString('base64');
}

/** Detect input format and return base64 key in either case. */
export function resolveRecoveryKey(input: string): string {
  const trimmed = input.trim();
  if (trimmed.includes(' ') && trimmed.split(/\s+/).length >= 12) {
    return mnemonicToKey(trimmed);
  }
  return trimmed;
}

/** Check if a string is a valid BIP39 mnemonic. */
export function isMnemonic(input: string): boolean {
  return validateMnemonic(input.trim().toLowerCase(), wordlist);
}

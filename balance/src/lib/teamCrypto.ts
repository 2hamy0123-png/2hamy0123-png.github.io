// End-to-end encryption for team data. The team key lives only in the invite
// and on members' phones, so the server stores ciphertext it cannot read.

const te = new TextEncoder();
const td = new TextDecoder();

export function toB64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const ID_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** A random, hard-to-guess team id (about 60 bits). */
export function newTeamId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join('');
}

/** A random 128-bit team key as text. */
export function newTeamKey(): string {
  return toB64Url(crypto.getRandomValues(new Uint8Array(16)));
}

export interface Invite {
  teamId: string;
  key: string;
}

/** The text a member shares: "<teamId>.<key>". */
export function makeInvite(i: Invite): string {
  return `${i.teamId}.${i.key}`;
}

const TEAM_ID = /^[a-z2-9]{12}$/;
const KEY = /^[A-Za-z0-9_-]{22}$/;

/** Reads an invite pasted by a user; tolerates spaces and line breaks. Null when malformed. */
export function parseInvite(text: string): Invite | null {
  const cleaned = text.replace(/\s+/g, '');
  const parts = cleaned.split('.');
  if (parts.length !== 2) return null;
  const [teamId, key] = parts;
  if (!TEAM_ID.test(teamId) || !KEY.test(key)) return null;
  return { teamId, key };
}

async function importKey(key: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', fromB64Url(key) as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export interface Sealed {
  iv: string;
  ct: string;
}

export async function seal(key: string, value: unknown): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await importKey(key), te.encode(JSON.stringify(value)));
  return { iv: toB64Url(iv), ct: toB64Url(new Uint8Array(ct)) };
}

/** Decrypts a sealed value. Returns null when the key is wrong or the data was altered. */
export async function open<T>(key: string, sealed: Sealed): Promise<T | null> {
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64Url(sealed.iv) as BufferSource },
      await importKey(key),
      fromB64Url(sealed.ct) as BufferSource,
    );
    return JSON.parse(td.decode(plain)) as T;
  } catch {
    return null;
  }
}

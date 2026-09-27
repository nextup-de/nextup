// Personal login codes: one per person, and the only thing that person types to get in.
//
// Replaces the pilot's shared company code + "who are you?" list, where anyone holding the code
// could pick any name - the manager's included. A personal code IS the identity: it maps to one
// User row, so there is nothing to pick and no staff list is ever sent to the browser.
//
// Stored as a plain sha256 (User.loginCodeHash, unique), like ApiToken.hash, because the login
// has to FIND the person from the code alone - a salted scrypt hash cannot be looked up. That is
// safe only because the code is random and long: 12 characters from a 31-letter alphabet is
// ~59 bits, far out of reach of an online guess and of a table built in advance.
//
// Pure: node:crypto only.
import { createHash, randomInt } from "node:crypto";

// No 0/o, 1/l/i: the code is read off a piece of paper or a chat message and typed on a phone.
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
const GROUPS = 3;
const GROUP_LEN = 4;

/** "acme-7f3k-92xd-q4mh" - the company slug up front, so a person can tell which code is which. */
export function generateLoginCode(slug: string): string {
  const group = () => Array.from({ length: GROUP_LEN }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return [slug, ...Array.from({ length: GROUPS }, group)].join("-");
}

/**
 * What people actually type: stray spaces, capitals, a pasted line break. None of it should make
 * a right code wrong. Hyphens stay - the slug itself can contain one.
 */
export function normalizeLoginCode(raw: string): string {
  return raw.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, "");
}

/** sha256 hex of the normalised code - what User.loginCodeHash stores. */
export function hashLoginCode(raw: string): string {
  return createHash("sha256").update(normalizeLoginCode(raw)).digest("hex");
}

/** Cheap shape check before any database lookup: "<slug>-xxxx-xxxx-xxxx". */
export function looksLikeLoginCode(raw: string, slug: string): boolean {
  const code = normalizeLoginCode(raw);
  const tail = new RegExp(`^${escapeRegex(slug)}(-[${ALPHABET}]{${GROUP_LEN}}){${GROUPS}}$`);
  return tail.test(code);
}

/**
 * The old shared company code ("acme-7f3a-92cd", features/auth/access-code.ts). It opens nothing
 * any more; the login uses this only to tell the person why their code stopped working.
 */
export function looksLikeSharedCode(raw: string, slug: string): boolean {
  return new RegExp(`^${escapeRegex(slug)}-[0-9a-f]{4}-[0-9a-f]{4}$`).test(normalizeLoginCode(raw));
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

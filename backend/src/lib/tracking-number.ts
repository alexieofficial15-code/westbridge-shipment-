import { randomInt } from "node:crypto";

// No 0/O or 1/I/L, so a customer reading the number off an email or phone screen can't mix them up.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const PREFIX = "WB";
const LENGTH = 10;

/**
 * A random, unguessable tracking number like "WB7K4M9QX2TP" (about 50 bits of randomness),
 * so nobody can browse other customers' shipments by trying nearby numbers.
 */
export function generateTrackingNumber(): string {
  let code = PREFIX;
  for (let i = 0; i < LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

/** Customers may type spaces or dashes ("WB7K 4M9Q-X2TP"); those are ignored. */
export function normalizeTrackingNumber(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

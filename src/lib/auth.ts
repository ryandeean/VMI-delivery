/**
 * Very simple shared-password login for the dispatch screens. Drivers never
 * log in: their personal link carries a token instead.
 */
import { config } from "./config";

export const SESSION_COOKIE = "vmi_session";
const SESSION_DAYS = 30;

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmac(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

export function loginRequired(): boolean {
  return Boolean(config.appPassword());
}

export async function makeSessionToken(): Promise<string> {
  const exp = Date.now() + SESSION_DAYS * 86_400_000;
  const sig = await hmac(`session:${exp}`, config.appSecret() + config.appPassword());
  return `${exp}.${sig}`;
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!loginRequired()) return true;
  if (!token) return false;
  const [expStr, sig] = token.split(".");
  const exp = Number(expStr);
  if (!exp || !sig || exp < Date.now()) return false;
  const expected = await hmac(`session:${exp}`, config.appSecret() + config.appPassword());
  return timingSafeEqual(expected, sig);
}

export function checkPassword(candidate: string): boolean {
  const pw = config.appPassword();
  return Boolean(pw) && timingSafeEqual(pw, candidate);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

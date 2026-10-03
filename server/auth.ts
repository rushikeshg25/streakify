import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export function sameSecret(input: string, expected: string) {
  return timingSafeEqual(createHash('sha256').update(input).digest(), createHash('sha256').update(expected).digest());
}
function sign(value: string, secret: string, password: string) {
  return createHmac('sha256', secret).update(`${password}\0${value}`).digest('base64url');
}
export function createSession(secret: string, password: string, now = Date.now()) {
  const expires = String(now + 7 * 24 * 60 * 60 * 1000);
  return `${expires}.${sign(expires, secret, password)}`;
}
export function validSession(cookie: string | undefined, secret: string, password: string, now = Date.now()) {
  const token = cookie?.split(';').map(part => part.trim()).find(part => part.startsWith('streakify_session='))?.slice('streakify_session='.length);
  if (!token) return false;
  const [expires, signature, extra] = token.split('.');
  return !extra && /^\d+$/.test(expires) && Number(expires) > now && !!signature && sameSecret(signature, sign(expires, secret, password));
}

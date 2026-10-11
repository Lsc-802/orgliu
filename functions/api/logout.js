// 登出接口：POST /api/logout
import { deleteSession, getSessionToken, clearSessionCookie, json } from '../lib/auth.js';

export async function onRequestPost(context) {
  const { env, request } = context;
  const token = getSessionToken(request);
  await deleteSession(env.DB, token);
  const res = json({ ok: true });
  clearSessionCookie(res);
  return res;
}

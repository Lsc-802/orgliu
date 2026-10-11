// 获取当前登录用户：GET /api/me
import { getUserBySession, getSessionToken, json } from '../lib/auth.js';

export async function onRequestGet(context) {
  const { env, request } = context;
  const token = getSessionToken(request);
  const user = await getUserBySession(env.DB, token);
  if (!user) return json({ loggedIn: false }, 200);
  return json({ loggedIn: true, username: user.username }, 200);
}

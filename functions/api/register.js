// 注册接口：POST /api/register  { username, password }
import { hashPassword, createSession, json, setSessionCookie } from '../lib/auth.js';

export async function onRequestPost(context) {
  const { env, request } = context;
  try {
    const body = await request.json().catch(() => null);
    if (!body) return json({ error: '请求格式错误' }, 400);

    const username = String(body.username || '').trim();
    const password = String(body.password || '');

    if (!username || !password) return json({ error: '用户名和密码不能为空' }, 400);
    if (username.length < 3 || username.length > 20) return json({ error: '用户名长度需在 3-20 个字符之间' }, 400);
    if (password.length < 6) return json({ error: '密码至少 6 位' }, 400);

    const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
    if (existing) return json({ error: '该用户名已被注册' }, 409);

    const { saltHex, hashHex } = await hashPassword(password);
    const stored = `${saltHex}:${hashHex}`;
    const result = await env.DB.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
      .bind(username, stored)
      .run();
    const userId = result.meta.last_row_id;

    const token = await createSession(env.DB, userId);
    const res = json({ ok: true, username }, 201);
    setSessionCookie(res, token);
    return res;
  } catch (e) {
    console.error('register error:', e);
    return json({ error: '服务器开小差了，请稍后再试' }, 500);
  }
}

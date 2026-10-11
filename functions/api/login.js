// 登录接口：POST /api/login  { username, password }
import { verifyPassword, createSession, json, setSessionCookie } from '../lib/auth.js';

export async function onRequestPost(context) {
  const { env, request } = context;
  try {
    const body = await request.json().catch(() => null);
    if (!body) return json({ error: '请求格式错误' }, 400);

    const username = String(body.username || '').trim();
    const password = String(body.password || '');

    if (!username || !password) return json({ error: '请输入用户名和密码' }, 400);

    const user = await env.DB.prepare('SELECT id, username, password_hash, email, email_verified FROM users WHERE username = ?')
      .bind(username)
      .first();

    // 用户名不存在也返回同样的提示，防止被探测哪些账号存在
    if (!user) return json({ error: '用户名或密码错误' }, 401);
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) return json({ error: '用户名或密码错误' }, 401);

    // 填了邮箱但未验证的账号禁止登录
    if (user.email && !user.email_verified) {
      return json({ error: '邮箱尚未验证，请先到注册邮箱点击激活链接后再登录' }, 403);
    }

    const token = await createSession(env.DB, user.id);
    const res = json({ ok: true, username: user.username }, 200);
    setSessionCookie(res, token);
    return res;
  } catch (e) {
    console.error('login error:', e);
    return json({ error: '服务器开小差了，请稍后再试' }, 500);
  }
}

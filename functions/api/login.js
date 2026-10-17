// ============================================================
// 登录接口：POST /api/login
//
// 【这个文件是干什么的】
//   处理"用户登录"：前端把 { 用户名, 密码 } 发来，
//   本文件负责：查库 → 比对密码 → 对了就创建会话（自动登录）
//
// 【怎么被调用的】
//   前端 fetch('/api/login', { method: 'POST', body: JSON... })
//
// 【引用了谁】
//   ../lib/auth.js —— 公共工具箱：
//     verifyPassword = 比对密码是否正确
//     createSession  = 创建登录会话
//     json           = 生成 JSON 响应
//     setSessionCookie= 把登录凭证写进 Cookie
// ============================================================

import { verifyPassword, createSession, json, setSessionCookie } from '../lib/auth.js';

export async function onRequestPost(context) {
  const { env, request } = context;
  try {
    // 解析前端发来的 JSON（{username:"小明", password:"123456"}）
    const body = await request.json().catch(() => null);
    if (!body) return json({ error: '请求格式错误' }, 400);

    const username = String(body.username || '').trim();
    const password = String(body.password || '');

    if (!username || !password) return json({ error: '请输入用户名和密码' }, 400);

    // 从数据库里查出这个用户（连同加密后的密码一起查出来）
    // 查不到 → user 是 null
    const user = await env.DB.prepare('SELECT id, username, password_hash FROM users WHERE username = ?')
      .bind(username)
      .first();

    // 用户名不存在也返回"用户名或密码错误"——故意和密码错误用同一句话。
    // 这样黑客无法通过报错差异判断"哪些用户名存在"，防止账号枚举攻击
    if (!user) return json({ error: '用户名或密码错误' }, 401); // 401 = 未授权

    // 比对密码：把用户刚输入的密码用库里的盐重新加密，
    // 和库里存的哈希对比，完全一致才算对
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) return json({ error: '用户名或密码错误' }, 401);

    // 密码正确 → 创建会话（sessions 表插入记录），拿到随机 token
    const token = await createSession(env.DB, user.id);

    // 返回登录成功 + 把 token 写进浏览器 Cookie（7 天有效）
    const res = json({ ok: true, username: user.username }, 200); // 200 = 成功
    setSessionCookie(res, token);
    return res;
  } catch (e) {
    console.error('login error:', e);
    return json({ error: '服务器开小差了，请稍后再试' }, 500);
  }
}

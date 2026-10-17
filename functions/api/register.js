// ============================================================
// 注册接口：POST /api/register
// 请求体：{ username, password, email, code, deviceId }
//
// 【注册规则】
//   1. 用户名：只能包含 中文/字母/数字 及 。 . ， , & _ - 这些符号，3-20 位
//   2. 密码：6-12 位，必须同时包含 大写字母、小写字母、数字、特殊符号
//   3. 邮箱：必须填写，且必须通过邮箱验证码验证（code 由 /api/send-code 发送）
//
// 【流程】校验 → 查重 → 验证码验证 → 建号(邮箱已激活) → 记录设备 → 自动登录
//
// 【引用了谁】
//   ../lib/auth.js —— hashPassword / createSession / json / setSessionCookie
// ============================================================

import { hashPassword, createSession, json, setSessionCookie } from '../lib/auth.js';

export async function onRequestPost(context) {
  const { env, request } = context;
  try {
    const body = await request.json().catch(() => null);
    if (!body) return json({ error: '请求格式错误' }, 400);

    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    const email = String(body.email || '').trim().toLowerCase();
    const code = String(body.code || '').trim();
    const deviceId = String(body.deviceId || '');

    if (!username || !password || !email || !code) {
      return json({ error: '用户名、密码、邮箱、验证码都不能为空' }, 400);
    }

    // ===== 规则 1：用户名只能含 中文/字母/数字 及 。 . ， , & _ - =====
    if (!/^[\u4e00-\u9fa5A-Za-z0-9。.,，&_\-]+$/.test(username)) {
      return json({ error: '用户名只能包含中文、字母、数字及 。 . ， , & _ - 这些符号' }, 400);
    }
    if (username.length < 3 || username.length > 20) {
      return json({ error: '用户名长度需在 3-20 个字符之间' }, 400);
    }

    // ===== 规则 2：密码 6-12 位，必须含大写/小写/数字/特殊符号 =====
    if (password.length < 6 || password.length > 12) {
      return json({ error: '密码长度需为 6-12 位' }, 400);
    }
    if (!/[A-Z]/.test(password)) return json({ error: '密码必须包含至少一个大写字母' }, 400);
    if (!/[a-z]/.test(password)) return json({ error: '密码必须包含至少一个小写字母' }, 400);
    if (!/\d/.test(password)) return json({ error: '密码必须包含至少一个数字' }, 400);
    if (!/[^A-Za-z0-9]/.test(password)) return json({ error: '密码必须包含至少一个特殊符号' }, 400);

    // 邮箱格式
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: '邮箱格式不正确' }, 400);

    // 查重：用户名、邮箱都不能重复
    const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
    if (existing) return json({ error: '该用户名已被注册' }, 409);
    const emailExists = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (emailExists) return json({ error: '该邮箱已被注册' }, 409);

    // ===== 规则 3：验证邮箱验证码（purpose=register，10 分钟内有效） =====
    const codeRow = await env.DB.prepare(
      "SELECT id FROM email_codes WHERE email = ? AND purpose = 'register' AND code = ? AND expires_at > datetime('now')"
    ).bind(email, code).first();
    if (!codeRow) return json({ error: '验证码错误或已过期，请重新获取' }, 400);

    // 创建用户：验证码通过 → 邮箱直接标记为已验证
    const { saltHex, hashHex } = await hashPassword(password);
    const stored = `${saltHex}:${hashHex}`;
    const result = await env.DB.prepare(
      'INSERT INTO users (username, password_hash, email, email_verified) VALUES (?, ?, ?, 1)'
    ).bind(username, stored, email).run();
    const userId = result.meta.last_row_id;

    // 注册用的这台设备记为可信设备（下次登录免验证码）
    if (deviceId) {
      await env.DB.prepare(
        'INSERT INTO user_devices (user_id, device_id) VALUES (?, ?) ON CONFLICT(user_id, device_id) DO NOTHING'
      ).bind(userId, deviceId).run();
    }

    // 删掉已使用的验证码（一次性）
    await env.DB.prepare('DELETE FROM email_codes WHERE email = ? AND purpose = ?').bind(email, 'register').run();

    // 注册成功 → 自动登录
    const token = await createSession(env.DB, userId, deviceId || null);
    const res = json({ ok: true, username }, 201);
    setSessionCookie(res, token);
    return res;
  } catch (e) {
    console.error('register error:', e);
    return json({ error: '服务器开小差了，请稍后再试' }, 500);
  }
}

// ============================================================
// 登录接口：POST /api/login
// 请求体：{ username, password, deviceId, loginCode? }
//
// 【新设备验证规则】
//   浏览器每次登录会带上自己的 device_id（存在 localStorage）。
//   - 设备在可信列表里 → 密码正确直接登录
//   - 新设备第一次登录 → 密码验证后，还需邮箱验证码：
//      ① 不带 loginCode 请求 → 后端自动发验证码到注册邮箱，返回 needVerify
//      ② 带上 loginCode 再次请求 → 验证码正确则登录，并把该设备记为可信
//
// 【引用了谁】
//   ../lib/auth.js —— verifyPassword / createSession / json / setSessionCookie
//   ../lib/smtp.js —— sendMail（自动发登录验证码）
// ============================================================

import { verifyPassword, createSession, json, setSessionCookie } from '../lib/auth.js';
import { sendMail } from '../lib/smtp.js';

// 生成 6 位数字验证码
function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function onRequestPost(context) {
  const { env, request } = context;
  try {
    const body = await request.json().catch(() => null);
    if (!body) return json({ error: '请求格式错误' }, 400);

    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    const deviceId = String(body.deviceId || '');
    const loginCode = String(body.loginCode || '').trim();

    if (!username || !password) return json({ error: '请输入用户名和密码' }, 400);

    // 查用户（连同注册邮箱一起查出，新设备验证要用）
    const user = await env.DB.prepare('SELECT id, username, password_hash, email FROM users WHERE username = ?')
      .bind(username)
      .first();

    // 用户名不存在也返回同样的提示，防账号枚举
    if (!user) return json({ error: '用户名或密码错误' }, 401);
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) return json({ error: '用户名或密码错误' }, 401);

    // ===== 新设备判定：查这台设备是否在可信列表 =====
    let knownDevice = false;
    if (deviceId) {
      const d = await env.DB.prepare('SELECT id FROM user_devices WHERE user_id = ? AND device_id = ?')
        .bind(user.id, deviceId)
        .first();
      knownDevice = !!d;
    }

    if (!knownDevice) {
      // ===== 新设备：必须通过邮箱验证码 =====
      if (!loginCode) {
        // ① 自动生成验证码并发送到注册邮箱
        const code = genCode();
        await env.DB.prepare('DELETE FROM email_codes WHERE email = ? AND purpose = ?').bind(user.email, 'login').run();
        await env.DB.prepare(
          "INSERT INTO email_codes (email, code, purpose, expires_at) VALUES (?, ?, 'login', datetime('now', '+10 minutes'))"
        ).bind(user.email, code).run();

        const mailHtml = `
          <div style="background:#0e0f14;color:#ffffff;font-family:Arial,Helvetica,sans-serif;padding:40px 20px;text-align:center;">
            <h2 style="margin:0 0 10px;">OUR MC 新设备登录验证</h2>
            <p style="color:#bbbbbb;margin:0 0 10px;">检测到你的账号在一台新设备上登录，验证码是：</p>
            <div style="font-size:40px;font-weight:700;letter-spacing:8px;color:#ffffff;border:1px solid rgba(255,255,255,0.6);border-radius:12px;padding:18px 0;max-width:320px;margin:0 auto;">${code}</div>
            <p style="color:#888888;font-size:12px;margin-top:26px;">验证码 10 分钟内有效。如非本人操作，请尽快修改密码。</p>
            <p style="color:#666666;font-size:12px;">本邮件由系统自动发送，请勿回复。</p>
          </div>`;

        try {
          await sendMail(env, { to: user.email, subject: 'OUR MC 新设备登录验证', html: mailHtml });
        } catch (e) {
          console.error('login code mail error:', e);
          return json({ error: '验证码发送失败，请稍后再试' }, 500);
        }

        // 返回 needVerify：前端显示验证码输入框
        return json({
          needVerify: true,
          email: user.email,
          error: '检测到新设备登录，验证码已发送至你的注册邮箱，请输入验证码完成验证'
        }, 403);
      }

      // ② 验证登录验证码（验证失败不删码，可重试到过期）
      const codeRow = await env.DB.prepare(
        "SELECT id FROM email_codes WHERE email = ? AND purpose = 'login' AND code = ? AND expires_at > datetime('now')"
      ).bind(user.email, loginCode).first();
      if (!codeRow) {
        return json({ needVerify: true, error: '验证码错误或已过期，请重新获取' }, 403);
      }

      // 验证码正确 → 这台设备记为可信
      if (deviceId) {
        await env.DB.prepare(
          'INSERT INTO user_devices (user_id, device_id) VALUES (?, ?) ON CONFLICT(user_id, device_id) DO NOTHING'
        ).bind(user.id, deviceId).run();
      }
      // 删掉已使用的验证码
      await env.DB.prepare('DELETE FROM email_codes WHERE email = ? AND purpose = ?').bind(user.email, 'login').run();
    }

    // 登录成功：创建会话
    const token = await createSession(env.DB, user.id, deviceId || null);
    const res = json({ ok: true, username: user.username }, 200);
    setSessionCookie(res, token);
    return res;
  } catch (e) {
    console.error('login error:', e);
    return json({ error: '服务器开小差了，请稍后再试' }, 500);
  }
}

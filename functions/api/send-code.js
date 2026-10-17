// ============================================================
// 发送邮箱验证码接口：POST /api/send-code  { email, purpose }
//
// 【这个文件是干什么的】
//   给指定邮箱发送 6 位数字验证码（通过 QQ 邮箱 SMTP）。
//   purpose（用途）：
//     'register' → 注册时验证邮箱（要求邮箱未被注册）
//     'login'    → 新设备登录重发验证码（要求邮箱已注册）
//
// 【验证码规则】
//   6 位数字，10 分钟有效；同一邮箱同一用途 60 秒内只能发一次（防刷）
//
// 【引用了谁】
//   ../lib/auth.js —— json（生成 JSON 响应）
//   ../lib/smtp.js —— sendMail（真正发信）
// ============================================================

import { json } from '../lib/auth.js';
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

    const email = String(body.email || '').trim().toLowerCase();
    const purpose = String(body.purpose || 'register');

    // 邮箱格式校验
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: '邮箱格式不正确' }, 400);

    // 按用途检查邮箱状态
    if (purpose === 'register') {
      // 注册用：邮箱不能已被注册
      const exists = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
      if (exists) return json({ error: '该邮箱已被注册' }, 409);
    } else if (purpose === 'login') {
      // 登录用：邮箱必须已注册（用户自己的注册邮箱）
      const user = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
      if (!user) return json({ error: '该邮箱未注册' }, 404);
    } else {
      return json({ error: '用途不正确' }, 400);
    }

    // 防刷：同一邮箱同一用途 60 秒内不能重复发送
    const recent = await env.DB.prepare(
      "SELECT id FROM email_codes WHERE email = ? AND purpose = ? AND created_at > datetime('now', '-1 minute')"
    ).bind(email, purpose).first();
    if (recent) return json({ error: '验证码已发送，请等 1 分钟后再试' }, 429);

    // 生成新验证码：先作废该邮箱旧码，再存新码（10 分钟有效）
    const code = genCode();
    await env.DB.prepare('DELETE FROM email_codes WHERE email = ? AND purpose = ?').bind(email, purpose).run();
    await env.DB.prepare(
      "INSERT INTO email_codes (email, code, purpose, expires_at) VALUES (?, ?, ?, datetime('now', '+10 minutes'))"
    ).bind(email, code, purpose).run();

    // 构造验证码邮件（深色风格，与网站一致）
    const purposeText = purpose === 'login' ? '新设备登录验证' : '注册邮箱验证';
    const mailHtml = `
      <div style="background:#0e0f14;color:#ffffff;font-family:Arial,Helvetica,sans-serif;padding:40px 20px;text-align:center;">
        <h2 style="margin:0 0 10px;">OUR MC ${purposeText}</h2>
        <p style="color:#bbbbbb;margin:0 0 24px;">你的验证码是：</p>
        <div style="font-size:40px;font-weight:700;letter-spacing:8px;color:#ffffff;border:1px solid rgba(255,255,255,0.6);border-radius:12px;padding:18px 0;max-width:320px;margin:0 auto;">${code}</div>
        <p style="color:#888888;font-size:12px;margin-top:26px;">验证码 10 分钟内有效，请勿泄露给他人。</p>
        <p style="color:#666666;font-size:12px;">本邮件由系统自动发送，请勿回复。</p>
      </div>`;

    // 通过 QQ 邮箱 SMTP 发送
    await sendMail(env, { to: email, subject: `OUR MC ${purposeText}`, html: mailHtml });

    return json({ ok: true, message: '验证码已发送，请查收邮件' }, 200);
  } catch (e) {
    console.error('send-code error:', e);
    return json({ error: '验证码发送失败，请稍后再试' }, 500);
  }
}

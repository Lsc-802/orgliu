// 注册接口：POST /api/register  { username, password, email }
// 注册成功后发送邮箱验证邮件，账号需点击邮件中的链接激活后才能登录
import { hashPassword, json } from '../lib/auth.js';
import { sendMail } from '../lib/smtp.js';

export async function onRequestPost(context) {
  const { env, request } = context;
  try {
    const body = await request.json().catch(() => null);
    if (!body) return json({ error: '请求格式错误' }, 400);

    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    const email = String(body.email || '').trim().toLowerCase();

    if (!username || !password || !email) return json({ error: '用户名、密码、邮箱都不能为空' }, 400);
    if (username.length < 3 || username.length > 20) return json({ error: '用户名长度需在 3-20 个字符之间' }, 400);
    if (password.length < 6) return json({ error: '密码至少 6 位' }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: '邮箱格式不正确' }, 400);

    const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
    if (existing) return json({ error: '该用户名已被注册' }, 409);

    const emailExists = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (emailExists) return json({ error: '该邮箱已被注册' }, 409);

    // 创建用户（邮箱默认未验证）
    const { saltHex, hashHex } = await hashPassword(password);
    const stored = `${saltHex}:${hashHex}`;
    const result = await env.DB.prepare('INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)')
      .bind(username, stored, email)
      .run();
    const userId = result.meta.last_row_id;

    // 生成验证令牌（24 小时有效）
    const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    await env.DB.prepare(
      "INSERT INTO verify_tokens (token, user_id, expires_at) VALUES (?, ?, datetime('now', '+1 day'))"
    ).bind(token, userId).run();

    // 用当前访问域名动态拼验证链接（不需要配置站点域名）
    const host = request.headers.get('host') || 'localhost';
    const proto = request.headers.get('x-forwarded-proto') || 'https';
    const verifyUrl = `${proto}://${host}/api/verify?token=${token}`;

    const mailHtml = `
      <div style="background:#0e0f14;color:#ffffff;font-family:Arial,Helvetica,sans-serif;padding:40px 20px;text-align:center;">
        <h2 style="margin:0 0 10px;">OUR MC 账号激活</h2>
        <p style="color:#bbbbbb;margin:0 0 30px;">欢迎加入 OUR MC！点击下方按钮完成邮箱验证：</p>
        <a href="${verifyUrl}" style="display:inline-block;background:rgba(255,255,255,0.15);border:1px solid #ffffff;color:#ffffff;padding:12px 36px;border-radius:12px;text-decoration:none;font-size:15px;">激活账号</a>
        <p style="color:#888888;font-size:12px;margin-top:30px;">如果按钮无法点击，请复制以下链接到浏览器打开：<br><span style="word-break:break-all;color:#aaaaaa;">${verifyUrl}</span></p>
        <p style="color:#666666;font-size:12px;">链接 24 小时内有效。本邮件由系统自动发送，请勿回复。</p>
      </div>`;

    try {
      await sendMail(env, { to: email, subject: 'OUR MC 账号激活', html: mailHtml });
    } catch (e) {
      console.error('send verify mail error:', e);
      return json({ error: '注册成功，但验证邮件发送失败，请稍后重试或联系我们', mailFailed: true }, 500);
    }

    return json({ ok: true, message: '注册成功，验证邮件已发送，请查收邮箱并点击链接激活账号' }, 201);
  } catch (e) {
    console.error('register error:', e);
    return json({ error: '服务器开小差了，请稍后再试' }, 500);
  }
}

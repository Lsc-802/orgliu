// 邮箱验证接口：GET /api/verify?token=xxx
// 用户点击邮件里的激活链接后访问此接口，验证通过则激活账号
import { json } from '../lib/auth.js';

// 简单结果页（与全站深色玻璃风格一致）
function htmlPage(title, desc, btnText, btnLink) {
  const body = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} · OUR MC</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: "Segoe UI", Roboto, Arial, "Microsoft YaHei", sans-serif; }
  body { background: #000; color: #fff; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
  body::before { content: ""; position: fixed; inset: -25px; z-index: -2; background: url("../image/background.jpg") center/cover no-repeat; filter: blur(25px); transform: scale(1.05); }
  body::after { content: ""; position: fixed; inset: 0; z-index: -1; background: rgba(0,0,0,0.42); pointer-events: none; }
  .card { width: 100%; max-width: 420px; background: rgba(30,30,30,0.2); backdrop-filter: blur(22px) saturate(170%); -webkit-backdrop-filter: blur(22px) saturate(170%); border: 1px solid rgba(255,255,255,0.85); border-radius: 20px; padding: 44px 36px; text-align: center; box-shadow: 0 8px 32px rgba(0,0,0,0.3); }
  .icon { width: 72px; height: 72px; margin: 0 auto 20px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.85); display: flex; align-items: center; justify-content: center; font-size: 34px; background: rgba(255,255,255,0.1); box-shadow: 0 0 18px rgba(255,255,255,0.25); }
  h1 { font-size: 1.5rem; margin-bottom: 10px; }
  p { color: #aaa; font-size: 0.95rem; line-height: 1.7; margin-bottom: 30px; }
  a { display: inline-block; padding: 12px 36px; color: #fff; text-decoration: none; background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.85); border-radius: 12px; transition: all 0.3s ease; }
  a:hover { background: rgba(255,255,255,0.28); box-shadow: 0 0 14px rgba(255,255,255,0.35); }
</style>
</head>
<body>
  <div class="card">
    <div class="icon">${title === '激活成功' ? '&#10003;' : '&#33;'}</div>
    <h1>${title}</h1>
    <p>${desc}</p>
    <a href="${btnLink}">${btnText}</a>
  </div>
</body>
</html>`;
  return new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export async function onRequestGet(context) {
  const { env, request } = context;
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get('token') || '';

    if (!token) {
      return htmlPage('验证失败', '激活链接无效，请重新注册获取新的验证邮件。', '返回登录', '/page/login.html');
    }

    // 查询有效（未过期）的令牌
    const row = await env.DB
      .prepare("SELECT user_id FROM verify_tokens WHERE token = ? AND expires_at > datetime('now')")
      .bind(token)
      .first();

    if (!row) {
      return htmlPage('验证失败', '激活链接无效或已过期，请重新注册获取新的验证邮件。', '返回登录', '/page/login.html');
    }

    // 激活账号并删除令牌（一次性使用）
    await env.DB.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').bind(row.user_id).run();
    await env.DB.prepare('DELETE FROM verify_tokens WHERE token = ?').bind(token).run();

    return htmlPage('激活成功', '邮箱验证成功，你的账号已激活，现在可以登录了。', '去登录', '/page/login.html');
  } catch (e) {
    console.error('verify error:', e);
    return htmlPage('验证失败', '服务器开小差了，请稍后再试。', '返回登录', '/page/login.html');
  }
}

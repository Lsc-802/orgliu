// ============================================================
// 邮件发送：EmailJS 方案（HTTPS 443 调用）
//
// 【为什么不用 QQ 邮箱 SMTP 直连】
//   Cloudflare 服务器只允许出站连接 80/443/8080/8443 端口，
//   QQ 邮箱 SMTP(465) 连不出去 → 必然超时。
//   因此借道 EmailJS：由 EmailJS 服务器使用你的 QQ 邮箱代为投递。
//
// 【EmailJS 配置来源】你的 EmailJS 账号（硬编码在下方常量）
//   - Service ID : service_prlud94（绑定了 smtp.qq.com + 你的授权码）
//   - Template ID: template_ibzz8b4（模板变量：{{to_email}}、{{code}}）
//   - Public Key : gFINawxMYa5Q3sYqq
//   - Private Key: HBs19s6TQRESK64W4HeUX（服务端调用凭证，Security 开了 strict mode）
//
// 【被谁引用】api/register.js、api/login.js、api/send-code.js 调用 sendMail
// ============================================================

const EMAILJS_SERVICE_ID = 'service_prlud94';
const EMAILJS_TEMPLATE_ID = 'template_ibzz8b4';
const EMAILJS_PUBLIC_KEY = 'gFINawxMYa5Q3sYqq';
const EMAILJS_PRIVATE_KEY = 'HBs19s6TQRESK64W4HeUX';

// 发送邮件：sendMail(env, { to, subject, html, code })
// 说明：EmailJS 模板自带主题与正文，subject/html 仅为兼容旧调用保留；
//       code 若没显式传入，会自动从 html 里提取 6 位数字验证码。
export async function sendMail(env, { to, subject, html, code }) {
  const match = String(html || '').match(/\d{6}/);
  const codeValue = code || (match ? match[0] : '');

  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: EMAILJS_SERVICE_ID,
      template_id: EMAILJS_TEMPLATE_ID,
      user_id: EMAILJS_PUBLIC_KEY,
      accessToken: EMAILJS_PRIVATE_KEY,
      template_params: { to_email: to, code: codeValue }
    })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`EmailJS 发送失败(${res.status}): ${text.slice(0, 300)}`);
  }
  return { ok: true };
}

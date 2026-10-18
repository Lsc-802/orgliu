// 临时调试接口：GET /api/debug-mail
// 检查 EmailJS 发信链路是否打通（会真的往你的 QQ 邮箱发一封测试邮件）
// 用完即删，不对外保留
import { json } from '../lib/auth.js';
import { sendMail } from '../lib/smtp.js';

export async function onRequestGet(context) {
  const { env } = context;
  const info = { mode: 'EmailJS' };
  try {
    await sendMail(env, { to: '3767878328@qq.com', subject: '调试', html: '<p>调试</p>', code: '123456' });
    info.send = '成功（测试邮件已发到 3767878328@qq.com，验证码 123456）';
  } catch (e) {
    info.send = '失败: ' + e.message;
  }
  return json(info);
}

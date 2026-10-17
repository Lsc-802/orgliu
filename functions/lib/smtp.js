// ============================================================
// 轻量 SMTP 客户端（零第三方依赖，适配 Cloudflare Pages Functions）
// 通过 QQ 邮箱 SMTP（465 SSL 直连）发送邮件
//
// 【引用了谁】被 api/register.js、api/login.js、api/send-code.js 调用
// 【环境变量】SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / MAIL_FROM
//             （配置在 wrangler.toml 的 [vars] 里）
// ============================================================
import { connect as tlsConnect } from 'node:tls';

const CRLF = '\r\n';

// 字符串转 base64（支持中文）
function b64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

// 读取一行响应（处理网络粘包：一次收到的数据可能含多行）
function readLine(socket) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const onData = (chunk) => {
      buf += chunk.toString('utf8');
      let idx;
      while ((idx = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, idx).replace(/\r$/, '');
        buf = buf.slice(idx + 1);
        socket.removeListener('data', onData);
        socket.removeListener('error', onErr);
        resolve(line);
        return;
      }
    };
    const onErr = (err) => {
      socket.removeListener('data', onData);
      reject(err);
    };
    socket.on('data', onData);
    socket.once('error', onErr);
  });
}

// 读取并校验响应码（支持多行响应，如 EHLO 的 250-xxx）
async function expectCode(socket, code) {
  let line = await readLine(socket);
  while (line.length > 3 && line[3] === '-') line = await readLine(socket);
  if (!line.startsWith(String(code))) {
    throw new Error(`SMTP 错误（期望 ${code}，收到 ${line}）`);
  }
  return line;
}

function writeLine(socket, line) {
  return new Promise((resolve, reject) => {
    socket.write(line + CRLF, (err) => (err ? reject(err) : resolve()));
  });
}

// 构造邮件原文（主题和正文都用 base64，兼容中文与 QQ 邮箱）
function buildMessage(from, to, subject, html) {
  const date = new Date().toUTCString();
  const bodyB64 = b64(html).replace(/(.{76})/g, '$1\r\n');
  return [
    `From: OUR MC <${from}>`,
    `To: <${to}>`,
    `Subject: =?UTF-8?B?${b64(subject)}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    'Date: ' + date,
    '',
    bodyB64
  ].join(CRLF);
}

// 发送邮件：sendMail(env, { to, subject, html })
export async function sendMail(env, { to, subject, html }) {
  const host = env.SMTP_HOST || 'smtp.qq.com';
  const port = Number(env.SMTP_PORT || 465);
  const user = env.SMTP_USER;
  const pass = env.SMTP_PASS;
  const from = env.MAIL_FROM || user;

  // 授权码没配置时给出明确提示（排查问题时能看懂）
  if (!user || !pass || String(pass).includes('在这里填入')) {
    throw new Error('SMTP 未配置：请先在 wrangler.toml 的 [vars] 里填 SMTP_USER / SMTP_PASS');
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const socket = tlsConnect({ host, port, servername: host }, async () => {
      try {
        await expectCode(socket, 220); // 服务器就绪
        await writeLine(socket, 'EHLO our-mc-site');
        await expectCode(socket, 250);
        await writeLine(socket, 'AUTH LOGIN');
        await expectCode(socket, 334);
        await writeLine(socket, b64(user));
        await expectCode(socket, 334);
        await writeLine(socket, b64(pass));
        await expectCode(socket, 235); // 认证成功
        await writeLine(socket, `MAIL FROM:<${from}>`);
        await expectCode(socket, 250);
        await writeLine(socket, `RCPT TO:<${to}>`);
        await expectCode(socket, 250);
        await writeLine(socket, 'DATA');
        await expectCode(socket, 354);
        await writeLine(socket, buildMessage(from, to, subject, html) + CRLF + '.');
        await expectCode(socket, 250); // 邮件已接受
        await writeLine(socket, 'QUIT');
        socket.end();
        settled = true;
        resolve({ ok: true });
      } catch (err) {
        if (!settled) {
          settled = true;
          socket.destroy();
          reject(err);
        }
      }
    });

    socket.setTimeout(20000, () => {
      if (!settled) {
        settled = true;
        socket.destroy();
        reject(new Error('SMTP 连接超时'));
      }
    });

    socket.on('error', (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
  });
}

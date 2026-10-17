// ============================================================
// 注册接口：POST /api/register
//
// 【这个文件是干什么的】
//   处理"用户注册"。前端 login.html 的注册表单把
//   { 用户名, 密码 } 发到这个接口，本文件负责：
//   校验 → 查重 → 加密密码 → 存入数据库 → 自动登录
//
// 【怎么被调用的】
//   前端 fetch('/api/register', { method: 'POST', body: JSON... })
//   Cloudflare 会自动把 functions/api/register.js 映射成网址 /api/register
//
// 【引用了谁】
//   ../lib/auth.js —— 公共工具箱：
//     hashPassword    = 密码加密
//     createSession   = 创建登录会话
//     json            = 生成 JSON 响应
//     setSessionCookie= 把登录凭证写进浏览器 Cookie
// ============================================================

// import  = "引入"。从 lib/auth.js 文件里取这 4 个工具函数来用
// '../lib/auth.js' 里的 .. 表示"上一级目录"（从 api/ 回到 functions/），
// 再进 lib/ 找到 auth.js
import { hashPassword, createSession, json, setSessionCookie } from '../lib/auth.js';

// export = "导出"。Cloudflare 规定：文件里导出 onRequestPost，
// 就表示"这个网址收到 POST 请求时，运行这个函数"
export async function onRequestPost(context) {
  // context = 本次请求的"上下文"，装着所有信息：
  //   context.env     → 环境变量 + 数据库绑定（我们代码里的 DB 就在这里）
  //   context.request → 浏览器发来的请求本体（含表单数据）
  const { env, request } = context;

  // try/catch = 先尝试执行，任何一步出错就跳到下面的 catch 兜底，
  // 避免报错把整个网站搞崩
  try {
    // 把浏览器发来的 JSON 字符串解析成对象，如 {username:"小明", password:"123456"}
    // .catch(() => null)：解析失败就返回 null，不抛异常
    const body = await request.json().catch(() => null);
    // 解析失败 → 返回 400（400 = 请求格式错误）
    if (!body) return json({ error: '请求格式错误' }, 400);

    // 取出用户名和密码。String() 确保是字符串，.trim() 去掉首尾空格
    const username = String(body.username || '').trim();
    const password = String(body.password || '');

    // 三道校验，不合格直接返回错误，不往下走
    if (!username || !password) return json({ error: '用户名和密码不能为空' }, 400);
    if (username.length < 3 || username.length > 20) return json({ error: '用户名长度需在 3-20 个字符之间' }, 400);
    if (password.length < 6) return json({ error: '密码至少 6 位' }, 400);

    // 查数据库：有没有人已经用了这个用户名？
    // prepare(...) 写 SQL，? 是占位符，bind(username) 把值安全填进去
    // （不直接拼字符串，是为了防 SQL 注入攻击）
    // .first() = 只取第一条结果，查不到返回 null
    const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
    // 查到了 → 用户名被占用，返回 409（409 = 资源冲突）
    if (existing) return json({ error: '该用户名已被注册' }, 409);

    // 密码加密：把明文密码变成不可逆的乱码（PBKDF2 算法，迭代 10 万次）
    // 即使数据库泄露，黑客也还原不出你的真实密码
    // 返回 { saltHex, hashHex }：salt=随机盐，hash=加密结果
    const { saltHex, hashHex } = await hashPassword(password);
    // 把盐和哈希拼成一个字符串存库，格式 "盐:哈希"
    // 以后登录验证密码时需要同一个盐，所以两个都得存
    const stored = `${saltHex}:${hashHex}`;

    // 把新用户写进数据库（用户名 + 加密后的密码）
    // run() = 执行写入，result 里带数据库自动分配的 ID
    const result = await env.DB.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
      .bind(username, stored)
      .run();
    // last_row_id = 数据库刚生成的自增主键（用户 ID）
    const userId = result.meta.last_row_id;

    // 注册成功 → 自动登录：往 sessions 表插一条记录，生成一个随机 token
    const token = await createSession(env.DB, userId);

    // 构造"注册成功"的响应（201 = 已创建）
    const res = json({ ok: true, username }, 201);
    // 把 token 写进浏览器 Cookie。
    // 之后浏览器每次访问都会自动带上它，服务器靠它认出"你是谁"
    setSessionCookie(res, token);
    // 把响应返回给浏览器
    return res;
  } catch (e) {
    // 上面任何一步抛异常都会跑到这里
    // console.error 把详细错误写到 Cloudflare 后台日志（排查问题用）
    console.error('register error:', e);
    // 返回通用提示（不把内部错误细节暴露给普通用户）
    return json({ error: '服务器开小差了，请稍后再试' }, 500); // 500 = 服务器内部错误
  }
}

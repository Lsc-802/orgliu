// ============================================================
// 认证核心库（公共工具箱）
//
// 【这个文件是干什么的】
//   登录系统所有接口共用的工具函数都集中在这里：
//   密码加密、密码比对、会话管理、Cookie 处理、JSON 响应
//
// 【谁引用了它】
//   api/register.js  api/login.js  api/logout.js  api/me.js
//   它们都用 import { 函数名 } from '../lib/auth.js' 按需取用
//
// 【为什么单独放一个文件】
//   避免四个接口各写一份重复代码。以后想改密码算法、会话时长，
//   只需改这一个文件，所有接口同时生效
// ============================================================

// PBKDF2 加密迭代次数：越大越难被暴力破解（10 万次是业界推荐值）
const ITERATIONS = 100000;
// 登录状态保持天数（7 天后会话过期，需要重新登录）
const SESSION_DAYS = 7;
// TextEncoder：把字符串转成字节数组（加密 API 只认字节格式）
const enc = new TextEncoder();

// 工具函数 1：字节数组 → 十六进制字符串（加密结果以 hex 存进数据库）
function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// 工具函数 2：十六进制字符串 → 字节数组（读库时还原）
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

// ========== 密码加密 / 比对 ==========

// 加密密码：hashPassword(明文密码) → { saltHex, hashHex }
// salt（盐）= 随机数。加盐后同样的密码每次加密结果都不同，
// 防止黑客用"彩虹表"（预计算好的密码哈希对照表）反推密码
export async function hashPassword(password, saltHex) {
  // 有传入盐 → 复用（验证密码时需要）；没传 → 生成新盐（注册时需要）
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  // 把密码交给 Web Crypto API（浏览器和 Cloudflare 都内置，无需额外装库）
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  // 用 PBKDF2 + SHA-256 算法，迭代 10 万次，算出 256 位的加密结果
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  // 返回 { 盐, 哈希 }，由调用方拼成 "盐:哈希" 存库
  return { saltHex: bytesToHex(salt), hashHex: bytesToHex(new Uint8Array(bits)) };
}

// 比对密码：verifyPassword(用户输入的密码, 库里存的"盐:哈希") → true/false
export async function verifyPassword(password, stored) {
  // 把 "盐:哈希" 拆开
  const [saltHex, hashHex] = String(stored).split(':');
  // 用库里存的同一个盐，把用户输入的密码重新加密一遍
  const { hashHex: computed } = await hashPassword(password, saltHex);
  // 两个哈希完全一致 → 密码正确
  return computed === hashHex;
}

// ========== JSON 响应工具 ==========

// json(数据, 状态码) → 生成带 JSON 头的 HTTP 响应
// 状态码含义：200=成功 201=已创建 400=参数错误 401=未授权 409=冲突 500=服务器错误
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

// ========== 会话管理 ==========

// 创建会话：createSession(数据库, 用户ID, 设备ID) → token
// 注册/登录成功后调用，往 sessions 表插一条记录（7 天后过期）
// deviceId 可选：记录本次登录来自哪个设备（新设备验证用）
export async function createSession(db, userId, deviceId = null) {
  // 生成一个超长随机字符串当 token（两个 UUID 拼一起，几乎不可能被猜中）
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  // 存进 sessions 表，过期时间由 SQL 计算：当前时间 +7 天
  await db
    .prepare("INSERT INTO sessions (token, user_id, device_id, expires_at) VALUES (?, ?, ?, datetime('now', '+7 days'))")
    .bind(token, userId, deviceId)
    .run();
  return token;
}

// 查会话：getUserBySession(数据库, token) → 用户信息 或 null
// me.js 靠它判断"这个 Cookie 对应的是谁"
export async function getUserBySession(db, token) {
  if (!token) return null;
  // JOIN = 把 sessions 表和 users 表按 user_id 关联起来一起查，
  // 这样既能验证会话有效，又能拿到用户名
  // 只查还没过期的会话（expires_at > 当前时间）
  const row = await db
    .prepare(
      `SELECT u.id, u.username FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > datetime('now')`
    )
    .bind(token)
    .first();
  return row || null;
}

// 删会话：deleteSession(数据库, token) —— 登出时调用
export async function deleteSession(db, token) {
  if (!token) return;
  await db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
}

// ========== Cookie 处理 ==========

// 设置登录 Cookie：把 token 交给浏览器保存
export function setSessionCookie(response, token) {
  response.headers.set(
    'Set-Cookie',
    `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 24 * 60 * 60}`
  );
  // HttpOnly    ：浏览器里的 JS 读不到这个 Cookie，防止黑客脚本偷登录态
  // SameSite=Lax：跨站请求不自动携带 Cookie，防 CSRF 攻击
  // Max-Age     ：7 天有效期（单位秒）
}

// 清除 Cookie（登出时用）：有效期设成 0，浏览器立即丢弃
export function clearSessionCookie(response) {
  response.headers.set('Set-Cookie', 'session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}

// 从请求头里取出 Cookie 中的 token（没登录时为 null）
export function getSessionToken(request) {
  const cookieHeader = request.headers.get('Cookie') || '';
  // 正则从 "session=xxx; 其他=yyy" 里抠出 session 的值
  const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
  return match ? match[1] : null;
}

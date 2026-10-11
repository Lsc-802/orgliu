// 认证核心库：密码哈希、会话管理、Cookie 工具
// 密码用 PBKDF2-SHA256 加密（100000 次迭代），不存明文

const ITERATIONS = 100000;
const SESSION_DAYS = 7; // 登录状态保持 7 天
const enc = new TextEncoder();

function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

// 生成密码哈希，返回 { saltHex, hashHex }
export async function hashPassword(password, saltHex) {
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return { saltHex: bytesToHex(salt), hashHex: bytesToHex(new Uint8Array(bits)) };
}

// 校验密码，stored 格式为 "saltHex:hashHex"
export async function verifyPassword(password, stored) {
  const [saltHex, hashHex] = String(stored).split(':');
  const { hashHex: computed } = await hashPassword(password, saltHex);
  return computed === hashHex;
}

// JSON 响应工具
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

// 创建会话，返回 token；过期时间由数据库生成（7 天后）
export async function createSession(db, userId) {
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  await db
    .prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now', '+7 days'))")
    .bind(token, userId)
    .run();
  return token;
}

// 根据 token 查当前用户，返回 { id, username } 或 null
export async function getUserBySession(db, token) {
  if (!token) return null;
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

// 删除会话（登出）
export async function deleteSession(db, token) {
  if (!token) return;
  await db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
}

// 设置登录 Cookie（HttpOnly 防脚本窃取）
export function setSessionCookie(response, token) {
  response.headers.set(
    'Set-Cookie',
    `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 24 * 60 * 60}`
  );
}

// 清除 Cookie（登出）
export function clearSessionCookie(response) {
  response.headers.set('Set-Cookie', 'session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}

// 从请求中取出 Cookie 里的 token
export function getSessionToken(request) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
  return match ? match[1] : null;
}

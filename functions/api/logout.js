// ============================================================
// 登出接口：POST /api/logout
//
// 【这个文件是干什么的】
//   处理"退出登录"：删除数据库里的会话记录 + 清掉浏览器 Cookie，
//   让登录状态立即失效
//
// 【怎么被调用的】
//   前端点击"退出登录"按钮时 fetch('/api/logout', { method: 'POST' })
//
// 【引用了谁】
//   ../lib/auth.js —— 公共工具箱：
//     deleteSession     = 删除数据库里的会话
//     getSessionToken   = 从 Cookie 里取出 token
//     clearSessionCookie= 让浏览器 Cookie 立即过期
//     json              = 生成 JSON 响应
// ============================================================

import { deleteSession, getSessionToken, clearSessionCookie, json } from '../lib/auth.js';

export async function onRequestPost(context) {
  const { env, request } = context;

  // 从浏览器带来的 Cookie 里取出会话 token（没登录时是 null）
  const token = getSessionToken(request);

  // 从数据库 sessions 表删掉这条会话。
  // 即使 token 不存在（比如没登录就点登出），删除也无害
  await deleteSession(env.DB, token);

  // 构造成功响应
  const res = json({ ok: true });

  // 清掉浏览器里的 Cookie（有效期设成 0 = 立即过期），
  // 让浏览器忘记登录状态
  clearSessionCookie(res);
  return res;
}

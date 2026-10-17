// ============================================================
// 查询登录状态接口：GET /api/me
//
// 【这个文件是干什么的】
//   回答"我现在登录了吗？登录的是谁？"
//   页面打开时前端会调它：
//   已登录 → 前端显示"欢迎回来，xxx"
//   未登录 → 前端保持登录表单
//
// 【怎么被调用的】
//   前端页面加载时 fetch('/api/me')（GET 请求，不带数据）
//
// 【引用了谁】
//   ../lib/auth.js —— 公共工具箱：
//     getUserBySession = 用 token 查出登录用户
//     getSessionToken  = 从 Cookie 里取出 token
//     json             = 生成 JSON 响应
// ============================================================

import { getUserBySession, getSessionToken, json } from '../lib/auth.js';

// 注意：这里是 onRequestGet（收到 GET 请求时运行），
// 而注册/登录/登出是 onRequestPost（POST 请求）——
// 方法名里的 Get/Post 就是请求类型，Cloudflare 按这个匹配
export async function onRequestGet(context) {
  const { env, request } = context;

  // 从 Cookie 里拿 token（没登录时为 null）
  const token = getSessionToken(request);

  // 用 token 去数据库查会话：
  // 会话存在且没过期 → 返回该用户信息；否则返回 null
  const user = await getUserBySession(env.DB, token);

  // 没登录 → 告诉前端 { loggedIn: false }
  if (!user) return json({ loggedIn: false }, 200);

  // 已登录 → 告诉前端 { loggedIn: true, username: "小明" }
  return json({ loggedIn: true, username: user.username }, 200);
}

import { onRequestGet as __api_debug_mail_js_onRequestGet } from "G:\\orgliu\\functions\\api\\debug-mail.js"
import { onRequestPost as __api_login_js_onRequestPost } from "G:\\orgliu\\functions\\api\\login.js"
import { onRequestPost as __api_logout_js_onRequestPost } from "G:\\orgliu\\functions\\api\\logout.js"
import { onRequestGet as __api_me_js_onRequestGet } from "G:\\orgliu\\functions\\api\\me.js"
import { onRequestPost as __api_register_js_onRequestPost } from "G:\\orgliu\\functions\\api\\register.js"
import { onRequestPost as __api_send_code_js_onRequestPost } from "G:\\orgliu\\functions\\api\\send-code.js"

export const routes = [
    {
      routePath: "/api/debug-mail",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_debug_mail_js_onRequestGet],
    },
  {
      routePath: "/api/login",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_login_js_onRequestPost],
    },
  {
      routePath: "/api/logout",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_logout_js_onRequestPost],
    },
  {
      routePath: "/api/me",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_me_js_onRequestGet],
    },
  {
      routePath: "/api/register",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_register_js_onRequestPost],
    },
  {
      routePath: "/api/send-code",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_send_code_js_onRequestPost],
    },
  ]
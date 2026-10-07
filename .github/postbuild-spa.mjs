/**
 * [postbuild-spa] 构建后补丁：给 dist/_worker.js 注入 SPA 回退。
 *
 * 背景：官方 worker.js 对非 /api 请求直接 env.ASSETS.fetch(request)，
 * 命中不到文件就返回 404。Cloudflare Pages 的 Advanced Mode 下 _worker.js 接管全部请求，
 * 因此 history 路由（官方用 createWebHistory）在「刷新页面 / 直达子页」时会 404。
 *
 * 本脚本仅做字符串替换，找不到预期语句就跳过并正常退出（绝不阻断部署）。
 */
import fs from "node:fs";
import path from "node:path";

const MARK = "[postbuild-spa]";
const target = path.resolve(process.cwd(), "dist/_worker.js");

if (!fs.existsSync(target)) {
  console.warn("[postbuild-spa] 未找到 dist/_worker.js，跳过");
  process.exit(0);
}

let code = fs.readFileSync(target, "utf8");

if (code.includes(MARK)) {
  console.log("[postbuild-spa] 已打过补丁，跳过");
  process.exit(0);
}

const NEEDLE = "return env.ASSETS.fetch(request);";
const idx = code.lastIndexOf(NEEDLE);

if (idx === -1) {
  console.warn("[postbuild-spa] 未找到预期静态资源兜底语句，跳过补丁（部署不受影响）");
  process.exit(0);
}

const REPLACEMENT = `/* [postbuild-spa] SPA fallback */
      {
        const assetResp = await env.ASSETS.fetch(request);
        if (
          assetResp.status === 404 &&
          (request.method === "GET" || request.method === "HEAD")
        ) {
          const u = new URL(request.url);
          const last = (u.pathname.split("/").pop() || "");
          if (!last.includes(".")) {
            return env.ASSETS.fetch(
              new Request(new URL("/index.html", u).toString(), request),
            );
          }
        }
        return assetResp;
      }`;

code = code.slice(0, idx) + REPLACEMENT + code.slice(idx + NEEDLE.length);
fs.writeFileSync(target, code);
console.log("[postbuild-spa] 已为 dist/_worker.js 注入 SPA 回退");

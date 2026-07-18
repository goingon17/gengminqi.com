# Stage 7 Release Polish

阶段 7 的目标是把已经能跑通的本地密码学阿瓦隆，收束成可以给真实玩家打开的发布态版本。服务器仍然只作为 Vercel 上的消息转发层；GitHub 推送后由 Vercel 自动部署。

## 已完成

- 房间页增加全局协议状态条，持续提示当前是在等待连接、等待离线玩家、等待 commit/reveal，还是本机已暂停协议。
- 增加本地 `Abort locally / Resume protocol` 控制。中止只影响当前设备继续发送事件，不会删除本地日志、不会改 hash 链、不会广播破坏性消息。
- 浏览器回到前台时会刷新本地活动时间；若 WebSocket 断开则自动重连，若仍在线则请求 replay。
- Relay 输入框支持移动端 `enterKeyHint="send"`，并禁用已暂停状态下继续发送。
- 触控按钮、手机输入字号、安全区域、减少动画偏好已补齐。
- JIFF/MPC worker 仍保持懒加载：只有所有角色 seed reveal 齐全、需要本地分配角色时才启动 worker。
- Next.js 增加发布安全 headers：
  - CSP 使用 `Content-Security-Policy-Report-Only` 先观察，不直接阻断生产行为。
  - `Referrer-Policy`
  - `X-Content-Type-Options`
  - `X-Frame-Options`
  - `Permissions-Policy`
- 增加 `pnpm release:check`，用于扫描源码里疑似数据库 URL、私钥、敏感环境变量和敏感 console 输出。

## 验收命令

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm release:check
pnpm build
```

## 手动浏览器验收

至少打开 2 个浏览器窗口，最好再加一台手机：

1. 首页可以创建/加入房间。
2. 房间页复制链接后，第二个设备能加入同一个房间。
3. 断开网络或关闭一个标签页后，状态条能显示离线/等待。
4. 恢复标签页后能自动重连并 replay 事件。
5. 点击 `Abort locally` 后，本机不能再发送新事件；点击 `Resume protocol` 后恢复。
6. 手机浏览器输入框不会因为字号过小而自动放大页面。
7. 390×844、430×932、768×1024、1440×900 四档宽度下，房间页没有横向溢出。

## Vercel 发布检查

1. 推送到 GitHub 后，等待 Vercel Preview 或 Production 自动构建完成。
2. 打开 Vercel deployment URL，确认响应 headers 中有阶段 7 新增的安全头。
3. 在生产域名重复一次“两个窗口加入同一房间”的 smoke test。

## 暂不做

- 不做完整安全审计。
- 不做服务端协议共识和强制踢人。
- 不把 CSP 改成强制阻断模式；当前阶段先用 Report-Only，避免 Next.js/Turbopack 的运行时代码被误伤。
- 不做截图自动化验收；视觉验收以真实浏览器手动检查为准。

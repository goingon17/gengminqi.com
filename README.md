# gengminqi.com

个人名片网站。概念：**公钥 / Public Key** —— 微信号 `o65537` 里的 65537 是 RSA 最常用的公钥指数 e，所以这张名片就是一把可以公开的钥匙。

- 可拖动、翻面、随鼠标 / 手机陀螺仪倾斜的 3D 全息名片（防伪纹 guilloche 镀膜，手机端竖版）
- WebGL 全息等高线背景，跟随指针
- 滚动时“解密”出现的文字
- 作品列表（桌面端悬浮预览）、65537 的故事
- 交换名片：访客留下联系方式，存入 Neon Postgres；`/contact.vcf` 一键存入通讯录

## 修改内容

所有个人信息都在 [`app/content.ts`](app/content.ts)。

## 本地运行

```bash
pnpm install
vercel env pull .env.local
pnpm dev
```

## 收件箱

访客交换的名片在 `/inbox` 查看（HTTP Basic Auth，用户名随意，密码为环境变量 `INBOX_PASSWORD`，未设置时回退到 `APP_PASSWORD`）。数据表 `exchanged_cards` 在首次提交时自动创建。

## 验证

```bash
pnpm lint && pnpm typecheck && pnpm build
```

# gengminqi.com

一个用 AI 让计算机科学被看见和理解的科普网站。Chapter 1 从密码学开始，第一篇交互长文介绍 FHE（Fully Homomorphic Encryption，全同态加密）：用直觉、实验和必要的数学解释“机器如何在看不见数据的情况下完成计算”。

线上地址：[gengminqi.com](https://gengminqi.com)

## 当前内容

- FHE 的核心直觉与信任边界
- 传统加密计算和同态加密计算的流程对比
- 可操作的加密、密文求值、解密演示
- 正确性公式、噪声与 Bootstrapping
- 适用场景与工程限制
- 下一篇主题的匿名互动投票

## 本地运行

```bash
pnpm install
pnpm dev
```

访问 `http://localhost:3000`。

## 验证

```bash
pnpm lint
pnpm typecheck
pnpm build
```

项目使用 Next.js App Router，可由 GitHub 推送触发 Vercel 自动部署。当前站点为静态科普内容，不需要数据库、环境变量或服务端 API。

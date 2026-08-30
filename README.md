# gengminqi.com

一个写给好奇者的计算机科学科普网站。第一篇交互长文从 FHE（Fully Homomorphic Encryption，全同态加密）开始：用直觉、实验和必要的数学解释“机器如何在看不见数据的情况下完成计算”。

线上地址：[gengminqi.com](https://gengminqi.com)

## 当前内容

- FHE 的核心直觉与信任边界
- 传统加密计算和同态加密计算的流程对比
- 可操作的加密、密文求值、解密演示
- 正确性公式、噪声与 Bootstrapping
- 适用场景与工程限制
- 下一篇预告：MPC（安全多方计算）

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

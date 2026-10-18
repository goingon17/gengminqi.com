# gengminqi.com — The Quiet Casino

一张赌桌，一盏灯。首页就是一张 3D 赌桌：最前面是一张名片（微信 o65537），旁边是一摞代表你余额的筹码，后面摆着轮盘、骰子和老虎机。点击任何物件，镜头和灯光会一起推近；点空白处或按 Esc 回到桌面。手机和电脑都能访问（竖屏会换成一张长桌）。

**只是游戏**：筹码是存在浏览器本地的虚拟数字，没有充值、提现或任何真实货币交易。

- **轮盘 Roulette**：单零欧式轮盘，押红 / 黑（×2）或 0（×36）
- **骰宝 Sic Bo**：三颗骰子由真实物理模拟（cannon-es）掷出，押大 / 小（×2，豹子通杀）或豹子（×31）
- **老虎机 Slots**：三个转轴，三连 ×5–×30，两连 ×1.5

结果由 `crypto.getRandomValues` 抽取（骰子由随机初始条件的物理模拟决定）。

## 技术

Next.js · React Three Fiber · drei · cannon-es。规则在 [`app/casino/rules.ts`](app/casino/rules.ts)，桌面布局与镜头在 [`app/casino/Scene.tsx`](app/casino/Scene.tsx)，名片在 [`app/casino/Card.tsx`](app/casino/Card.tsx)。

```bash
pnpm install
pnpm dev
```

## 验证

```bash
pnpm lint && pnpm typecheck && pnpm build
```

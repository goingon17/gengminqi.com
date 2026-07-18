# Avalon Local Protocol — 实现计划

## 1. 项目定义

构建一个可在手机和电脑浏览器直接打开的极简阿瓦隆游戏。

游戏规则、角色分配、秘密信息和任务票统计由所有玩家的浏览器共同执行；Vercel 只负责提供网页、建立房间和转发消息，不参与角色分配与胜负判断。

第一版优先保证：

- 5–10 人能完整玩完一局
- 服务器无法直接读取玩家角色和任务秘密票
- 手机与桌面浏览器拥有同等完整的体验
- 视觉完成度达到可公开展示的产品水准
- 架构足够简单，单人可以维护

第一版不追求：

- 抵抗专业攻击者修改整个 MPC 客户端
- 严格形式化验证或第三方密码学审计
- 玩家掉线后由其他玩家强制继续
- 账号、排行榜、历史战绩和社交系统
- 语音、视频和游戏内聊天
- 观战、匹配、机器人和扩展角色

## 2. 第一版游戏范围

### 2.1 角色

第一版只实现最小角色集合：

- Merlin
- Assassin
- Loyal Servant
- Minion of Mordred

所有人数均使用官方阵营人数比例。Percival、Morgana、Mordred、Oberon 和 Lady of the Lake 留到第二版。

这样仍然保留阿瓦隆的核心体验：

- Merlin 知道所有邪恶玩家
- 邪恶玩家彼此知道身份
- 好人需要完成三次任务
- 好人完成三次任务后，Assassin 可以刺杀 Merlin

### 2.2 游戏流程

```text
创建房间
  → 玩家加入
  → 全员确认名单与规则
  → 本地协议分配角色
  → 私密查看角色
  → 队长提名任务队伍
  → 全员表决
  → 任务成员秘密投票
  → 公布任务结果
  → 重复至一方满足胜利条件
  → 必要时执行刺杀
  → 公布角色与最终结果
```

### 2.3 简化规则

- 不提供游戏内讨论工具，玩家使用现场交流或外部语音
- 队伍表决结果公开到每一名玩家
- 任务只公开失败票数量，不公开具体投票者
- 好人客户端只能提交成功票
- 邪恶玩家可以提交成功或失败票
- 7 人及以上时，第四次任务遵守“两张失败票才失败”的规则
- 连续五次组队表决未通过，邪恶阵营直接获胜
- 游戏开始后不能加入新玩家或替换玩家
- 任意玩家永久离开时，本局终止并重新开始

## 3. 信任与安全边界

### 3.1 第一版保证

- 角色由所有玩家共同产生，没有单一发牌者
- Vercel 和 Redis 只能看到房间元数据、消息大小和密文
- 公共游戏事件都有签名，服务器不能伪造玩家操作
- 消息包含序号和前序哈希，可以发现篡改、重复和分叉
- 最后一名投票者不能在提交阶段看到其他人的队伍表决
- 任务失败票通过本地 MPC 汇总，不向服务器公开个人选择

### 3.2 第一版接受的限制

- 修改完整客户端的高级玩家仍可能破坏协议或迫使游戏终止
- 玩家可以截图、共享屏幕或线下透露自己的角色
- 服务器可以延迟、丢弃消息或让房间不可用，但不能伪造有效签名
- 普通网页由服务器下发，因此第一版假设 Vercel 部署本身不会投放恶意前端代码
- 同一浏览器刷新后可以尝试恢复；更换设备后不保证恢复
- MPC 采用半诚实安全模型，不宣传为经过审计的完全无信任系统

产品文案统一使用：

> 角色与秘密投票在玩家设备之间共同计算，服务器只转发加密消息。

避免使用“绝对安全”“无法作弊”或“数学上完全可信”等表述。

## 4. 技术架构

### 4.1 技术栈

- Next.js App Router
- TypeScript strict mode
- React Server Components 用于静态入口页
- Client Components 用于房间和游戏交互
- Tailwind CSS
- Motion 用于少量状态过渡
- JIFF 作为第一版浏览器 MPC 实验实现
- libsodium-wrappers 用于签名、密钥协商和消息加密
- Web Worker 执行密码学计算
- IndexedDB 保存当前房间的本地身份、随机种子和恢复数据
- Vercel Functions WebSocket Public Beta 作为消息中继
- Upstash Redis 作为跨 Vercel 实例的临时消息流

不使用 Postgres、Neon、ORM、用户数据库或后台管理系统。

JIFF 必须关闭由服务器提供预处理材料的 `crypto_provider` 模式，相关随机性和预处理由客户端共同产生，确保 Vercel 保持纯中继角色。

### 4.2 系统关系

```text
┌──────────────────┐       encrypted envelopes       ┌──────────────────┐
│ Player A Browser │◀────────────────────────────────▶│                  │
│ UI + Game Engine │                                   │ Vercel WebSocket │
│ Crypto Worker    │                                   │ Relay            │
└──────────────────┘                                   │                  │
                                                       │ No game logic    │
┌──────────────────┐       encrypted envelopes       │ No plaintext     │
│ Player B Browser │◀────────────────────────────────▶│ No role dealing  │
│ UI + Game Engine │                                   │                  │
│ Crypto Worker    │                                   └────────┬─────────┘
└──────────────────┘                                            │
                                                                │ ciphertext
┌──────────────────┐       encrypted envelopes                  │ stream + TTL
│ Player N Browser │◀────────────────────────────────▶┌──────────▼─────────┐
│ UI + Game Engine │                                  │ Upstash Redis      │
│ Crypto Worker    │                                  │ Ephemeral only     │
└──────────────────┘                                  └────────────────────┘
```

### 4.3 浏览器模块

`game engine`

- 纯 TypeScript 状态机
- 根据已验证事件推导公共游戏状态
- 不直接访问网络、React 或 IndexedDB
- 所有客户端对同一事件流必须算出相同结果

`crypto worker`

- 生成和保存玩家密钥
- 运行角色分配协议
- 生成每位玩家的秘密视野
- 汇总任务秘密票
- 执行刺杀者身份约束
- 避免计算阻塞 UI

`transport`

- WebSocket 连接与指数退避重连
- 消息签名、加密、验证和去重
- 本地待发送队列
- 缺失消息检测与补发请求

`local persistence`

- 保存房间 ID、玩家 ID、密钥和协议随机种子
- 保存最后确认的事件哈希和序号
- 游戏结束或主动离开时清除秘密数据

### 4.4 Vercel 中继职责

中继只接受统一消息格式：

```ts
type Envelope = {
  protocolVersion: 1
  roomId: string
  senderId: string
  recipients: string[] | "broadcast"
  sequence: number
  previousHash: string
  messageType: string
  ciphertext: string
  signature: string
  sentAt: number
}
```

服务器只执行：

- 校验尺寸、字段格式和房间限额
- 把消息发给同房间连接
- 把密文写入带 TTL 的 Redis Stream
- 为重连玩家返回缺失密文
- 清理无活动房间
- 限制单连接和单房间发送频率

服务器禁止执行：

- 解析角色和秘密票
- 修改或补造游戏事件
- 代替玩家产生随机数
- 计算任务结果和胜负
- 保存永久游戏记录

## 5. 协议设计

### 5.1 房间建立

每名玩家首次加入房间时生成：

- Ed25519 签名密钥
- X25519 加密密钥
- 128 位随机玩家 ID
- 本局私有随机种子

房主锁定房间后，全员签署同一个 `genesis`：

```ts
type Genesis = {
  roomId: string
  protocolVersion: 1
  buildId: string
  players: Array<{
    id: string
    name: string
    signingPublicKey: string
    encryptionPublicKey: string
  }>
  roleConfig: string[]
  createdAt: number
}
```

客户端把 `genesis` 哈希显示为一组简短校验词。现场玩家口头确认校验词一致后开始，防止服务器给不同玩家展示不同名单。

### 5.2 角色分配

第一版用 JIFF 在浏览器之间运行半诚实 MPC：

1. 每名玩家贡献私有随机值
2. 随机值以秘密份额发送给其他玩家
3. MPC 为每个座位生成秘密随机排序值
4. 根据秘密排名把公开角色列表分配给玩家
5. 角色只对对应玩家打开
6. Merlin 私下得到邪恶玩家列表
7. 邪恶玩家私下得到其他邪恶玩家列表
8. 检测到随机值碰撞时重新运行

角色随机种子保存在 IndexedDB。页面恢复时，全员可以使用相同输入重新建立同一组秘密状态。

### 5.3 队伍表决

队伍提案是签名公共事件。

表决采用 commit–reveal：

1. 每名玩家选择同意或拒绝
2. 客户端发送 `hash(choice + nonce)`
3. 所有人完成提交后公开 `choice + nonce`
4. 客户端验证承诺并统计结果
5. 不公开或承诺不匹配的玩家触发协议终止

### 5.4 任务表决

1. 只有本次任务成员看到投票操作
2. 好人 UI 只显示成功
3. 邪恶玩家可选择成功或失败
4. 所有玩家共同运行 MPC
5. MPC 使用秘密角色约束有效失败票
6. 只公开失败票总数与任务结果
7. 个人任务票不进入公共事件流

即使好人通过简单修改 UI 选择失败，MPC 也会根据秘密角色把该输入约束为成功。第一版不保证抵抗对整个 MPC 实现的恶意改写。

### 5.5 刺杀与结算

- 好人完成第三次成功任务后进入刺杀阶段
- MPC 只接受 Assassin 对应玩家的目标输入
- 公开被刺杀玩家和最终胜负
- 游戏结束后公开所有角色
- 所有浏览器展示同一份签名事件摘要
- 玩家退出结算页时删除本局秘密份额

## 6. 视觉与交互方向

### 6.1 设计主题

方向定义为“现代仪式感”，避免常见的廉价中世纪游戏 UI。

视觉关键词：

- 克制
- 黑曜石
- 羊皮纸
- 烛光金
- 秘密与仪式
- 大面积留白
- 清晰的状态层级

基础色板：

```text
Obsidian       #090A0E
Ink            #11131A
Vellum         #EEE7D8
Muted Vellum   #AFA89A
Candle Gold    #C5A56A
Merlin Blue    #456987
Loyal Green    #416B5B
Evil Crimson   #873D48
Hairline       rgba(238, 231, 216, 0.14)
```

字体：

- 展示标题：Cormorant Garamond 或同类高对比衬线字体
- UI 与数字：Inter 或 Geist Sans
- 字体通过 `next/font` 随构建产物发布，不依赖运行时第三方 CDN

### 6.2 核心界面

1. 首页：创建房间、输入房间码加入
2. 大厅：玩家名单、连接状态、规则摘要、全员确认
3. 身份揭示：长按显示角色，松手立即遮盖
4. 主游戏：任务进度、当前队长、玩家席位、提名状态
5. 队伍表决：明确的同意/拒绝操作与提交状态
6. 任务表决：成功/失败卡片式选择
7. 回合结果：失败票数量和任务轨迹
8. 刺杀：Assassin 选择目标
9. 终局：胜负、角色揭示、事件验证状态

### 6.3 响应式策略

移动端优先，最低宽度 320px。

手机：

- 单列布局
- 核心操作固定在底部安全区域
- 使用 `100dvh` 与 `env(safe-area-inset-*)`
- 所有触控目标至少 44×44px
- 玩家列表使用紧凑纵向席位
- 复杂说明放入底部抽屉

桌面：

- 最大内容宽度 1280px
- 左侧显示任务轨迹
- 中间显示玩家席位与当前阶段
- 右侧显示操作和协议状态
- 不因宽屏加入额外功能，只优化信息密度

共同要求：

- 支持最新两个主要版本的 Chrome、Safari、Edge 和 Firefox
- iOS Safari 与 Android Chrome 为移动端重点
- 支持键盘操作和可见焦点
- 支持 `prefers-reduced-motion`
- 文字对比度达到 WCAG AA
- 不使用渐变堆叠、3D 卡牌或持续粒子动画

### 6.4 动效原则

- 页面阶段切换：180–240ms 淡入和轻微位移
- 角色揭示：遮罩开合，不做翻转卡片
- 投票完成：一次短促光晕反馈
- 任务结果：控制在 600ms 内完成
- 网络等待：安静的呼吸状态，不使用旋转 loading 图标
- 禁止动效影响投票速度或泄露秘密操作时机

## 7. 目录规划

```text
gengminqi.com/
├── app/
│   ├── api/
│   │   ├── health/route.ts
│   │   ├── rooms/route.ts
│   │   └── ws/route.ts
│   ├── room/[roomId]/page.tsx
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── game/
│   ├── lobby/
│   ├── room/
│   └── ui/
├── lib/
│   ├── crypto/
│   │   ├── envelope.ts
│   │   ├── identity.ts
│   │   ├── mpc.ts
│   │   └── verify.ts
│   ├── game/
│   │   ├── config.ts
│   │   ├── events.ts
│   │   ├── reducer.ts
│   │   ├── rules.ts
│   │   └── types.ts
│   ├── relay/
│   │   ├── redis.ts
│   │   └── rooms.ts
│   ├── storage/
│   │   └── local-game.ts
│   └── transport/
│       ├── protocol.ts
│       └── socket.ts
├── workers/
│   └── crypto.worker.ts
├── tests/
│   ├── game/
│   ├── protocol/
│   └── e2e/
├── public/
├── IMPLEMENTATION_PLAN.md
├── package.json
├── tsconfig.json
└── vercel.json
```

## 8. 开发阶段

### 阶段 0：技术验证

- 验证 Vercel WebSocket 在目标账户和区域可用
- 两个浏览器通过 Vercel 中继互发密文
- 验证 Redis Stream 跨实例转发和 TTL 清理
- 在 iOS Safari、Android Chrome 和桌面 Chrome 运行 JIFF
- 测量 10 方秘密比较与私有输出耗时

通过标准：10 个浏览器可以完成一次角色分配，且没有角色明文进入服务器日志。

### 阶段 1：项目骨架与视觉原型

- 初始化 Next.js、TypeScript、Tailwind 和字体
- 建立颜色、排版、间距、圆角和动效 token
- 完成首页、大厅、身份揭示和主游戏静态原型
- 在 390×844、430×932、768×1024、1440×900 下截图验收

通过标准：所有核心页面在手机和电脑上均无溢出，视觉方向确定后不再大改设计系统。

### 阶段 2：纯游戏引擎

- 建立玩家、任务、提案、表决和胜负类型
- 实现确定性 reducer
- 实现 5–10 人任务人数与阵营配置
- 编写完整游戏模拟测试
- 验证连续五次拒绝、第四任务双失败票和刺杀分支

通过标准：无需 UI 和网络即可通过事件序列完整运行所有人数的游戏。

### 阶段 3：房间和中继

- 创建和加入六位房间码
- WebSocket 连接、心跳和重连
- Redis Stream 跨实例广播
- 玩家在线状态与房间锁定
- 消息限流、尺寸限制和过期清理

通过标准：10 个真实浏览器可以稳定加入同一房间并接收有序公共事件。

### 阶段 4：身份、签名和事件日志

- 生成玩家签名及加密密钥
- 建立 `genesis` 和校验词
- 实现签名 Envelope
- 实现序号、哈希链、去重和缺失消息恢复
- 使用 IndexedDB 保存本局身份

通过标准：修改、重放或伪造事件会被所有正常客户端拒绝。

### 阶段 5：角色 MPC

- 集成 JIFF 与 Web Worker
- 实现共同随机角色分配
- 私有打开个人角色
- 私有生成 Merlin 和邪恶阵营视野
- 实现刷新后的协议重建

通过标准：运行 10,000 次模拟后角色位置无明显偏差，服务器和无权限玩家无法读到其他角色。

### 阶段 6：完整游戏协议

- 连接队长提名和公共状态机
- 实现队伍表决 commit–reveal
- 实现任务票 MPC 汇总
- 实现胜负判断与 Assassin 刺杀
- 实现终局角色公开和本地秘密清理

通过标准：5、7、10 人真实浏览器各完整玩完至少一局。

### 阶段 7：设计打磨与发布

- 完成全部状态的视觉与动效
- 增加网络等待、玩家超时和协议终止提示
- 检查移动端键盘、安全区域和后台恢复
- 优化密码学包的懒加载
- 增加 CSP、依赖锁定和敏感日志检查
- 部署 Preview，完成跨设备验收后发布 Production

## 9. 测试计划

### 9.1 游戏规则

- 每种人数的阵营和任务人数正确
- 队长轮换正确
- 多数表决正确
- 连续五次拒绝触发邪恶胜利
- 三次任务失败触发邪恶胜利
- 三次任务成功后正确进入刺杀阶段
- Assassin 命中和未命中 Merlin 的结果正确

### 9.2 协议

- 随机角色分布测试
- 承诺与公开不匹配测试
- 重复、乱序、缺失和伪造消息测试
- WebSocket 断开与恢复测试
- Redis 重复投递测试
- 页面刷新后同一浏览器恢复测试
- 玩家永久离线后的统一终止测试

### 9.3 浏览器与视觉

- iPhone Safari
- Android Chrome
- macOS Safari
- macOS/Windows Chrome
- Firefox
- 320px 最小宽度
- 横屏手机
- 桌面 1440px 与超宽屏
- 减少动态效果模式
- 慢速网络和后台恢复

### 9.4 自动化

- Vitest：规则和事件 reducer
- fast-check：状态机与角色随机属性测试
- Playwright：多浏览器房间流程
- Playwright screenshot：关键响应式页面视觉回归
- 10 个浏览器上下文的完整游戏冒烟测试

## 10. 性能目标

- 首页首屏不加载 MPC 包
- 进入房间后再懒加载 JIFF 和 crypto worker
- 首页移动端 LCP 小于 2.5 秒
- 普通公共操作反馈小于 150ms
- 队伍表决完成后 1 秒内公布结果
- 任务 MPC 在常见网络下目标小于 3 秒
- 10 人角色分配目标小于 8 秒
- UI 主线程长任务不超过 50ms
- 房间密文默认保留 2 小时，最长不超过 24 小时

## 11. Vercel 配置

第一版只需要一个环境变量：

```text
REDIS_URL=
```

部署要求：

- 固定 Node.js 版本
- WebSocket Function 使用 Fluid Compute
- 设置足够覆盖一局游戏的最大 Function 时长
- 客户端始终实现断线重连，不能依赖单连接持续整局
- Redis key 使用房间 ID 命名空间并设置 TTL
- Preview 与 Production 使用不同 Redis 前缀
- Vercel 日志不输出 ciphertext、签名、公钥列表或完整 Envelope

## 12. 发布门槛

满足以下条件后才能公开发布：

- 5–10 人全部人数配置可完成游戏
- 手机和桌面核心功能一致
- iOS Safari 可以完成整局
- 服务器日志没有角色或任务票明文
- 伪造、重放和乱序消息不会改变游戏状态
- 任意玩家掉线时其他客户端显示一致状态
- 视觉回归页面全部通过
- 首页、房间、大厅、游戏和结算没有开发占位内容
- 产品页面明确说明半诚实安全边界

## 13. 第二版候选

第一版稳定后再考虑：

- Percival 与 Morgana
- Mordred 与 Oberon
- Lady of the Lake
- PWA 安装与签名构建版本显示
- 加密的断线恢复包
- 房间二维码和局域网投屏模式
- 完整主动安全 MPC
- 可识别作弊终止
- 匿名化本地对局记录导出

不把第二版候选提前塞进第一版代码。

## 14. 关键参考

- [Mental Poker — Shamir, Rivest, Adleman](https://people.csail.mit.edu/rivest/pubs.html)
- [JIFF browser MPC](https://github.com/multiparty/jiff)
- [MP-SPDZ reference implementation](https://github.com/data61/MP-SPDZ)
- [Web Cryptography API](https://www.w3.org/TR/WebCryptoAPI/)
- [Vercel WebSocket Public Beta](https://vercel.com/changelog/websocket-support-is-now-in-public-beta)
- [Vercel WebSocket chat architecture](https://vercel.com/kb/guide/real-time-chat-websockets)

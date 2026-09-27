// All personal content lives here. Edit this file to update the site.

export const profile = {
  name: "Geng Minqi",
  // Chinese name — leave empty to hide.
  nameZh: "",
  initials: "GMQ",
  role: "Builder",
  tagline: "在密码学、博弈与市场之间，把复杂的东西做成可以被触摸的东西。",
  taglineEn: "Cryptography · Games · Markets",
  location: "北京",
  timezone: "Asia/Shanghai",
  site: "gengminqi.com",
  url: "https://gengminqi.com",
  wechat: "o65537",
  // WeChat "add friend" link, decoded from the official QR code.
  wechatQr: "https://u.wechat.com/MKAKiL0KkkU5E0nlDJct3kA?s=2",
  email: "",
};

export const about = {
  statement:
    "你好。我喜欢那些“看起来不可能”的系统——在看不见数据时完成计算，在互不信任时玩完一局游戏，在情绪崩塌时读懂一个市场。",
  facts: [
    { label: "正在", value: "隐私计算方向的科研" },
    { label: "关注", value: "密码学 · 多方计算 · 预测市场" },
    { label: "工具", value: "TypeScript · Next.js · Postgres" },
    { label: "坐标", value: "北京 · UTC+8" },
  ],
};

export type Work = {
  index: string;
  title: string;
  subtitle: string;
  status: string;
  tags: string[];
  art: "cipher" | "table" | "market";
  href?: string;
};

export const works: Work[] = [
  {
    index: "01",
    title: "隐私计算",
    subtitle: "长期的科研方向：让数据在加密状态下依然可以被计算——全同态加密、多方计算，以及它们在真实世界里的代价与边界。",
    status: "长期",
    tags: ["Research", "FHE", "MPC"],
    art: "cipher",
  },
  {
    index: "02",
    title: "Avalon Protocol",
    subtitle: "构造一个不需要可信主持人的《阿瓦隆》：签名身份、角色种子协议与事件日志，让一局桌游在互不信任中进行。",
    status: "构造中",
    tags: ["Protocol", "MPC", "Game"],
    art: "table",
  },
  {
    index: "03",
    title: "LoL Market Journal",
    subtitle: "追踪 Polymarket 上英雄联盟赛事市场的概率路径，研究情绪崩塌与极端反转。",
    status: "研究中",
    tags: ["Data", "Behavioral finance"],
    art: "market",
  },
];

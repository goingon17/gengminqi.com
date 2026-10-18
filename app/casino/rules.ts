// Game rules. Virtual chips only — nothing here touches real money.

export type GameId = "roulette" | "dice" | "slots";

export type Option = { id: string; label: string; hint: string };

export type Game = {
  id: GameId;
  name: string;
  zh: string;
  action: string;
  options: Option[];
};

export const GAMES: Game[] = [
  {
    id: "roulette",
    name: "Roulette",
    zh: "轮盘",
    action: "Spin",
    options: [
      { id: "red", label: "红", hint: "×2" },
      { id: "black", label: "黑", hint: "×2" },
      { id: "zero", label: "0", hint: "×36" },
    ],
  },
  {
    id: "dice",
    name: "Sic Bo",
    zh: "骰宝",
    action: "Roll",
    options: [
      { id: "small", label: "小", hint: "4–10 ×2" },
      { id: "big", label: "大", hint: "11–17 ×2" },
      { id: "triple", label: "豹子", hint: "×31" },
    ],
  },
  {
    id: "slots",
    name: "Slots",
    zh: "老虎机",
    action: "Pull",
    options: [{ id: "line", label: "单线", hint: "三连 ×5–×30" }],
  },
];

export const BETS = [10, 50, 100, 500];
export const START_BALANCE = 1000;

export function randomInt(n: number) {
  // Rejection sampling for an unbiased integer in [0, n).
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / n) * n;
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % n;
}

export function random() {
  return randomInt(0x1000000) / 0x1000000;
}

// ---- Roulette (single zero) ----

export const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export const pocketColor = (n: number) => (n === 0 ? "green" : REDS.has(n) ? "red" : "black");

export function roulettePayout(option: string, n: number) {
  if (option === "zero") return n === 0 ? 36 : 0;
  return pocketColor(n) === option ? 2 : 0;
}

// ---- Sic Bo ----

export function dicePayout(option: string, faces: number[]) {
  const sum = faces.reduce((a, b) => a + b, 0);
  const triple = faces.every((f) => f === faces[0]);
  if (option === "triple") return triple ? 31 : 0;
  if (triple) return 0;
  if (option === "small") return sum <= 10 ? 2 : 0;
  return sum >= 11 ? 2 : 0;
}

// ---- Slots ----

export const SYMBOLS = ["seven", "diamond", "square", "triangle", "circle", "cross"] as const;
export type SymbolId = (typeof SYMBOLS)[number];
export const SYMBOL_PAY: Record<SymbolId, number> = { seven: 30, diamond: 15, square: 10, triangle: 8, circle: 5, cross: 2 };
// Each reel carries every symbol twice: 12 stops.
export const REEL: SymbolId[] = [...SYMBOLS, ...SYMBOLS];

export function slotsPayout(stops: number[]) {
  const s = stops.map((i) => REEL[i]);
  if (s[0] === s[1] && s[1] === s[2]) return SYMBOL_PAY[s[0]];
  if (s[0] === s[1] || s[1] === s[2] || s[0] === s[2]) return 1.5;
  return 0;
}

export function describe(game: GameId, result: number | number[]) {
  if (game === "roulette") {
    const n = result as number;
    return `${n} ${{ red: "红", black: "黑", green: "绿" }[pocketColor(n)]}`;
  }
  if (game === "dice") {
    const f = result as number[];
    return `${f.join(" · ")} = ${f.reduce((a, b) => a + b, 0)}`;
  }
  return "";
}

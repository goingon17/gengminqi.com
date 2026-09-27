import { timingSafeEqual } from "node:crypto";
import { db, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Card = { id: number; name: string; contact: string; message: string | null; created_at: string };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function authorized(request: Request) {
  const password = process.env.INBOX_PASSWORD || process.env.APP_PASSWORD;
  const header = request.headers.get("authorization") ?? "";
  if (!password || !header.startsWith("Basic ")) return false;
  const given = Buffer.from(header.slice(6), "base64").toString().split(":").slice(1).join(":");
  const a = Buffer.from(given);
  const b = Buffer.from(password);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Private list of exchanged cards, behind HTTP Basic Auth (any username).
export async function GET(request: Request) {
  if (!authorized(request)) {
    return new Response("Unauthorized", { status: 401, headers: { "www-authenticate": 'Basic realm="inbox"' } });
  }
  const sql = db();
  if (!sql) return new Response("DATABASE_URL missing", { status: 503 });
  await ensureSchema(sql);
  const cards = (await sql`SELECT id, name, contact, message, created_at FROM exchanged_cards ORDER BY created_at DESC LIMIT 500`) as Card[];
  const fmt = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium", timeStyle: "short" });
  const rows = cards
    .map(
      (c) => `<article><header><b>${esc(c.name)}</b><time>${fmt.format(new Date(c.created_at))}</time></header>
<p class="c">${esc(c.contact)}</p>${c.message ? `<p>${esc(c.message)}</p>` : ""}</article>`,
    )
    .join("");
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Inbox · ${cards.length}</title><style>
body{margin:0;padding:24px 16px 64px;background:#08080a;color:#f1efe8;font:15px/1.6 -apple-system,system-ui,sans-serif}
main{max-width:720px;margin:auto}h1{font:italic 400 40px/1 Georgia,serif;margin:0 0 24px}
article{border-top:1px solid #ffffff1f;padding:16px 0}header{display:flex;justify-content:space-between;gap:12px}
time,.c{color:#8b8980;font:13px ui-monospace,monospace}p{margin:6px 0 0;white-space:pre-wrap}</style>
<main><h1>Inbox <small>${cards.length}</small></h1>${rows || "<p>还没有人交换名片。</p>"}</main></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

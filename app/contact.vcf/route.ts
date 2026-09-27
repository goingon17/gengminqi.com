import { profile } from "../content";

export const dynamic = "force-static";

export function GET() {
  const esc = (s: string) => s.replace(/([,;\\])/g, "\\$1");
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${esc(profile.nameZh || profile.name)}`,
    `N:${esc(profile.name.split(" ")[0])};${esc(profile.name.split(" ").slice(1).join(" "))};;;`,
    profile.nameZh && `NICKNAME:${esc(profile.name)}`,
    `TITLE:${esc(profile.role)}`,
    profile.email && `EMAIL;TYPE=INTERNET:${profile.email}`,
    `URL:${profile.url}`,
    `X-SOCIALPROFILE;TYPE=wechat:${profile.wechat}`,
    `NOTE:${esc(`WeChat: ${profile.wechat} · ${profile.tagline}`)}`,
    "END:VCARD",
  ].filter(Boolean);
  return new Response(lines.join("\r\n") + "\r\n", {
    headers: {
      "content-type": "text/vcard; charset=utf-8",
      "content-disposition": `attachment; filename="${profile.name.replace(/\s+/g, "-")}.vcf"`,
    },
  });
}

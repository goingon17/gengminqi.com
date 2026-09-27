import { ImageResponse } from "next/og";
import { profile } from "./content";

export const alt = `${profile.name} — Public Key`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const holo = "linear-gradient(100deg, #ff9ec7, #ffe29a 30%, #8ff5d2 60%, #9fb4ff)";

type Font = { name: string; data: ArrayBuffer; style: "normal" | "italic" };

// Google Fonts serves TTF to non-browser clients, which is what Satori needs.
async function fonts(): Promise<Font[]> {
  const load = async (name: string, query: string) => {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${query}`)).text();
    const faces = [...css.matchAll(/font-style: (\w+);[\s\S]*?src: url\((.+?)\)/g)];
    return Promise.all(faces.map(async ([, style, url]) => ({ name, style: style as Font["style"], data: await (await fetch(url)).arrayBuffer() })));
  };
  try {
    return [...(await load("Mono", "Geist+Mono")), ...(await load("Serif", "Instrument+Serif:ital@0;1"))];
  } catch {
    return [];
  }
}

export default async function OpenGraphImage() {
  const loaded = await fonts();
  const [first, ...rest] = profile.name.split(" ");
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#08080a", color: "#f1efe8", fontFamily: "Mono" }}>
        <div
          style={{
            width: 860,
            height: 542,
            borderRadius: 34,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: 52,
            background: "linear-gradient(160deg, #1e1e23, #0d0d10)",
            border: "1px solid rgba(255,255,255,.14)",
            boxShadow: "0 60px 120px -40px rgba(0,0,0,.9)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 17, letterSpacing: 4, color: "rgba(241,239,232,.7)" }}>
            <span>PUBLIC KEY</span>
            <span>Nº 65537</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontFamily: "Serif", fontSize: 120, lineHeight: 1, letterSpacing: -2 }}>
              <span>{first}&nbsp;</span>
              <span style={{ fontStyle: "italic", backgroundImage: holo, backgroundClip: "text", color: "transparent" }}>{rest.join(" ")}</span>
            </div>
            <div style={{ marginTop: 20, fontSize: 20, letterSpacing: 3, color: "#8b8980" }}>{`${profile.role.toUpperCase()} — ${profile.taglineEn.toUpperCase()}`}</div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 20, borderTop: "1px solid rgba(241,239,232,.18)", fontSize: 18, letterSpacing: 3, color: "rgba(241,239,232,.75)" }}>
            <span>e = 65537</span>
            <span>WECHAT · {profile.wechat.toUpperCase()}</span>
            <span>{profile.site.toUpperCase()}</span>
          </div>
        </div>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 6, backgroundImage: holo }} />
      </div>
    ),
    { ...size, fonts: loaded.length ? loaded : undefined },
  );
}

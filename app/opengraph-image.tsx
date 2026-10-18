import { ImageResponse } from "next/og";

export const alt = "The Quiet Casino";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function font() {
  try {
    const css = await (await fetch("https://fonts.googleapis.com/css2?family=Geist:wght@200")).text();
    const url = css.match(/src: url\((.+?)\)/)?.[1];
    return url ? await (await fetch(url)).arrayBuffer() : null;
  } catch {
    return null;
  }
}

export default async function OpenGraphImage() {
  const data = await font();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(60% 70% at 50% 0%, #2a2620 0%, #070708 70%)",
          color: "#ebe6dc",
          fontFamily: data ? "Geist" : undefined,
        }}
      >
        <div style={{ display: "flex", width: 120, height: 120, borderRadius: 999, border: "3px solid #ebe6dc", position: "relative", marginBottom: 48 }}>
          <div style={{ position: "absolute", top: -14, left: 46, width: 22, height: 22, borderRadius: 999, background: "#b5352a" }} />
        </div>
        <div style={{ fontSize: 110, letterSpacing: -4, lineHeight: 1 }}>The Quiet Casino</div>
        <div style={{ marginTop: 28, fontSize: 26, letterSpacing: 8, color: "#7f7c75" }}>GENGMINQI.COM</div>
      </div>
    ),
    { ...size, fonts: data ? [{ name: "Geist", data, weight: 200 }] : undefined },
  );
}

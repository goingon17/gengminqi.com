import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0b0b0e" }}>
        <div
          style={{
            width: 108,
            height: 108,
            borderRadius: 999,
            padding: 12,
            display: "flex",
            background: "linear-gradient(135deg, #ff9ec7, #ffe29a 35%, #8ff5d2 65%, #9fb4ff)",
          }}
        >
          <div style={{ flex: 1, borderRadius: 999, background: "#0b0b0e", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 34, height: 34, borderRadius: 999, background: "linear-gradient(135deg, #ff9ec7, #ffe29a 35%, #8ff5d2 65%, #9fb4ff)" }} />
          </div>
        </div>
      </div>
    ),
    size,
  );
}

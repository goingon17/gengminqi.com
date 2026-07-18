import {
  experimental_upgradeWebSocket,
  type WebSocketData,
} from "@vercel/functions";
import {
  handleClientFrame,
  register,
  unregister,
} from "@/lib/relay/hub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

export function GET() {
  return experimental_upgradeWebSocket((ws) => {
    register(ws);

    ws.on("message", (data: WebSocketData) => {
      void handleClientFrame(ws, data.toString());
    });

    const close = () => {
      void unregister(ws);
    };

    ws.on("close", close);
    ws.on("error", close);
  });
}

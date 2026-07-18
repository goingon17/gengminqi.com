/// <reference lib="webworker" />

import {
  buildRoleDeal,
  privateViewForPlayer,
  type RolePrivateView,
  type RoleProtocolPlayer,
} from "@/lib/protocol/role-assignment";

type RoleWorkerRequest = {
  type: "assign";
  roomId: string;
  playerId: string;
  players: RoleProtocolPlayer[];
  seed: string;
};

type RoleWorkerResponse =
  | {
      type: "assigned";
      generatedAt: number;
      elapsedMs: number;
      jiffAvailable: boolean;
      view: RolePrivateView;
    }
  | {
      type: "error";
      message: string;
    };

declare const self: DedicatedWorkerGlobalScope & {
  JIFFClient?: unknown;
};

addEventListener("message", (event: MessageEvent<RoleWorkerRequest>) => {
  if (event.data.type !== "assign") {
    return;
  }

  void assignRoles(event.data)
    .then((response) => {
      postMessage(response);
    })
    .catch((error: unknown) => {
      postMessage({
        type: "error",
        message: error instanceof Error ? error.message : "Role worker failed.",
      } satisfies RoleWorkerResponse);
    });
});

async function assignRoles(request: RoleWorkerRequest): Promise<RoleWorkerResponse> {
  const start = performance.now();
  const jiffAvailable = await loadJiffBundle();
  const deal = buildRoleDeal(request.roomId, request.players, request.seed);
  const view = privateViewForPlayer(deal, request.playerId);

  return {
    type: "assigned",
    generatedAt: Date.now(),
    elapsedMs: performance.now() - start,
    jiffAvailable,
    view,
  };
}

async function loadJiffBundle(): Promise<boolean> {
  if (self.JIFFClient) {
    return true;
  }

  try {
    importScripts("/vendor/jiff-client.js");
    return Boolean(self.JIFFClient);
  } catch {
    return false;
  }
}

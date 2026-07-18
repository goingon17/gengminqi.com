import { beforeEach, describe, expect, it } from "vitest";
import { resetRedisForTests } from "@/lib/relay/redis";
import {
  clearLocalRoomsForTests,
  createRoom,
  ensureRoomForSocketJoin,
  getRoom,
  isSixCharacterRoomCode,
  joinRoom,
  lockRoom,
} from "@/lib/relay/rooms";

describe("Avalon relay rooms", () => {
  beforeEach(() => {
    process.env.REDIS_URL = "";
    resetRedisForTests();
    clearLocalRoomsForTests();
  });

  it("creates six-character rooms with the creator in seat one", async () => {
    const room = await createRoom({ playerId: "p1", name: "  Merlin  " });

    expect(isSixCharacterRoomCode(room.roomId)).toBe(true);
    expect(room.players).toEqual([
      expect.objectContaining({
        id: "p1",
        name: "Merlin",
        seat: 1,
        online: true,
      }),
    ]);
    expect(room.locked).toBe(false);
    expect(room.maxPlayers).toBe(10);
  });

  it("joins existing rooms and preserves stable player seats", async () => {
    const created = await createRoom({ playerId: "p1", name: "Host" });
    const joined = await joinRoom(created.roomId, { playerId: "p2", name: "Percival" });

    expect(joined.players.map((player) => [player.id, player.seat])).toEqual([
      ["p1", 1],
      ["p2", 2],
    ]);

    const rejoined = await joinRoom(created.roomId, { playerId: "p2", name: "Percy" });

    expect(rejoined.players).toHaveLength(2);
    expect(rejoined.players[1]).toEqual(expect.objectContaining({ id: "p2", name: "Percy", seat: 2 }));
  });

  it("lets websocket joins create deterministic named rooms when missing", async () => {
    const room = await ensureRoomForSocketJoin("avn-042", { playerId: "p1", name: "Mira" });
    const found = await getRoom("AVN042");

    expect(room.roomId).toBe("AVN042");
    expect(found?.players[0]).toEqual(expect.objectContaining({ id: "p1", name: "Mira" }));
  });

  it("locks rooms against new players while allowing joined players to reconnect", async () => {
    const created = await createRoom({ playerId: "p1", name: "Host" });
    const locked = await lockRoom(created.roomId, "p1");

    expect(locked.locked).toBe(true);
    await expect(joinRoom(created.roomId, { playerId: "p2", name: "Late" })).rejects.toThrow("locked");

    const rejoined = await joinRoom(created.roomId, { playerId: "p1", name: "Host again" });

    expect(rejoined.players).toHaveLength(1);
    expect(rejoined.players[0].name).toBe("Host again");
  });
});

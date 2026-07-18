import { describe, expect, it } from "vitest";
import { getRoleAlignment } from "@/lib/game";
import {
  buildRoleDeal,
  combineRoleSeed,
  privateViewForPlayer,
  roleBiasSimulation,
  roleSeedCommitment,
  verifyRoleReveal,
} from "@/lib/protocol/role-assignment";

describe("role assignment protocol", () => {
  it("deals deterministic official role sets without duplicates in player seats", () => {
    const left = buildRoleDeal("AVN042", makePlayers(7), "shared-seed");
    const right = buildRoleDeal("AVN042", makePlayers(7), "shared-seed");

    expect(left).toEqual(right);
    expect(left.assignments).toHaveLength(7);
    expect(new Set(left.assignments.map((assignment) => assignment.playerId)).size).toBe(7);
    expect(left.assignments.filter((assignment) => assignment.role === "merlin")).toHaveLength(1);
    expect(left.assignments.filter((assignment) => assignment.role === "assassin")).toHaveLength(1);
    expect(left.assignments.filter((assignment) => getRoleAlignment(assignment.role) === "good")).toHaveLength(4);
    expect(left.assignments.filter((assignment) => getRoleAlignment(assignment.role) === "evil")).toHaveLength(3);
  });

  it("builds private Merlin, evil, and loyal servant views", () => {
    const deal = buildRoleDeal("AVN042", makePlayers(7), "private-view-seed");
    const merlin = deal.assignments.find((assignment) => assignment.role === "merlin");
    const evil = deal.assignments.find((assignment) => assignment.role === "assassin");
    const loyal = deal.assignments.find((assignment) => assignment.role === "loyal-servant");

    expect(merlin).toBeDefined();
    expect(evil).toBeDefined();
    expect(loyal).toBeDefined();

    const merlinView = privateViewForPlayer(deal, merlin!.playerId);
    const evilView = privateViewForPlayer(deal, evil!.playerId);
    const loyalView = privateViewForPlayer(deal, loyal!.playerId);

    expect(merlinView.visiblePlayers.every((player) => player.alignment === "evil")).toBe(true);
    expect(evilView.visiblePlayers.every((player) => player.alignment === "evil")).toBe(true);
    expect(evilView.visiblePlayers.some((player) => player.playerId === evil!.playerId)).toBe(false);
    expect(loyalView.visiblePlayers).toEqual([]);
  });

  it("verifies commit/reveal seeds and combines only matching reveals", async () => {
    const secret = "seed-one";
    const commitment = await roleSeedCommitment("p1", secret);
    const reveal = { playerId: "p1", commitment, secret };

    await expect(verifyRoleReveal(reveal)).resolves.toBe(true);
    await expect(verifyRoleReveal({ ...reveal, secret: "seed-two" })).resolves.toBe(false);
    await expect(combineRoleSeed("AVN042", "genesis", [reveal])).resolves.toEqual(expect.any(String));
    await expect(combineRoleSeed("AVN042", "genesis", [{ ...reveal, secret: "seed-two" }])).rejects.toThrow("commitment");
  });

  it("shows no obvious Merlin seat bias over 10,000 deterministic simulations", () => {
    const counts = roleBiasSimulation(10, 10_000);
    const merlinCounts = counts.map((seat) => seat.merlin);

    for (const count of merlinCounts) {
      expect(count).toBeGreaterThan(800);
      expect(count).toBeLessThan(1_200);
    }
  });
});

function makePlayers(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    name: `Player ${index + 1}`,
    seat: index + 1,
  }));
}

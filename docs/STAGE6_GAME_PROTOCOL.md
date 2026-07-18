# Stage 6 Game Protocol

Stage 6 connects the signed relay, role protocol, and deterministic game engine into a playable Avalon v1 flow.

## What Works Now

- A room with 5-10 keyed players can derive a public game state.
- The current leader can propose a quest team.
- Every player can commit and then reveal a public team vote.
- Approved teams move to mission vote.
- Mission team members can commit and then reveal a mission vote.
- Good players are restricted by the UI to success votes.
- Evil players can choose success or fail.
- The local protocol sums revealed mission fail votes and advances the Stage 2 reducer.
- Three failed missions end with evil.
- Three successful missions enter assassination.
- The assassin can select a target and resolve the final result.
- Ended games reveal the locally known role table.
- Ended games expose a button to clear this room's local role seed and event log from IndexedDB.

## Event Types

All game protocol messages are Stage 4 signed envelopes.

- `game.team.proposed`
- `game.team_vote.commit`
- `game.team_vote.reveal`
- `game.mission_vote.commit`
- `game.mission_vote.reveal`
- `game.assassination.resolved`

Team and mission votes use:

```text
commitment = SHA256(playerId : scope : choice : salt)
```

The reveal is accepted only if it matches the previous commitment.

## Public State

`lib/protocol/game-protocol.ts` derives state from the signed event stream and calls the pure Stage 2 reducer:

- `team.proposed`
- `team.vote.resolved`
- `mission.resolved`
- `assassination.resolved`

This keeps game rules deterministic and replayable.

## Current Security Boundary

This stage is playable but still half-honest:

- team votes are commit/reveal, not encrypted private ballots;
- mission votes are commit/reveal, not final secret-shared MPC aggregation;
- role assignment currently exposes enough local material for every normal client to resolve assassination and terminal role reveal;
- malicious custom clients can still abort or lie in ways that a final active-secure MPC design would need to punish or reject.

The server still does not compute game state, choose roles, or store a plaintext role table. It relays signed envelopes.

## Verified Cases

Automated tests cover:

- three successful quests entering assassination;
- rejected teams rotating leadership;
- three failed missions ending with evil;
- invalid vote reveal rejection;
- all previous reducer, relay, signed envelope, and role assignment tests.

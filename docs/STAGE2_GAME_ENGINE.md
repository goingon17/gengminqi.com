# Stage 2 Game Engine

Stage 2 implements the deterministic public Avalon rules engine. It does not include networking, browser cryptography, role assignment, or UI wiring.

## Modules

- `lib/game/config.ts`: official 5-10 player alignment, role deck, quest team sizes, and fail thresholds.
- `lib/game/types.ts`: player, quest, proposal, vote, mission, victory, event, and state types.
- `lib/game/events.ts`: small event constructors for tests and future protocol adapters.
- `lib/game/rules.ts`: validation helpers and `GameRuleError`.
- `lib/game/reducer.ts`: pure state transition functions.

## Public State Model

The reducer intentionally does not store hidden role assignments. It only consumes public facts:

- the current leader proposed a team;
- all players revealed their public team votes;
- the mission protocol revealed a fail count;
- the assassination protocol revealed whether Merlin was hit.

This keeps the game engine compatible with the later browser-local cryptographic protocol.

## Verified Rules

- 5-10 player configurations.
- Official team sizes for all five quests.
- Official good/evil counts.
- One Merlin and one Assassin in every role deck.
- Fourth quest requires two fail cards for 7 or more players.
- Tied or minority approvals reject a team.
- Five rejected teams immediately give evil the win.
- Three failed quests immediately give evil the win.
- Three successful quests move to assassination.
- Assassin hit gives evil the win.
- Assassin miss gives good the win.
- Event streams reduce deterministically.

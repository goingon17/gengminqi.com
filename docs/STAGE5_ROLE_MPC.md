# Stage 5 Role MPC

Stage 5 adds the first browser-local role protocol. It integrates a Web Worker, loads the JIFF browser bundle when available, and gives each player a private role view without sending the final role table to Vercel.

## What Works Now

- Room players with public keys can participate in role setup.
- Each browser creates and stores a per-room random role seed in IndexedDB.
- Players publish signed `role.seed.commit` events.
- After every keyed player has committed, players publish signed `role.seed.reveal` events.
- Each browser verifies every reveal against its prior commitment.
- All verified reveals and the genesis hash are combined into a shared deterministic seed.
- A browser Worker computes the role assignment from that shared seed.
- The Worker attempts to load `/vendor/jiff-client.js` and reports whether JIFF is available.
- The room UI shows commit/reveal progress, Worker status, and a local private role card.
- Merlin privately sees evil players.
- Evil players privately see the other evil players.
- Loyal servants see no hidden identities.
- Reloading the page can rebuild the protocol from IndexedDB identity, local seed, and restored signed event log.

## Security Boundary

The server still does not receive the final role table. It only sees signed commit/reveal envelopes.

This stage is a half-honest protocol scaffold, not the final audited MPC implementation:

- players reveal random seed shares publicly after everyone commits;
- the final role assignment is independently recomputed in every browser;
- a malicious custom client can still refuse to reveal or abort the game;
- the JIFF bundle is integrated and loaded in the Worker, but the current role deal uses deterministic local computation over the jointly produced seed.

This is enough to prove the product flow and prevent a single server-side dealer. Stage 6 can build private mission-vote MPC on the same signed event and Worker foundation.

## Protocol Events

`role.seed.commit`

```json
{
  "type": "role.seed.commit",
  "commitment": "sha256(playerId:secret)",
  "name": "Mira",
  "sentAt": 1780000000000
}
```

`role.seed.reveal`

```json
{
  "type": "role.seed.reveal",
  "commitment": "same commitment",
  "secret": "browser-local random seed",
  "name": "Mira",
  "sentAt": 1780000000000
}
```

Both events are signed envelopes from Stage 4.

## Role Worker

`workers/role-mpc.worker.ts` receives:

- room id;
- local player id;
- sorted public player list;
- combined shared seed.

It returns only the local player's private view:

- self role and alignment;
- Merlin's evil-player view, if local player is Merlin;
- evil-team view, if local player is evil;
- empty hidden view for loyal servants.

## Verification

Automated tests cover:

- deterministic role dealing;
- official role counts;
- unique player seats;
- Merlin, evil, and loyal private views;
- commit/reveal validation;
- rejection of mismatched reveals;
- 10,000 deterministic simulations with no obvious Merlin seat bias.

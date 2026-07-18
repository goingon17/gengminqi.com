# Stage 3 Rooms and Relay

Stage 3 turns the prototype into a usable multiplayer lobby shell. It still does not implement cryptographic role assignment, signatures, MPC, or the full Avalon action flow.

## What Works Now

- Create a six-character room from the homepage.
- Join an existing room by code.
- Persist a browser-local `playerId` and display name in `localStorage`.
- Open `/room/[code]` directly on phone or desktop.
- Connect the room page to `/api/ws`.
- Join the WebSocket relay with room and player identity.
- Maintain room presence with heartbeat frames.
- Broadcast public test events through the relay.
- Replay recent Redis-backed envelopes after reconnect.
- Lock a room so no new players can enter.
- Fall back to in-memory room storage when `REDIS_URL` is missing locally.

## Server Responsibilities

Vercel remains a transport and room metadata server only:

- stores room code, player names, seat order, owner, lock flag, and presence timestamp;
- validates basic client frame shape and size;
- rate-limits noisy sockets;
- fans messages out to sockets in the same room;
- persists opaque envelopes to Redis streams with a six-hour TTL;
- publishes room updates across Vercel instances through a fanout stream.

The server does not know roles, secret votes, mission results, or private player views.

## API Surface

`POST /api/rooms`

Creates a room.

```json
{
  "playerId": "browser-local-id",
  "name": "Mira"
}
```

`PUT /api/rooms`

Joins an existing room.

```json
{
  "roomId": "AVN042",
  "playerId": "browser-local-id",
  "name": "Mira"
}
```

`GET /api/rooms?roomId=AVN042`

Returns public room metadata.

## WebSocket Frames

Client to server:

- `join`: enter a room.
- `heartbeat`: keep presence fresh.
- `room.lock`: lock the current room.
- `envelope`: send an opaque protocol message.
- `replay`: request recent Redis-backed envelopes.

Server to client:

- `joined`: confirms room and relay configuration.
- `room`: public room snapshot.
- `presence`: online peer list.
- `heartbeat`: relay liveness tick.
- `envelope`: forwarded opaque message.
- `replay`: recent room envelopes.
- `error`: recoverable protocol or relay error.

## Data Lifetime

Room metadata and room streams use a six-hour TTL. Local development without Redis uses an in-memory global map, so rooms disappear when the Next.js process restarts.

## UI

The new room page is deliberately minimal:

- large room code;
- copy link, reconnect, and lock controls;
- Redis/local relay status;
- live player list;
- public relay tape for smoke testing the message bus.

This gives us a real shell for Stage 4 without pretending the cryptographic game has already been built.

## Verification

Current automated checks cover:

- six-character room allocation;
- stable player seating;
- reconnection by existing players;
- locked-room rejection for new players;
- socket-created named rooms;
- heartbeat and lock frame parsing;
- envelope boundary validation.

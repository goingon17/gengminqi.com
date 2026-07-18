# Stage 1 Visual QA

Stage 1 turns the project from a technical relay probe into a high-fidelity static game prototype.

## Implemented screens

- Entry: room code, local name, and table status.
- Lobby: player readiness, room checksum words, and genesis lock action.
- Role: private Merlin reveal card and knowledge chips.
- Quest: quest track, team nomination, and public proposal status.

## Visual system

- Palette: ink black, bone, brass, oxidized teal, oxblood, muted violet, and steel blue.
- Typography: system UI body stack plus editorial serif display stack.
- Shape: 6px and 8px radii, circular table tokens only for game pieces.
- Motion: shared fast and medium timing tokens.
- Layout: mobile-first prototype frame with desktop table scene and state rail.

## Target viewport checklist

- 390 x 844: passed for Entry, Lobby, Role, and Quest.
- 430 x 932: passed for Entry, Lobby, Role, and Quest.
- 768 x 1024: passed for Entry, Lobby, Role, and Quest.
- 1440 x 900: passed for Entry, Lobby, Role, and Quest.

Checks covered page-level horizontal overflow, prototype shell visibility, title visibility, tab switching, and visible element bounds.

## Notes

- `/` is now the stage 1 visual prototype.
- `/stage0` remains the relay and browser cryptography probe.
- Vercel Hobby deployments use a 60 second WebSocket max duration, so the stage 0 client reconnects automatically.

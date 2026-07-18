# Stage 0 Runbook

This phase proves the risky parts before the real Avalon game is built.

## Current spike surface

- `/` and `/stage0` open the phase 0 browser console.
- `/api/ws` is the Vercel WebSocket relay endpoint.
- `/api/stage0/status` reports whether the relay sees `REDIS_URL`.
- Redis is used only for encrypted envelope replay and cross-instance fanout.
- The browser benchmark is a proxy for the future MPC workload; it does not claim JIFF protocol security.
- `public/vendor/jiff-client.js` is copied from `jiff-mpc` during `pnpm install`.

## Current workstation findings

- `pnpm install`, `pnpm typecheck`, `pnpm lint`, and `pnpm build` pass.
- Next.js resolved to 16.2.10, React resolved to 19.2.7, and `jiff-mpc` resolved to 1.0.0.
- `next dev` serves the stage 0 page at `http://localhost:3000`.
- `next dev` is not enough to test `/api/ws`; the local WebSocket probe receives `socket hang up`.
- Local `vercel dev` is blocked by an invalid Vercel token on this machine.
- Local Vercel CLI is 53.4.0 and should be upgraded before WebSocket testing.
- The hosted spike uses `maxDuration: 60` so it can deploy on the Vercel Hobby plan. This is enough for short relay probes, but the production game will need reconnect/resume logic or a plan/runtime that permits longer socket lifetimes.

## Local validation

1. Install dependencies with `pnpm install`.
2. Use Vercel CLI 54.14.2 or newer for WebSocket local testing.
3. Start with `pnpm dev:vercel`.
4. Open the printed local URL in two browser tabs.
5. Use the same room code in both tabs.
6. Connect both tabs, then send encrypted probes from each tab.
7. Run the browser benchmark in desktop Chrome.

Expected local result:

- Both tabs receive and decrypt probe envelopes.
- Redis shows `local only` unless `REDIS_URL` is set.
- The event tape never contains plaintext probe secrets from the server.
- The benchmark finishes without blocking the UI.

## Vercel and Redis validation

1. Link this folder to the Vercel project with `vercel link`.
2. Add Upstash Redis to the Vercel project, or set a native Redis `REDIS_URL`.
3. Pull local env only if needed with `vercel env pull .env.local`.
4. Deploy a preview build.
5. Open `/stage0` on desktop Chrome, iOS Safari, and Android Chrome.
6. Join the same room from at least two devices.
7. Send encrypted probes from each device.
8. Leave one device idle for several minutes, reconnect, and confirm replay works.
9. Inspect Vercel logs and confirm they contain metadata only, not decrypted payloads.

Expected hosted result:

- Vercel accepts WebSocket upgrades on the target account.
- Devices can exchange ciphertext envelopes through `/api/ws`.
- Redis stream replay works after reconnect.
- Room streams expire after the configured TTL.
- Browser benchmarks complete on all target browsers.

## Pass criteria

- Ten browser clients can join one room and exchange encrypted probes.
- Redis is confirmed to relay between Vercel Function instances.
- A 10-party browser benchmark completes on desktop and mobile browsers.
- No role-like plaintext or probe plaintext appears in server logs.

## Known gaps before phase 1

- The current relay does not verify signatures; that belongs to phase 4.
- The JIFF bundle load check is not the final JIFF protocol integration.
- Cross-instance behavior cannot be proven without a deployed Vercel preview and Redis.
- Vercel WebSocket APIs are still experimental, so the route may need small updates as the beta changes.

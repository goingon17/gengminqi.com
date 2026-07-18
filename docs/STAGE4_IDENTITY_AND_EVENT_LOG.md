# Stage 4 Identity, Signatures, and Event Log

Stage 4 adds browser-local identity and client-side event verification. It still does not implement MPC role assignment, private mission vote aggregation, or encrypted private role views.

## What Works Now

- Each browser creates a local player identity with:
  - a P-256 ECDSA signing key pair;
  - a P-256 ECDH encryption key pair reserved for later private messages;
  - a short public key fingerprint.
- Private keys are stored in IndexedDB and are never sent to the server.
- Room create/join requests include only public keys.
- WebSocket `join` frames include public keys for direct room-link entry.
- Public relay events are now signed envelopes.
- The relay can reject invalid signatures when it has the sender public key.
- The room client verifies every signed envelope before displaying it.
- The client tracks per-sender sequence numbers and previous hashes.
- Duplicate, missing, forked, modified, or forged signed events are rejected or trigger replay.
- Accepted envelopes are stored in IndexedDB and restored on reload.
- The room UI displays genesis checksum words and player key fingerprints.

## Cryptographic Choices

The implementation uses built-in Web Crypto P-256 keys instead of adding libsodium in this stage. This keeps the deploy small and avoids introducing another dependency before MPC integration.

This is not a final audited cryptographic design. It is a practical browser-native foundation for:

- proving that events come from the claimed browser identity;
- detecting server-side mutation;
- detecting simple replay or out-of-order event streams;
- showing a shared genesis checksum before the real game starts.

Stage 5 can still swap the key algorithms or add libsodium if the MPC layer needs it.

## Envelope Verification

The signed payload excludes `signature` and canonicalizes all other envelope fields:

```ts
{
  protocolVersion,
  roomId,
  senderId,
  recipients,
  sequence,
  previousHash,
  messageType,
  ciphertext,
  sentAt
}
```

The displayed event hash is computed over the full signed envelope, including the signature.

Each sender has an independent chain:

```text
sequence 1: previousHash = genesis
sequence 2: previousHash = hash(sequence 1)
sequence 3: previousHash = hash(sequence 2)
```

This is simpler than a single global total-order chain and fits the current relay, which may deliver messages from different senders interleaved.

## Genesis

The genesis record contains:

- room id;
- player id, name, and seat;
- signing public key;
- encryption public key;
- public key fingerprint;
- minimal v1 role config label.

The UI derives four checksum words from the genesis hash. Players can read these words aloud before locking the room. If one browser sees different words, the player list or public keys are not the same.

## Server Boundary

Vercel still does not know roles or private votes. The new server-side verification only checks public-key signatures for envelopes when the sender has registered a public key.

Legacy stage 0 messages remain possible because rooms without public keys are not forced through signature verification.

## Verified Cases

Automated tests now cover:

- valid signed envelope verification;
- tampered ciphertext rejection;
- forged sender rejection;
- deterministic envelope hashing;
- genesis digest changes when keyed player membership changes;
- existing room, relay frame, and deterministic game engine tests.

import {
  createPlayerIdentity,
  updateIdentityName,
  type PlayerIdentity,
} from "@/lib/crypto/player-identity";
import type { RelayEnvelope } from "@/lib/protocol/envelope";

export type StoredRoomEnvelope = {
  roomId: string;
  hash: string;
  envelope: RelayEnvelope;
  relay: "local" | "redis" | "replay" | "stored";
  receivedAt: number;
};

const DB_NAME = "avalon-local-protocol";
const DB_VERSION = 1;
const IDENTITY_STORE = "identities";
const EVENT_STORE = "roomEvents";

export async function loadOrCreatePlayerIdentity(playerId: string, name: string): Promise<PlayerIdentity> {
  const db = await openDatabase();
  const existing = await getFromStore<PlayerIdentity>(db, IDENTITY_STORE, playerId);

  if (existing) {
    const updated = await updateIdentityName(existing, name);
    await putIntoStore(db, IDENTITY_STORE, updated);
    return updated;
  }

  const identity = await createPlayerIdentity(playerId, name);
  await putIntoStore(db, IDENTITY_STORE, identity);
  return identity;
}

export async function appendRoomEnvelope(entry: StoredRoomEnvelope): Promise<void> {
  const db = await openDatabase();
  await putIntoStore(db, EVENT_STORE, entry);
}

export async function loadRoomEnvelopes(roomId: string): Promise<StoredRoomEnvelope[]> {
  const db = await openDatabase();
  const tx = db.transaction(EVENT_STORE, "readonly");
  const index = tx.objectStore(EVENT_STORE).index("roomId");

  return new Promise((resolve, reject) => {
    const request = index.getAll(roomId);
    request.onsuccess = () => {
      const result = request.result as StoredRoomEnvelope[];
      resolve(result.sort((left, right) => left.envelope.sentAt - right.envelope.sentAt));
    };
    request.onerror = () => reject(request.error);
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDENTITY_STORE)) {
        db.createObjectStore(IDENTITY_STORE, { keyPath: "playerId" });
      }
      if (!db.objectStoreNames.contains(EVENT_STORE)) {
        const store = db.createObjectStore(EVENT_STORE, { keyPath: "hash" });
        store.createIndex("roomId", "roomId", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getFromStore<T>(db: IDBDatabase, storeName: string, key: string): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).get(key);
    request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

function putIntoStore(db: IDBDatabase, storeName: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const request = tx.objectStore(storeName).put(value);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

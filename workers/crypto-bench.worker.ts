type BenchRequest = {
  type: "run";
  parties: number;
  rounds: number;
};

type BenchReport = {
  generatedAt: number;
  userAgent: string;
  parties: number;
  rounds: number;
  features: {
    subtleCrypto: boolean;
    indexedDb: boolean;
    worker: boolean;
  };
  sha256Ms: number;
  aesGcmMs: number;
  roleDealProxyMs: number;
  privateOutputProxyMs: number;
  secretCompareProxyMs: number;
  checksum: number;
};

addEventListener("message", (event: MessageEvent<BenchRequest>) => {
  if (event.data.type !== "run") {
    return;
  }

  runBench(event.data.parties, event.data.rounds)
    .then((report) => {
      postMessage({ type: "result", report });
    })
    .catch((error: unknown) => {
      postMessage({
        type: "error",
        message: error instanceof Error ? error.message : "Unknown benchmark failure",
      });
    });
});

async function runBench(parties: number, rounds: number): Promise<BenchReport> {
  const normalizedParties = Math.max(5, Math.min(10, Math.floor(parties)));
  const normalizedRounds = Math.max(10, Math.min(1_000, Math.floor(rounds)));

  const sha256Ms = await measureSha256();
  const aesGcmMs = await measureAesGcm();
  const roleDeal = measureRoleDealProxy(normalizedParties, normalizedRounds);
  const privateOutput = measurePrivateOutputProxy(normalizedParties, normalizedRounds);
  const secretCompare = measureSecretCompareProxy(normalizedParties, normalizedRounds);

  return {
    generatedAt: Date.now(),
    userAgent: navigator.userAgent,
    parties: normalizedParties,
    rounds: normalizedRounds,
    features: {
      subtleCrypto: Boolean(crypto.subtle),
      indexedDb: typeof indexedDB !== "undefined",
      worker: true,
    },
    sha256Ms,
    aesGcmMs,
    roleDealProxyMs: roleDeal.elapsedMs,
    privateOutputProxyMs: privateOutput.elapsedMs,
    secretCompareProxyMs: secretCompare.elapsedMs,
    checksum: roleDeal.checksum ^ privateOutput.checksum ^ secretCompare.checksum,
  };
}

async function measureSha256(): Promise<number> {
  const payload = new Uint8Array(512);
  crypto.getRandomValues(payload);

  const start = performance.now();
  for (let i = 0; i < 200; i += 1) {
    await crypto.subtle.digest("SHA-256", payload);
  }
  return performance.now() - start;
}

async function measureAesGcm(): Promise<number> {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const payload = new Uint8Array(256);
  crypto.getRandomValues(payload);

  const start = performance.now();
  for (let i = 0; i < 150; i += 1) {
    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);
    const sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, payload);
    await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, sealed);
  }
  return performance.now() - start;
}

function measureRoleDealProxy(parties: number, rounds: number) {
  const start = performance.now();
  let checksum = 0;

  for (let round = 0; round < rounds; round += 1) {
    const evilCount = parties < 7 ? 2 : parties < 10 ? 3 : 4;
    const roles = Array.from({ length: parties }, (_, index) => (index < evilCount ? 1 : 0));
    shuffle(roles);

    for (const role of roles) {
      checksum ^= reconstruct(shareSecret(role, parties));
    }
  }

  return { elapsedMs: performance.now() - start, checksum };
}

function measurePrivateOutputProxy(parties: number, rounds: number) {
  const start = performance.now();
  let checksum = 0;

  for (let round = 0; round < rounds; round += 1) {
    for (let player = 0; player < parties; player += 1) {
      const role = player % 4;
      const mask = randomMod();
      const sealed = (role + mask) % PRIME;
      checksum ^= (sealed + PRIME - mask) % PRIME;
    }
  }

  return { elapsedMs: performance.now() - start, checksum };
}

function measureSecretCompareProxy(parties: number, rounds: number) {
  const start = performance.now();
  let checksum = 0;

  for (let round = 0; round < rounds; round += 1) {
    const missionVotes = Array.from({ length: parties }, () => randomMod() % 2);
    const voteShares = missionVotes.map((vote) => shareSecret(vote, parties));
    const partyTotals = Array.from({ length: parties }, (_, party) =>
      voteShares.reduce((sum, shares) => (sum + shares[party]) % PRIME, 0),
    );
    const totalFailures = reconstruct(partyTotals);
    const failed = totalFailures >= 2 ? 1 : 0;
    checksum ^= reconstruct(shareSecret(failed, parties));
  }

  return { elapsedMs: performance.now() - start, checksum };
}

const PRIME = 65_521;

function shareSecret(secret: number, parties: number): number[] {
  const shares: number[] = [];
  let sum = 0;

  for (let i = 0; i < parties - 1; i += 1) {
    const share = randomMod();
    shares.push(share);
    sum = (sum + share) % PRIME;
  }

  shares.push((secret + PRIME - sum) % PRIME);
  return shares;
}

function reconstruct(shares: number[]): number {
  return shares.reduce((sum, share) => (sum + share) % PRIME, 0);
}

function randomMod(): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] % PRIME;
}

function shuffle(values: number[]): void {
  for (let i = values.length - 1; i > 0; i -= 1) {
    const j = randomMod() % (i + 1);
    const tmp = values[i];
    values[i] = values[j];
    values[j] = tmp;
  }
}

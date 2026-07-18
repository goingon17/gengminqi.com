export type PlayerPublicKeys = {
  signingPublicKey: JsonWebKey;
  encryptionPublicKey: JsonWebKey;
  keyFingerprint: string;
};

export function isPlayerPublicKeys(value: unknown): value is PlayerPublicKeys {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isP256PublicKey(value.signingPublicKey) &&
    isP256PublicKey(value.encryptionPublicKey) &&
    typeof value.keyFingerprint === "string" &&
    value.keyFingerprint.length >= 16 &&
    value.keyFingerprint.length <= 96
  );
}

function isP256PublicKey(value: unknown): value is JsonWebKey {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.kty === "EC" &&
    value.crv === "P-256" &&
    typeof value.x === "string" &&
    typeof value.y === "string" &&
    value.x.length > 20 &&
    value.y.length > 20
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

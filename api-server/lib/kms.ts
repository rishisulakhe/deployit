// KMS encrypt / decrypt for user GitHub tokens and project env vars.
//
// In dev, when KMS_KEY_ID is empty, we fall back to a no-op identity transform
// so the schema (BYTES column) round-trips without surfacing fake cipher text —
// do NOT use this for real secrets in any non-dev environment.

import { KMSClient, EncryptCommand, DecryptCommand } from "@aws-sdk/client-kms";
import { env } from "../env";

const client = env.AWS_ACCESS_KEY_ID
  ? new KMSClient({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
      },
    })
  : new KMSClient({ region: env.AWS_REGION });

export function isKmsConfigured(): boolean {
  return env.KMS_KEY_ID.length > 0;
}

// Copy any Buffer/Uint8Array into a fresh Uint8Array backed by a real
// ArrayBuffer (not SharedArrayBuffer). Prisma 6's `Bytes` column type expects
// `Uint8Array<ArrayBuffer>` specifically, and Node's `Buffer` is typed as
// `Buffer<ArrayBufferLike>` which doesn't satisfy that constraint.
function toUint8(b: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(b.byteLength);
  out.set(b);
  return out;
}

export async function encrypt(plaintext: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  if (!isKmsConfigured()) {
    // Dev passthrough. Prefix so decrypt can tell which mode produced the blob.
    const prefix = Buffer.from("dev:");
    const merged = Buffer.concat([prefix, Buffer.from(plaintext)]);
    return toUint8(merged);
  }
  const res = await client.send(
    new EncryptCommand({ KeyId: env.KMS_KEY_ID, Plaintext: plaintext }),
  );
  return toUint8(res.CiphertextBlob!);
}

export async function decrypt(ciphertext: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  if (!isKmsConfigured()) {
    const buf = Buffer.from(ciphertext);
    if (!buf.subarray(0, 4).equals(Buffer.from("dev:"))) {
      throw new Error("kms: ciphertext missing dev prefix in passthrough mode");
    }
    return toUint8(buf.subarray(4));
  }
  const res = await client.send(
    new DecryptCommand({ CiphertextBlob: ciphertext }),
  );
  return toUint8(res.Plaintext!);
}
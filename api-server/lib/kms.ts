// Simple passthrough "encryption" for demo purposes.
// Values are stored as base64-encoded plaintext (no actual encryption).
// NOT secure for production — do not use for real secrets.

export async function encrypt(plaintext: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const buf = Buffer.from(plaintext);
  const base64 = buf.toString("base64");
  const out = new Uint8Array(base64.length);
  for (let i = 0; i < base64.length; i++) {
    out[i] = base64.charCodeAt(i);
  }
  return out;
}

export async function decrypt(ciphertext: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const base64 = Buffer.from(ciphertext).toString("utf8");
  const decoded = Buffer.from(base64, "base64");
  const out = new Uint8Array(decoded.byteLength);
  out.set(decoded);
  return out;
}
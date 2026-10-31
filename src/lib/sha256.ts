/**
 * The SHA-256 of a file, in lowercase hex, computed in the browser. Evidence compares it with what
 * it stored and refuses the upload on a mismatch, so a file changed on the way is never sealed.
 * Above `maxBytes` the file is not read into memory and the result is null: evidence then hashes
 * on its own, and the original is still sealed under the hash it computed.
 */
export async function sha256Hex(file: Blob, maxBytes = 256 * 1024 * 1024): Promise<string | null> {
  if (file.size > maxBytes || !globalThis.crypto?.subtle) return null
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return toHex(new Uint8Array(digest))
}

export const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

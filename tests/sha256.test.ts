// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { sha256Hex, toHex } from '@/lib/sha256'

describe('the browser-side hash of an upload', () => {
  it('is the SHA-256 in lowercase hex', async () => {
    // The well-known digest of "abc" (FIPS 180-2, appendix B.1).
    expect(await sha256Hex(new Blob(['abc']))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('is skipped above the size limit, leaving evidence to hash it', async () => {
    expect(await sha256Hex(new Blob(['abcd']), 3)).toBeNull()
  })

  it('pads each byte to two digits', () => {
    expect(toHex(new Uint8Array([0, 15, 255]))).toBe('000fff')
  })
})

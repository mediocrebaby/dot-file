const qoderCustomAlphabet = "_doRTgHZBKcGVjlvpC,@aFSx#DPuNJme&i*MzLOEn)sUrthbf%Y^w.(kIQyXqWA!";
const qoderStdAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// Precomputed byte lookup so encoding is a single table read per byte instead of
// an indexOf scan over the 64-char alphabet. Bytes outside the base64 alphabet
// map to themselves; the padding byte '=' maps to '$'.
const qoderByteMap = (() => {
  const map = new Uint8Array(256);
  for (let i = 0; i < 256; i++) map[i] = i;
  for (let i = 0; i < qoderStdAlphabet.length; i++) {
    map[qoderStdAlphabet.charCodeAt(i)] = qoderCustomAlphabet.charCodeAt(i);
  }
  map[0x3d] = 0x24; // '=' -> '$'
  return map;
})();

// Bound each synchronous encoding slice so a multi-MB request body yields to the
// event loop instead of freezing TUI rendering. Bodies below this size encode in
// one pass with no yielding.
const YIELD_CHUNK = 1 << 20; // 1 MiB

export async function qoderEncodeBody(plaintext: string | Buffer): Promise<Buffer> {
  const buf = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext);
  // base64 output is pure ASCII, so a latin1 view is one byte per char.
  const std = Buffer.from(buf.toString("base64"), "latin1");
  const n = std.length;
  const a = Math.floor(n / 3);
  const out = Buffer.allocUnsafe(n);

  // Same reordering as the reference (std[n-a..n) + std[a..n-a) + std[0..a)),
  // mapped byte-wise and sliced to keep the event loop responsive.
  const segments: Array<[number, number]> = [
    [n - a, n],
    [a, n - a],
    [0, a],
  ];
  let o = 0;
  for (const [start, end] of segments) {
    for (let i = start; i < end; ) {
      const stop = Math.min(end, i + YIELD_CHUNK);
      while (i < stop) out[o++] = qoderByteMap[std[i++]];
      if (i < end) await new Promise((resolve) => setImmediate(resolve));
    }
  }
  return out;
}

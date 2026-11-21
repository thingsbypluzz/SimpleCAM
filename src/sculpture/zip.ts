// A ZIP without compression: G-code is small next to the cost of another
// dependency, and any archive tool opens a stored entry.

export interface ZipEntry {
  name: string
  content: string
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

export function buildZip(entries: ZipEntry[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder()
  const files = entries.map((entry) => {
    const name = encoder.encode(entry.name)
    const data = encoder.encode(entry.content)
    return { name, data, crc: crc32(data) }
  })
  const size =
    files.reduce((sum, f) => sum + 30 + f.name.length + f.data.length + 46 + f.name.length, 0) + 22
  const out = new Uint8Array(size)
  const view = new DataView(out.buffer)
  let at = 0
  const u16 = (v: number) => {
    view.setUint16(at, v, true)
    at += 2
  }
  const u32 = (v: number) => {
    view.setUint32(at, v, true)
    at += 4
  }
  const bytes = (b: Uint8Array) => {
    out.set(b, at)
    at += b.length
  }
  // Fields shared by a local header and its central directory record:
  // version, flags (UTF-8 names), stored, time, date (1980-01-01), then sizes.
  const common = (f: (typeof files)[number]) => {
    u16(20)
    u16(0x0800)
    u16(0)
    u16(0)
    u16(0x21)
    u32(f.crc)
    u32(f.data.length)
    u32(f.data.length)
    u16(f.name.length)
    u16(0)
  }

  const offsets: number[] = []
  for (const f of files) {
    offsets.push(at)
    u32(0x04034b50)
    common(f)
    bytes(f.name)
    bytes(f.data)
  }
  const directory = at
  files.forEach((f, i) => {
    u32(0x02014b50)
    u16(20)
    common(f)
    u16(0)
    u16(0)
    u16(0)
    u32(0)
    u32(offsets[i])
    bytes(f.name)
  })
  const directorySize = at - directory
  u32(0x06054b50)
  u16(0)
  u16(0)
  u16(files.length)
  u16(files.length)
  u32(directorySize)
  u32(directory)
  u16(0)
  return out
}

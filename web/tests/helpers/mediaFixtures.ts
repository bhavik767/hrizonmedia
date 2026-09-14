function box(type: string, payload: Buffer): Buffer {
  const header = Buffer.alloc(8)
  header.writeUInt32BE(header.length + payload.length, 0)
  header.write(type, 4, 4, 'ascii')
  return Buffer.concat([header, payload])
}

export function mp4Fixture(durationSeconds = 60, minimumBytes = 0): Buffer {
  const ftyp = box('ftyp', Buffer.from('69736f6d0000020069736f6d', 'hex'))
  const movieHeader = Buffer.alloc(100)
  movieHeader.writeUInt32BE(1_000, 12)
  movieHeader.writeUInt32BE(Math.round(durationSeconds * 1_000), 16)
  const media = Buffer.concat([ftyp, box('moov', box('mvhd', movieHeader))])
  return minimumBytes > media.length
    ? Buffer.concat([media, Buffer.alloc(minimumBytes - media.length)])
    : media
}

export function mkvFixture(durationSeconds = 60): Buffer {
  const duration = Buffer.alloc(8)
  // TimecodeScale is 1 ms, so Matroska Duration is expressed in milliseconds here.
  duration.writeDoubleBE(durationSeconds * 1_000)
  return Buffer.concat([
    Buffer.from('1a45dfa3', 'hex'),
    Buffer.from('2ad7b1830f4240', 'hex'),
    Buffer.from('448988', 'hex'),
    duration,
  ])
}

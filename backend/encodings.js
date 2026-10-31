import cenc from 'compact-encoding'

export const blobId = {
  preencode(state, b) {
    cenc.uint.preencode(state, b.blockOffset)
    cenc.uint.preencode(state, b.blockLength)
    cenc.uint.preencode(state, b.byteOffset)
    cenc.uint.preencode(state, b.byteLength)
  },
  encode(state, b) {
    cenc.uint.encode(state, b.blockOffset)
    cenc.uint.encode(state, b.blockLength)
    cenc.uint.encode(state, b.byteOffset)
    cenc.uint.encode(state, b.byteLength)
  },
  decode(state) {
    return {
      blockOffset: cenc.uint.decode(state),
      blockLength: cenc.uint.decode(state),
      byteOffset: cenc.uint.decode(state),
      byteLength: cenc.uint.decode(state)
    }
  }
}

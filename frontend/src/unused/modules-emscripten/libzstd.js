export default function getZstd (Zstd) {
  const ZstdStream = {}
  const ZSTD_e_continue = 0
  const ZSTD_e_flush = 1
  const ZSTD_e_end = 2
  ZstdStream.Zstd = Zstd

  /* ZstdStream.ZSTD_compressStream2_simpleArgs = Zstd.cxwrap('ZSTD_compressStream2_simpleArgs', 'number',
        ['number', 'number', 'number', 'number', 'array', 'number', 'number', 'number'])

    ZstdStream.ZSTD_decompressStream_simpleArgs = Zstd.cxwrap('ZSTD_decompressStream_simpleArgs', 'number',
        ['number', 'number', 'number', 'number', 'array', 'number', 'number']) */

  ZstdStream.simpleDst = Zstd._malloc(1024)
  /* ZstdStream.ZstdCompressSimple = function (arr, compressionlevel) {
        let compressedBytes = ZstdStream._ZSTD_compress(ZstdStream.simpleDst, 1024, arr, arr.length, compressionlevel)
        return new Uint8Array(Zstd.HEAPU8.buffer, ZstdStream.simpleDst, compressedBytes)
    } */

  ZstdStream.ZstdDecompressSimple = function (arr) {
    const decompressedBytes = ZstdStream._ZSTD_decompress(ZstdStream.simpleDst, 1024, arr, arr.length)
    return new Uint8Array(Zstd.HEAPU8.buffer, ZstdStream.simpleDst, decompressedBytes)
  }

  return ZstdStream
}


export default class FoxenFlacDecoder {
  constructor (jsDSP) {
    this.flac = jsDSP._fx_flac_alloc_default()
    this.jsDSP = jsDSP

    this.inbuf = jsDSP._malloc(16384)
    this.inptr = 0
    this.inarr = new Uint8Array(jsDSP.HEAPU8.buffer, this.inbuf, 16384)

    this.outbuf = jsDSP._malloc(16384 * 4)
    this.outarr = new Int32Array(jsDSP.HEAPU8.buffer, this.outbuf, 16384)

    this.inlen = jsDSP._malloc(4)
    this.outlen = jsDSP._malloc(4)
  }

  decode (buf) {
    this.inarr.set(buf, this.inptr)
    const buflen = buf.length// + this.inptr
    this.jsDSP.setValue(this.inlen, buflen, 'i32')
    this.jsDSP.setValue(this.outlen, 16384, 'i32')

    this.jsDSP._fx_flac_process(this.flac, this.inbuf, this.inlen, this.outbuf, this.outlen)
    const outlen = this.jsDSP.getValue(this.outlen, 'i32')

    const inlen = this.jsDSP.getValue(this.inlen, 'i32')
    // this.jsDSP._memcpy(this.inbuf, this.inbuf + inlen, buflen - inlen)
    this.inptr = buflen - inlen

    // console.log(ret, inlen, buflen, outlen)
    const retarr = new Int16Array(outlen)
    for (let i = 0; i < outlen; i++) {
      retarr[i] = this.outarr[i] >>> 16
    }
    return retarr
  }

  destroy () {
    this.jsDSP._free(this.flac)
  }
}

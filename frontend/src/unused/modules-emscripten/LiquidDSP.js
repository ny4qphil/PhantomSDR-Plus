
const getLiquidDSP = function (LiquidDSP) {
  const DSP = {}
  DSP.LiquidDSP = LiquidDSP
  DSP.estimate_req_filter_len = LiquidDSP.cwrap('estimate_req_filter_len', 'number', ['number', 'number'])
  DSP.liquid_firdes_kaiser = LiquidDSP.cwrap('liquid_firdes_kaiser', 'number', ['number', 'number', 'number', 'number', 'number'])

  DSP.firfilt_rrrf_create = LiquidDSP.cwrap('firfilt_rrrf_create', 'number', ['number', 'number'])
  DSP.firfilt_rrrf_execute_block = LiquidDSP.cwrap('firfilt_rrrf_execute_block', 'number', ['number', 'number', 'number', 'number'])
  DSP.firfilt_rrrf_destroy = LiquidDSP.cwrap('firfilt_rrrf_destroy', 'number', ['number'])

  DSP.resamp_rrrf_create = LiquidDSP.cwrap('resamp_rrrf_create', 'number', ['number', 'number', 'number', 'number', 'number'])

  DSP.getFloat32Array = (offset, length) => {
    return new Float32Array(new Float32Array(LiquidDSP.HEAPU8.buffer, offset, length))
  }

  DSP.FirDesKaiser = (ft, fc, As, mu) => {
    const hLen = DSP.estimate_req_filter_len(ft, As)
    const h = LiquidDSP._malloc(4 * hLen)
    DSP.liquid_firdes_kaiser(hLen, fc, As, mu, h)
    const arr = DSP.getFloat32Array(h, hLen)
    LiquidDSP._free(h)
    return arr
  }

  DSP.FirFilt = function (h) {
    this.h = LiquidDSP._malloc(h.length * 4)
    new Float32Array(LiquidDSP.HEAPU8.buffer, h, h.length).set(h)
    this.q = DSP.firfilt_rrrf_create(this.h, h.length)
    this.in = LiquidDSP._malloc(4 * 16384)
    this.inarr = new Float32Array(LiquidDSP.HEAPU8.buffer, this.in, 16384)

    this.execute = (arr) => {
      this.inarr.set(arr)
      DSP.firfilt_rrrf_execute_block(this.q, this.in, arr.length, this.in)
      arr = DSP.getFloat32Array(this.in, arr.length)
      return arr
    }

    this.destroy = () => {
      LiquidDSP._free(this.h)
      LiquidDSP._free(this.in)
      DSP.firfilt_rrrf_destroy(this.q)
    }
  }

  DSP.Resamp = function (r, m, fc, As, N) {
    this.q = LiquidDSP._resamp_rrrf_create(r, m, fc, As, N)

    this.in = LiquidDSP._malloc(4 * 16384)
    this.out = LiquidDSP._malloc(4 * 16384)
    this.inarr = new Float32Array(LiquidDSP.HEAPU8.buffer, this.in, 16384)
    this.outarr = new Float32Array(LiquidDSP.HEAPU8.buffer, this.out, 16384)
    this.outlen = LiquidDSP._malloc(4)

    this.execute = (arr) => {
      this.inarr.set(arr)
      LiquidDSP._resamp_rrrf_execute_block(this.q, this.in, arr.length, this.out, this.outlen)
      arr = DSP.getFloat32Array(this.out, LiquidDSP.getValue(this.outlen, 'i32'))
      return arr
    }

    this.destroy = () => {
      LiquidDSP._free(this.in)
      LiquidDSP._free(this.out)
      LiquidDSP._resamp_rrrf_destroy(this.q)
    }
  }

  DSP.MsResamp = function (r, As) {
    this.q = LiquidDSP._msresamp_rrrf_create(r, As)

    this.in = LiquidDSP._malloc(4 * 16384)
    this.out = LiquidDSP._malloc(4 * 16384)
    this.inarr = new Float32Array(LiquidDSP.HEAPU8.buffer, this.in, 16384)
    this.outarr = new Float32Array(LiquidDSP.HEAPU8.buffer, this.out, 16384)
    this.outlen = LiquidDSP._malloc(4)

    this.execute = (arr) => {
      this.inarr.set(arr)
      LiquidDSP._msresamp_rrrf_execute(this.q, this.in, arr.length, this.out, this.outlen)
      arr = DSP.getFloat32Array(this.out, LiquidDSP.getValue(this.outlen, 'i32'))
      return arr
    }

    this.destroy = () => {
      LiquidDSP._free(this.in)
      LiquidDSP._free(this.out)
      LiquidDSP._msresamp_rrrf_destroy(this.q)
    }
  }

  DSP.AGC = function () {
    this.q = LiquidDSP._agc_rrrf_create()

    this.in = LiquidDSP._malloc(4 * 16384)
    this.inarr = new Float32Array(LiquidDSP.HEAPU8.buffer, this.in, 16384)

    this.execute = (arr) => {
      this.inarr.set(arr)
      LiquidDSP._agc_rrrf_execute_block(this.q, this.in, arr.length, this.in)
      arr = DSP.getFloat32Array(this.in, arr.length)
      return arr
    }

    this.destroy = () => {
      LiquidDSP._free(this.in)
      LiquidDSP._agc_rrrf_destroy(this.q)
    }
  }

  DSP.WBFMStereo = function (fs) {
    this.wbfm = new LiquidDSP.WBFMStereo(fs)
    this.in = LiquidDSP._malloc(4 * 16384)
    this.outl = LiquidDSP._malloc(4 * 16384)
    this.outr = LiquidDSP._malloc(4 * 16384)
    this.inarr = new Float32Array(LiquidDSP.HEAPU8.buffer, this.in, 16384)
    this.outlarr = new Float32Array(LiquidDSP.HEAPU8.buffer, this.outl, 16384)
    this.outrarr = new Float32Array(LiquidDSP.HEAPU8.buffer, this.outr, 16384)

    this.execute = (arr) => {
      this.inarr.set(arr)
      this.wbfm.execute(this.in, arr.length, this.outl, this.outr)
      return [DSP.getFloat32Array(this.outl, arr.length), DSP.getFloat32Array(this.outr, arr.length)]
    }

    this.destroy = () => {
      this.wbfm.destroy()
    }
  }
  return DSP
}

export default getLiquidDSP

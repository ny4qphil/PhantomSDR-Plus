import { ZSTDDecoder } from 'zstddec'
import * as fzstd from 'fzstd'

import getLiquidDSP from '../modules-emscripten/LiquidDSP'
import jsDSPModule from '../modules-emscripten/jsDSP'

import FoxenFlacDecoder from '../modules-emscripten/FoxenFlac'

import jsDSPWasm from '../modules/jsDSP.wasm?url'
import jsDSPMem from '../modules/jsDSPnoWasm.js.mem?url'

import init, { Audio, WaterfallDecoder, firdes_kaiser_lowpass } from '../modules/phantomsdrdsp.js'

// https://stackoverflow.com/questions/47879864/how-can-i-check-if-a-browser-supports-webassembly
const hasWasm = (() => {
  try {
    if (typeof WebAssembly === 'object' &&
            typeof WebAssembly.instantiate === 'function') {
      const module = new WebAssembly.Module(Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00))
      if (module instanceof WebAssembly.Module) { return new WebAssembly.Instance(module) instanceof WebAssembly.Instance }
    }
  } catch (e) {
  }
  return false
})()

if (!window.crypto) {
  window.crypto = window.msCrypto
}

export let jsDSP
export let LiquidDSP
export let ZSTDSimpleDecode

export function createFlacDecoder (codec_rate, input_rate, output_rate) {
  return new Audio(0, codec_rate, input_rate, output_rate)
}

export function createOpusDecoder (samplerate) {
  const decoder = new OpusWasmDecoder(samplerate)
  return decoder
}

export { firdes_kaiser_lowpass }

class OpusWasmDecoder {
  constructor (samplerate) {
    this.err = jsDSP._malloc(4)
    this.opusout = jsDSP._malloc(2048)
    this.opusin = jsDSP._malloc(2048)
    this.opusinarr = new Uint8Array(jsDSP.HEAPU8.buffer, this.opusin, 2048)
    this.opusoutarr = new Uint16Array(jsDSP.HEAPU8.buffer, this.opusout, 2048 / 2)
    this.decoder = jsDSP._opus_decoder_create(samplerate, 1, this.err)
    this.first = true
  }

  decode (array) {
    this.opusinarr.set(array)
    const decoded = jsDSP._opus_decode(this.decoder, this.opusin, array.length, this.opusout, 16384, 0)
    return new Int16Array(this.opusoutarr.slice(0, decoded))
  }

  destroy () {
    jsDSP._free(this.err)
    jsDSP._free(this.opusin)
    jsDSP._free(this.opusout)
    jsDSP._opus_decoder_destroy(this.decoder)
  }
}

const zstdPromise = (function zstdInit () {
  if (hasWasm) {
    const decoder = new ZSTDDecoder()
    return decoder.init().then(() => {
      ZSTDSimpleDecode = (ZSTDEncoded) => {
        return decoder.decode(ZSTDEncoded)
      }
    })
  } else {
    ZSTDSimpleDecode = (ZSTDEncoded) => {
      return fzstd.decompress(ZSTDEncoded)
    }
    return Promise.resolve(fzstd)
  }
})()

const jsDSPOptions = {
  locateFile (path, prefix) {
    // if it's a mem init file, use a custom dir
    if (path.endsWith('.mem')) return jsDSPMem
    if (path.endsWith('.wasm')) return jsDSPWasm
    // otherwise, use the default, the prefix (JS file's dir) + the path
    return prefix + path
  }
}

const jsDSPPromise = (function initjsDSP () {
  if (hasWasm) {
    return jsDSPModule(jsDSPOptions).then((jsDSPModule) => {
      jsDSP = jsDSPModule
      LiquidDSP = getLiquidDSP(jsDSPModule)
      return LiquidDSP
    })
  } else {
    window.Atomics = window.Atomics || {
      add (typedArray, index, value) {
        const val = typedArray[index]
        typedArray[index] += value
        return val
      },
      and (typedArray, index, value) {
        const val = typedArray[index]
        typedArray[index] &= value
        return val
      },
      exchange (typedArray, index, value) {
        const val = typedArray[index]
        typedArray[index] = value
        return val
      },
      load (typedArray, index) {
        return typedArray[index]
      },
      or (typedArray, index, value) {
        const val = typedArray[index]
        typedArray[index] |= value
        return val
      },
      store (typedArray, index, value) {
        typedArray[index] = value
        return value
      },
      sub (typedArray, index, value) {
        const val = typedArray[index]
        typedArray[index] -= value
        return val
      },
      xor (typedArray, index, value) {
        const val = typedArray[index]
        typedArray[index] ^= value
        return val
      }
    }
    return import('../modules-emscripten/jsDSPnoWasm').then((jsDSP) => {
      return jsDSP.default(jsDSPOptions)
    }).then(jsDSPModule => {
      jsDSP = jsDSPModule
      LiquidDSP = getLiquidDSP(jsDSPModule)
      return LiquidDSP
    })
  }
})()

async function liquidDSPResampCreateJS (fromSamplerate, toSampleRate, channels) {
  const bw = Math.min(fromSamplerate / toSampleRate * 0.49, 0.49)
  const resampler = new LiquidDSP.Resamp(toSampleRate / fromSamplerate, 10, bw, 60, 32)
  resampler.resample = resampler.execute
  return resampler
}

async function liquidDSPMsResampCreateJS (fromSamplerate, toSampleRate, channels) {
  const resampler = new LiquidDSP.MsResamp(toSampleRate / fromSamplerate, 60)
  resampler.resample = resampler.execute
  return resampler
}

export class ZstdWaterfallDecoder {
  constructor () {
    this.decoder = new WaterfallDecoder()
  }
}

export class AV1WaterfallDecoder {
  constructor () {
    this.dav1d = new jsDSP.Dav1dDecoder()
  }

  decode (array) {
    const decoded = this.dav1d.dav1d_decode(new Uint8Array(array))
    this.dav1d.dav1d_picture_free()

    if (typeof decoded === 'string') {
      console.log(decoded)
      return []
    }

    const waterfallArr = []
    const metadata = new Uint32Array(ZSTDSimpleDecode(decoded.itut_t35).slice(0).buffer)
    for (let i = 0; i < decoded.height; i++) {
      const arr = new Int8Array(metadata[i * 4 + 2])
      const stride = decoded.stride[0]
      for (let j = 0; j < arr.length; j++) {
        arr[j] = decoded.plane[0][stride * i + j] ^ 0x80
      }
      waterfallArr.push([arr, metadata[i * 4 + 0], metadata[i * 4 + 1]])
    }
    return waterfallArr
  }
}
export default async function initWrappers () {
  return Promise.all([zstdPromise, jsDSPPromise, init()])
}

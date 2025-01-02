
import jsDSPModule from '../modules-emscripten/jsDSP'
import jsDSPWasm from '../modules-emscripten/jsDSP.wasm?url'

import redsea from '../modules-emscripten/redsea'
import decodeFT8 from '../modules-emscripten/decode_ft8'
import redseaWasm from '../modules-emscripten/redsea.wasm?url'
import decodeFT8Wasm from '../modules-emscripten/decode_ft8.wasm?url'
import getLiquidDSP from '../modules-emscripten/LiquidDSP'

const jsDSPOptions = {
  locateFile (path, prefix) {
    if (path.endsWith('.wasm')) return jsDSPWasm
    // otherwise, use the default, the prefix (JS file's dir) + the path
    return prefix + path
  }
}

async function liquidDSPPromise () {
  return getLiquidDSP(await jsDSPModule(jsDSPOptions))
}

function logger (text) {
  postMessage({ type: 'log', text: text })
}
function initialized () {
  postMessage({ type: 'initialized' })
}
let processPCM
onmessage = (ev) => {
  if (ev.data.msg === 'pcm') {
    processPCM(ev.data.pcm)
  } else if (ev.data.msg === 'init') {
    if (ev.data.decoder === 'rds') {
      redsea({ print: logger, locateFile (path, prefix) { return redseaWasm } }).then((redsea) => {
        redsea.__ZN6redsea13initMPXReaderEiPPcf(0, 0, ev.data.samplerate)
        const redseafloatin = redsea._malloc(4 * 16384)
        const redseafloatinarr = new Float32Array(redsea.HEAPU8.buffer, redseafloatin, 16384)
        const redseadecode = redsea.__ZN6redsea7readMPXEPfi
        processPCM = (pcm) => {
          redseafloatinarr.set(pcm)
          redseadecode(redseafloatin, pcm.length)
        }
        logger('redsea RDS decoder initialized')
        initialized()
      })
    } else if (ev.data.decoder === 'ft8') {
      Promise.all([
        decodeFT8({ print: logger, printErr: logger, locateFile (path, prefix) { return decodeFT8Wasm } }),
        liquidDSPPromise()
      ]).then(([decodeFT8, LiquidDSP]) => {
        const resampler = new LiquidDSP.MsResamp(12000 / ev.data.samplerate, 60)

        const signal = decodeFT8._malloc(15 * 12000 * 2 * 4)
        const signalarr = new Float32Array(decodeFT8.HEAPU8.buffer, signal, 15 * 12000 * 2)
        let curoffset = 0
        processPCM = (pcm) => {
          pcm = resampler.execute(pcm)
          signalarr.set(pcm, curoffset)
          curoffset += pcm.length
        }

        const decodeInterval = () => {
          decodeFT8._decode_ft8(0, 0, signal, 1)
          const extra = curoffset - 15 * 12000
          if (extra > 0) {
            signalarr.set(signalarr.slice(15 * 12000, curoffset))
            curoffset = Math.min(extra, 120)
          }

          const now = new Date().getTime()
          const delay = (15 * 1000) - now % (15 * 1000)
          setTimeout(decodeInterval, delay)
        }

        const now = new Date().getTime()
        const delay = (15 * 1000) - now % (15 * 1000)
        setTimeout(decodeInterval, delay)

        logger('ft8_lib FT8 decoder initialized')
        initialized()
      })
    }
  }
}

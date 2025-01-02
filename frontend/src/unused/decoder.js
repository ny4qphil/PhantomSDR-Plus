import decoder from './decoding.js?worker'

import '../modules-emscripten/redsea.wasm?url'
import '../modules-emscripten/decode_ft8.wasm?url'

export default class Decoder {
  constructor (name, samplerate, callback) {
    this.decoder = new decoder()
    this.decoder.postMessage({ msg: 'init', decoder: name, samplerate: samplerate })
    this.callback = callback
    this.initializedPromise = new Promise((resolve, reject) => {
      this.initializedResolve = resolve
      this.initializedReject = reject
    })

    this.decoder.onmessage = (ev) => {
      if (ev.data.type === 'log') {
        callback(ev.data.text)
      } else if (ev.data.type === 'initialized') {
        this.initializedResolve()
      }
    }
  }

  setCallback (callback) {
    this.callback = callback
  }

  decode (pcm) {
    this.decoder.postMessage({ msg: 'pcm', pcm: pcm }, pcm.buffer)
  }

  promise () {
    return this.initializedPromise
  }

  stop () {
    this.decoder.terminate()
  }
}

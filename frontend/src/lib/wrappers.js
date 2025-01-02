import * as fzstd from 'fzstd'
import { Audio, AudioCodec, ZstdStreamDecoder, firdes_kaiser_lowpass, __wbg_set_wasm } from '../modules/phantomsdrdsp_bg.js'
import { RollingAvg } from 'efficient-rolling-stats'
import { decode as cbor_decode } from 'cbor-x';
import Denque from 'denque'


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

export function createDecoder(audioCodec, codecRate, inputRate, outputRate) {
  switch (audioCodec) {
    case 'flac':
      return new Audio(AudioCodec.Flac, codecRate, inputRate, outputRate)
    case 'opus':
      return new Audio(AudioCodec.Opus, codecRate, inputRate, outputRate)
  }
}

export { firdes_kaiser_lowpass }

/*window.Atomics = window.Atomics || {
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
}*/


function decodePacket(packet) {
  packet = cbor_decode(packet)
  packet.data = new Int8Array(packet.data)
  return packet
}

export class ZstdWaterfallDecoder {
  constructor() {
    this.decoder = new ZstdStreamDecoder()
  }
  decode(packet) {
    packet = new Uint8Array(packet)
    return this.decoder.decode(packet).map(decodePacket)
  }
  destroy() {
    this.decoder.free()
  }
}

export function createWaterfallDecoder(format) {
  switch (format) {
    case 'zstd':
      return new ZstdWaterfallDecoder()
    case 'av1':
      return new ZstdWaterfallDecoder()
  }
}

export default async function initWrappers() {
  let wasm;
  if (hasWasm) {
    wasm = await import("../modules/phantomsdrdsp_bg.wasm");
  } else {
    wasm = await import("../modules/phantomsdrdsp_bg_fallback.js");
  }
  __wbg_set_wasm(wasm);
  wasm.__wbindgen_start();
}

export class RollingVariance {
  constructor(windowSize) {
    this.avg = RollingAvg(windowSize);
    this.avgsq = RollingAvg(windowSize);
    this.windowSize = windowSize;
    this.average = 0;
 }

 add(value) {
    let avg = this.avg(value);
    let avgsq = this.avgsq(value * value);
    this.average = avg;
    return (avgsq - avg * avg) * this.windowSize / (this.windowSize - 1);
 }

 getavg() {
    return this.average;
 }
}

export class JitterBuffer {
  constructor(timePerPacket, verbose = false) {
    this.buffer = new Denque(1000 / timePerPacket);
    this.timePerPacket = timePerPacket;
    this.lastReceived = 0;
    this.verbose = verbose;

    // Average over 10 seconds
    this.variance = new RollingVariance(10000 / timePerPacket);
  }

  get length() {
    return this.buffer.length;
  }

  add(packet, delay) {
    let queueLength = this.buffer.unshift(packet);
    let variance = this.variance.add(delay);
    let packetAmount = Math.ceil(variance * 2 / this.timePerPacket);
    // Clamp to 2, 10
    packetAmount = 2;
    if (queueLength > packetAmount) {
      console.log('pop some off', packetAmount, queueLength)
    }
    for (let i = packetAmount; i < queueLength; i++) {
      this.buffer.pop();
    }
    this.var = variance;

    if (this.verbose) {
      console.log('JitterBuffer: delay', delay, 'variance', variance, 'packetAmount', packetAmount, 'queueLength', queueLength)
    }
  }

  unshift(packet) {
    let delay = performance.now() - this.lastReceived;
    if (delay > 2000) {
      // If we receive a packet after a long delay, assume not a network event
      delay = 100;
    }
    this.lastReceived = performance.now();

    this.add(packet, delay);
  }

  unshiftMultiple(packets) {
    let delay = (performance.now() - this.lastReceived) / packets.length;
    this.lastReceived = performance.now();

    for (let packet of packets) {
      this.add(packet, delay);
    }
  }

  pop() {
    return this.buffer.pop();
  }

  clear() {
    this.buffer.clear();
  }

  getvar() {
    return this.var;
  }
  getavg() {
    return this.variance.getavg();
  }
}
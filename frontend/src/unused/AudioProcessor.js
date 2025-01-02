//import { jsDSP } from '../lib/wrappers'

function getNoiseProcessors (jsDSP) {
  const wdsp_anr_create = jsDSP.cwrap('wdsp_anr_create', 'number', ['number', 'number', 'number', 'number', 'number'])
  const wdsp_anr_destroy = jsDSP.cwrap('wdsp_anr_destroy', 'void', ['number'])

  class WdspANR {
    constructor (nr_type, taps, dly, gain, leakage) {
      this.nr_type = nr_type
      this.wdsp_anr = wdsp_anr_create(nr_type, taps, dly, gain, leakage)
      this.fptr = jsDSP._malloc(16384 * 4)
      this.farr = new Float32Array(jsDSP.HEAPU8.buffer, this.fptr, 16384)
    }

    filter (arr) {
      this.farr.set(arr)
      jsDSP._wdsp_anr_filter(this.wdsp_anr, this.nr_type, arr.length, this.fptr, this.fptr)
      arr.set(this.farr.subarray(0, arr.length))
      return arr
    }

    destroy () {
      jsDSP._free(this.fptr)
      wdsp_anr_destroy(this.wdsp_anr)
    }
  }

  const wild_nb_init = jsDSP.cwrap('wild_nb_init', 'number', ['number', 'number', 'number'])
  const wild_nb_destroy = jsDSP.cwrap('wild_nb_destroy', 'void', ['number'])

  class WildNB {
    constructor (thresh, taps, samples) {
      this.wild_nb = wild_nb_init(thresh, taps, samples)
      this.fptr = jsDSP._malloc(16384 * 4)
      this.farr = new Float32Array(jsDSP.HEAPU8.buffer, this.fptr, 16384)
    }

    filter (arr) {
      this.farr.set(arr)
      jsDSP._wild_nb_blank(this.wild_nb, arr.length, this.fptr)
      arr.set(this.farr.subarray(0, arr.length))
      return arr
    }

    destroy () {
      jsDSP._free(this.fptr)
      wild_nb_destroy(this.wild_nb)
    }
  }

  const nr_spectral_init = jsDSP.cwrap('nr_spectral_init', 'number', ['number', 'number', 'number', 'number'])
  const nr_spectral_destroy = jsDSP.cwrap('wild_nb_destroy', 'void', ['number'])

  class SpectralNR {
    constructor (snd_rate, gain, alpha, asnr) {
      this.spectral_nr = nr_spectral_init(snd_rate, gain, alpha, asnr)
      this.fptr = jsDSP._malloc(16384 * 4)
      this.farr = new Float32Array(jsDSP.HEAPU8.buffer, this.fptr, 16384)
    }

    filter (arr) {
      this.farr.set(arr)
      jsDSP._nr_spectral_process(this.spectral_nr, arr.length, this.fptr, this.fptr)
      arr.set(this.farr.subarray(0, arr.length))
      return arr
    }

    destroy () {
      jsDSP._free(this.fptr)
      nr_spectral_destroy(this.spectral_nr)
    }
  }

  const noise = {}

  noise.WdspANR = WdspANR
  noise.WildNB = WildNB
  noise.SpectralNR = SpectralNR

  return noise
}

export default class AudioProcessor {
  constructor () {
    this.NoiseProcessors = getNoiseProcessors(jsDSP)
    this.nrobj = new this.NoiseProcessors.WdspANR(1, 64, 32, 1.024e-4, 1.28e-1)
    this.anobj = new this.NoiseProcessors.WdspANR(0, 64, 32, 1.024e-4, 1.28e-1)
    this.nbobj = new this.NoiseProcessors.WildNB(0.95, 10, 7)
    // this.nrobj = new this.NoiseProcessors.SpectralNR(12000, 1, 0.95, 1000)

    this.nr = false
    this.an = false
    this.nb = false
  }

  process (arr) {
    if (this.nr) arr = this.nrobj.filter(arr)
    if (this.nb) arr = this.nbobj.filter(arr)
    if (this.an) arr = this.anobj.filter(arr)
    return arr
  }

  setNR (nr) {
    this.nr = nr
  }

  setNB (nb) {
    this.nb = nb
  }

  setAN (an) {
    this.an = an
  }
}

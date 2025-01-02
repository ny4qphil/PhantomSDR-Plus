import SpectrumAudio from '../audio'
import SpectrumWaterfall from '../waterfall'
import SpectrumEvents from '../events'
import initWrappers from './wrappers'

import { nanoid } from 'nanoid'
let settings

const location = window.location
const baseUri = `${location.protocol.replace('http', 'ws')}//${location.host}`
export const waterfall = new SpectrumWaterfall(baseUri + '/waterfall')
export const audio = new SpectrumAudio(baseUri + '/audio')
export const events = new SpectrumEvents(baseUri + '/events')

export async function init () {
  await initWrappers()
  await Promise.all([waterfall.init(), audio.init(), events.init()])
  settings = audio.settings
  const id = nanoid();
  [waterfall, audio, events].forEach((s) => {
    s.setUserID(id)
  })
}

export function frequencyToWaterfallOffset (frequency) {
  const [waterfallL, waterfallR] = waterfall.getWaterfallRange()
  const frequencyOffset = (frequency - FFTOffsetToFrequency(waterfallL))
  return frequencyOffset / (((waterfallR - waterfallL) / settings.fft_result_size) * settings.total_bandwidth)
}
export function waterfallOffsetToFrequency (offset) {
  const [waterfallL, waterfallR] = waterfall.getWaterfallRange()
  const frequencyOffset = offset * ((waterfallR - waterfallL) / settings.fft_result_size) * settings.total_bandwidth
  return frequencyOffset + FFTOffsetToFrequency(waterfallL)
}
export function frequencyToFFTOffset (frequency) {
  const offset = (frequency - settings.basefreq) / settings.total_bandwidth
  return offset * settings.fft_result_size
}
export function FFTOffsetToFrequency (offset) {
  const frequency = offset / settings.fft_result_size * settings.total_bandwidth
  return frequency + settings.basefreq
}
export function bandwidthToWaterfallOffset (bandwidth) {
  const [waterfallL, waterfallR] = waterfall.getWaterfallRange()
  return bandwidth / settings.total_bandwidth * settings.fft_result_size / (waterfallR - waterfallL)
}
export function getMaximumBandwidth () {
  return audio.trueAudioSps
}

export function getFFTOffsetView () {
  return waterfall.getWaterfallRange()
}
export function getFrequencyView () {
  return waterfall.getWaterfallRange().map(FFTOffsetToFrequency)
}

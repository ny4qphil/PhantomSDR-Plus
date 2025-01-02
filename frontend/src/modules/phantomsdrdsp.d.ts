/* tslint:disable */
/* eslint-disable */
/**
*/
export function greet(): void;
/**
*/
export function main(): void;
/**
* @param {number} cutoff
* @param {number} transition_bw
* @param {number} max_ripple
* @returns {Float32Array}
*/
export function firdes_kaiser_lowpass(cutoff: number, transition_bw: number, max_ripple: number): Float32Array;
/**
*/
export enum AudioCodec {
  Flac = 0,
  Opus = 1,
}
/**
*/
export class Audio {
  free(): void;
/**
* @param {AudioCodec} codec
* @param {number} _codec_rate
* @param {number} input_rate
* @param {number} output_rate
*/
  constructor(codec: AudioCodec, _codec_rate: number, input_rate: number, output_rate: number);
/**
* @param {Uint8Array} input
* @returns {Float32Array}
*/
  decode(input: Uint8Array): Float32Array;
/**
* @param {boolean} nr
*/
  set_nr(nr: boolean): void;
/**
* @param {boolean} nb
*/
  set_nb(nb: boolean): void;
/**
* @param {boolean} an
*/
  set_an(an: boolean): void;
/**
* @param {Function | undefined} [f]
*/
  set_decoded_callback(f?: Function): void;
}
/**
*/
export class FoxenFlacDecoder {
  free(): void;
/**
* @returns {FoxenFlacDecoder}
*/
  static new(): FoxenFlacDecoder;
}
/**
*/
export class ZstdStreamDecoder {
  free(): void;
/**
*/
  constructor();
/**
*/
  clear(): void;
/**
* @param {Uint8Array} input
* @returns {(Uint8Array)[]}
*/
  decode(input: Uint8Array): (Uint8Array)[];
}

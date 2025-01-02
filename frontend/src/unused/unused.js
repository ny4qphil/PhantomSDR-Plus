
/*
import { Decoder as FlacDecoder } from 'libflacjs/src/decoder';
let FlacWasm
let FlacJS

import libflacWasm from 'libflacjs/dist/libflac.min.wasm.wasm?url'
import libflacMem from 'libflacjs/dist/libflac.min.js.mem?url'

const scriptLocations = {
    'libflac.min.wasm.wasm': libflacWasm,
    'libflac.min.js.mem': libflacMem
}

    //return new libflacDecoder(FlacWasm)
class libflacDecoder {
    constructor(flacObj) {
        this.decoder = new FlacDecoder(flacObj, {
            verify: false, // boolean (OPTIONAL)
            isOgg: false // boolean (OPTIONAL), if FLAC audio is wrapped in OGG container
        });
    }
    decode(encodedChunk) {
        this.decoder.decodeChunk(encodedChunk);
        let samples = this.decoder.getSamples(false)[0]
        this.decoder.rawData.splice(0)
        return samples
    }
}

const flacPromise = (new Promise((resolve, reject) => {

    window["FLAC_SCRIPT_LOCATION"] = scriptLocations

    if (hasWasm) {
        import('libflacjs/dist/libflac.min.wasm.js').then((Flac) => {
            FlacWasm = Flac
            FlacWasm.on('ready', resolve)
            FlacWasm.on('error', reject)
            createFlacDecoder = createWasmFlacDecoder
        })
    } else {
        import('libflacjs/dist/libflac.min.js').then((Flac) => {
            FlacJS = Flac
            FlacJS.on('ready', resolve)
            FlacJS.on('error', reject)
            createFlacDecoder = createJSFlacDecoder
        })
    }
})).then((Flac) => {
    return Flac
}) */

/*
import { create, ConverterType } from "@alexanderolsen/libsamplerate-js";
import libsamplerateWasm from '@alexanderolsen/libsamplerate-js/dist/libsamplerate.wasm?url'
function libsamplerateCreateWasm(fromSamplerate, toSampleRate, channels) {
    if (fromSamplerate > 192000) {
        fromSamplerate = 192000
        toSampleRate = toSampleRate * 192000 / fromSamplerate
    }
    return create(channels, fromSamplerate, toSampleRate, {
        converterType: ConverterType.SRC_SINC_FASTEST,
        wasmPath: libsamplerateWasm,
    }).then((src) => {
        const resampler = src
        resampler['resample'] = resampler.full
        return resampler
    });
} */

/*
// Shift the spectrogram down by 1 pixel
this.ctx.drawImage(this.canvasElem, 0, 0, this.canvasWidth, 1000, 0, 1, this.canvasWidth, 1000)

// Draw the new line
//let colorarr = new Uint8ClampedArray(arr.length * 4)
let colorarr = this.ctx.createImageData(arr.length, 1)
for (let i = 0; i < arr.length; i++) {
    colorarr.data.set(this.colormap[arr[i]], i * 4)
}
//this.tempCtx.putImageData(new ImageData(colorarr, arr.length), 0, 0)
this.tempCtx.putImageData(colorarr, 0, 0)
// Resize the line into the correct width
this.ctx.drawImage(this.tempCanvasElem, 0, 0, arr.length, 1, pxL, 0, pxR - pxL, 1) */

// AGC in case noise processing changes volume
/* let scale = Math.sqrt(receivedPower) / Math.sqrt(processedPower)
pcmArray = pcmArray.map(x => x * scale) */
/*

import wasm_avif from '@saschazar/wasm-avif'
import wasm_avif_file from '@saschazar/wasm-avif/wasm_avif.wasm?url'

let avifModule
const avifPromise = wasm_avif({
  locateFile (path, prefix) {
    if (path.endsWith('.wasm')) return wasm_avif_file
    // otherwise, use the default, the prefix (JS file's dir) + the path
    return prefix + path
  }
}).then((avif) => {
  avifModule = avif
})

class AvifEncoder : public WaterfallEncoder {
  public:
    AvifEncoder(websocketpp::connection_hdl hdl, server *m_server, int waterfall_size);
    int send(const void *buffer, size_t bytes, unsigned current_frame, int l,
             int r);
    ~AvifEncoder();

  protected:
    avifImage* image;
    uint32_t header_multi_u32[1 + 3 * 10];
    int line;
};

export function waterfallAvifDecoder (array) {
  const compressedArray = new Uint8Array(array).subarray(4 + 12 * 10)
  const header = new Uint32Array(array.slice(0, 4 + 12 * 10))
  const alpha = false // return RGBA buffer, instead of RGB
  const result = avifModule.decode(compressedArray, compressedArray.length, alpha) // decode image data and return a new Uint8Array
  const width = result.length / 3 / 10
  const waterfall = []
  for (let i = 0; i < 10; i++) {
    const line = []
    for (let j = 0; j < header[1 + i * 3 + 2]; j++) {
      line.push(result[i * width * 3 + j * 3] ^ 0x80)
    }
    waterfall.push([new Int8Array(line), header[1 + i * 3 + 0], header[1 + i * 3 + 1]])
  }
  return waterfall
}

AvifEncoder::AvifEncoder(websocketpp::connection_hdl hdl, server *m_server,
                         int waterfall_size)
    : WaterfallEncoder(hdl, m_server), line{0} {
    image = avifImageCreate(waterfall_size, 10, 8, AVIF_PIXEL_FORMAT_YUV400);
    avifImageAllocatePlanes(image, AVIF_PLANES_YUV);
}

int AvifEncoder::send(const void *buffer, size_t bytes, unsigned current_frame,
                      int l, int r) {
    uint8_t *image_arr = image->yuvPlanes[AVIF_CHAN_Y] + line * image->width;
    uint8_t *buffer_arr = (uint8_t *)buffer;
    for (size_t i = 0; i < bytes; i++) {
        image_arr[i] = buffer_arr[i] ^ 0x80;
    }
    if (line == 0) {
        header_multi_u32[0] = current_frame;
    }
    header_multi_u32[1 + line * 3 + 0] = l;
    header_multi_u32[1 + line * 3 + 1] = r;
    header_multi_u32[1 + line * 3 + 2] = bytes;
    line++;
    if (line == 10) {
        avifEncoder *encoder = avifEncoderCreate();
        // encoder->codecChoice = AVIF_CODEC_CHOICE_RAV1E;
        encoder->speed = AVIF_SPEED_FASTEST;
        encoder->maxQuantizer = 32;
        avifEncoderAddImage(encoder, image, 1, AVIF_ADD_IMAGE_FLAG_SINGLE);
        avifEncoderFinish(encoder, &avifOutput);

        memcpy(packet.data(), header_multi_u32, sizeof(header_multi_u32));
        memcpy(packet.data() + sizeof(header_multi_u32), avifOutput.data,
               avifOutput.size);

        send_packet(sizeof(header_multi_u32) + avifOutput.size);
        line = 0;
    }
    return 0;
}
AvifEncoder::~AvifEncoder() { avifImageDestroy(image); }
*/

/* const frequencyHintLeft = 0
const frequencyHintTop = 0
const frequencyHint = 0
const frequencyHintActive = false
let frequencyHintTimeout
function handleWaterfallMouseMove (e) {
    frequencyHintActive = true
frequencyHintLeft = e.clientX + 5
frequencyHintTop = e.clientY + 5
frequencyHint = (waterfallOffsetToFrequency(passbandTunerComponent.getOffsetFromEvent(e)) / Math.pow(10, 6)).toFixed(6)
frequencyHint += " MHz"

if (frequencyHintTimeout === undefined) {
    clearTimeout(frequencyHintTimeout)
}
frequencyHintTimeout = setTimeout(() => {
    frequencyHintActive            = false
}, 2000)
} */

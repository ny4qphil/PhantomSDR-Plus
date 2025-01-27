import getColormap, { computeColormapArray } from './lib/colormaps.js'
import { JitterBuffer, createWaterfallDecoder } from './lib/wrappers.js'
import Denque from 'denque'
import 'core-js/actual/set-immediate'
import 'core-js/actual/clear-immediate'
import { eventBus } from './eventBus';
// Added to fix an error when printing the waterfall during the handleBandChange //
// function in App.svelte //
import { siteRegion } from '../site_information.json';

export default class SpectrumWaterfall {
  constructor(endpoint, settings) {

    this.markers = [];
    this.currentBand = null;

    this.endpoint = endpoint

    this.zoomFactor = 1

    this.autoAdjust = false;
    this.adjustmentBuffer = []; // Buffer to accumulate data for adjustment
    this.bufferSize = 50; // Number of data points to accumulate before adjusting
    this.dampeningFactor = 0.1; // Factor to smooth adjustments (0 for instant, 1 for no change)

    this.spectrum = false
    this.waterfall = false

    this.frequencyMarkerComponent = null; // Reference to the Svelte component
    this.pendingMarkers = []; // Store markers temporarily

    this.waterfallQueue = new Denque(10)
    this.drawnWaterfallQueue = new Denque(4096)
    this.lagTime = 0
    this.spectrumAlpha = 0.5
    this.spectrumFiltered = [[-1, -1], [0]]

    this.waterfallColourShift = 130
    this.minWaterfall = -30
    this.maxWaterfall = 110
    // https://gist.github.com/mikhailov-work/ee72ba4191942acecc03fe6da94fc73f
    this.colormap = []

    this.setColormap('gqrx')

    this.clients = {}
    this.clientColormap = computeColormapArray(getColormap('rainbow'))

    this.updateTimeout = setTimeout(() => { }, 0)

    this.lineResets = 0

    this.wfheight = 200 * window.devicePixelRatio

    const MODES = {
      AM: 'AM',
      FM: 'FM',
      LSB: 'LSB',
      USB: 'USB',
      CW: 'CW-U',
      DIGITAL: 'DIGITAL'
    };

    this.bands = [
      {
        ITU: 123,
            name: 'VLF', min: -40, max: 120, publishBand: true, amateurBand: false, startFreq: 3000, endFreq: 30000, stepi: 1000, color: 'rgba(199, 12, 193, 0.6)',
        modes: [{ mode: MODES.CW, startFreq: 3000, endFreq: 30000 }]
      },
      {
        ITU: 123,
        name: 'LF', min: -40, max: 120, publishBand: true, amateurBand: false, startFreq: 30000, endFreq: 300000, stepi: 1000, color: 'rgba(199, 12, 193, 0.6)',
        modes: [{ mode: MODES.CW, startFreq: 30000, endFreq: 300000 }]
      },
      {
        ITU: 123,
        name: 'LW', min: -40, max: 120, publishBand: true, amateurBand: false, startFreq: 148500, endFreq: 283500, stepi: 1000, color: 'rgba(199, 12, 193, 0.6)',
        modes: [{ mode: MODES.AM, startFreq: 148500, endFreq: 283500 }]
      },
      {
        ITU: 123,
        name: '2200m', min: -40, max: 120, publishBand: true, amateurBand: true, startFreq: 135700, endFreq: 137800, stepi: 1000, color: 'rgba(50, 168, 72, 0.6)',
        modes: [
          { mode: MODES.CW, startFreq: 135700, endFreq: 137800 },
          { mode: MODES.USB, startFreq: 135700, endFreq: 137800 }]
      },
      {
        ITU: 123,
        name: '630m', min: -40, max: 120, publishBand: true, amateurBand: true, startFreq: 472000, endFreq: 479000, stepi: 1000, color: 'rgba(50, 168, 72, 0.6)',
        modes: [
          { mode: MODES.CW, startFreq: 472000, endFreq: 475000 },
          { mode: MODES.USB, startFreq: 475000, endFreq: 479000 }]
      },
      {
        ITU: 1,
        name: 'MW', min: -40, max: 120, publishBand: true, amateurBand: false, startFreq: 530000, endFreq: 1700000, stepi: 9000, color: 'rgba(199, 12, 193, 0.6)',
        modes: [{ mode: MODES.AM, startFreq: 530000, endFreq: 1700000 }]
      },
      {
        ITU: 2,
        name: 'MW', min: -40, max: 120, publishBand: true, amateurBand: false, startFreq: 530000, endFreq: 1700000, stepi: 10000, color: 'rgba(199, 12, 193, 0.6)',
        modes: [{ mode: MODES.AM, startFreq: 530000, endFreq: 1700000 }]
      },
      {
        ITU: 3,
        name: 'MW', min: -40, max: 120, publishBand: true, amateurBand: false, startFreq: 530000, endFreq: 1700000, stepi: 9000, color: 'rgba(199, 12, 193, 0.6)',
        modes: [{ mode: MODES.AM, startFreq: 530000, endFreq: 1700000 }]
      },
      {
        ITU: 123,
        name: 'NAV', min: -40, max: 120, publishBand: true, amateurBand: false, startFreq: 1700000, endFreq: 1800000, stepi: 1000, color: '#ffffff00',
        modes: [{ mode: MODES.AM, startFreq: 1700000, endFreq: 1800000 }]
      },
      {
        ITU: 123,
        name: '160m', min: -40, max: 120, publishBand: true, amateurBand: true, startFreq: 1800000, endFreq: 2000000, stepi: 1000, color: 'rgba(50, 168, 72, 0.6)',
        modes: [
          { mode: MODES.CW, startFreq: 1800000, endFreq: 1840000 },
          { mode: MODES.LSB, startFreq: 1840000, endFreq: 2000000 }]
      },
      {
        ITU: 123,
        name: 'MM', min: -40, max: 120, publishBand: true, amateurBand: false, startFreq: 2000000, endFreq: 3500000, stepi: 1000, color: '#ffffff00',
        modes: [{ mode: MODES.AM, startFreq: 2000000, endFreq: 3500000 }]
      },
      {
        ITU: 1,
        name: '80m', min: -40, max: 120, publishBand: true, amateurBand: true, startFreq: 3500000, endFreq: 3800000, stepi: 1000, color: 'rgba(50, 168, 72, 0.6)',
        modes: [
          { mode: MODES.CW, startFreq: 3500000, endFreq: 3600000 },
          { mode: MODES.LSB, startFreq: 3600000, endFreq: 3800000 }]
      },
      {
        ITU: 2,
        name: '80m', min: -40, max: 120, publishBand: true, amateurBand: true, startFreq: 3500000, endFreq: 4000000, stepi: 1000, color: 'rgba(50, 168, 72, 0.6)',
        modes: [
          { mode: MODES.CW, startFreq: 3500000, endFreq: 3600000 },
          { mode: MODES.LSB, startFreq: 3600000, endFreq: 4000000 }]
      },
      {
        ITU: 3,
        name: '80m', min: -40, max: 120, publishBand: true, amateurBand: true, startFreq: 3500000, endFreq: 3900000, stepi: 1000, color: 'rgba(50, 168, 72, 0.6)',
        modes: [
          { mode: MODES.CW, startFreq: 3500000, endFreq: 3600000 },
          { mode: MODES.LSB, startFreq: 3600000, endFreq: 3900000 }]
      },
      {
        ITU: 1,
        name: '60m', min: -40, max: 120, publishBand: true, amateurBand: true, startFreq: 5351500, endFreq: 5366650, stepi: 1000, color: 'rgba(50, 168, 72, 0.6)',
        modes: [
          { mode: MODES.CW, startFreq: 5351500, endFreq: 5354000 },
          { mode: MODES.USB, startFreq: 5354000, endFreq: 5366500 }]
      },
      {
        ITU: 2,
        name: '60m', min: -40, max: 120, publishBand: true, amateurBand: true, startFreq: 5330500, endFreq: 5406500, stepi: 1000, color: 'rgba(50, 168, 72, 0.6)',
        modes: [{ mode: MODES.USB, startFreq: 5330500, endFreq: 5406500 }]
      },
      {
        ITU: 3,
        name: '60m', min: -40, max: 120, publishBand: true, amateurBand: true, startFreq: 5351500, endFreq: 5366650, stepi: 1000, color: 'rgba(50, 168, 72, 0.6)',
        modes: [
          { mode: MODES.CW, startFreq: 5351500, endFreq: 5354000 },
          { mode: MODES.USB, startFreq: 5354000, endFreq: 5366500 }]
      },
      {
        ITU: 123,
        name: '49m AM', min: -40, max: 120, publishBand: true, amateurBand: false, startFreq: 5900000, endFreq: 6200000, stepi: 1000, color: 'rgba(199, 12, 193, 0.6)',
        modes: [{ mode: MODES.AM, startFreq: 5900000, endFreq: 6200000 }]
      },
      {
        ITU: 1,
        name: '40m', min: -40, max: 120, publishBand: true, amateurBand: true, startFreq: 7000000, endFreq: 7200000, stepi: 1000, color: 'rgba(50, 168, 72, 0.6)',
        modes: [
          { mode: MODES.CW, startFreq: 7000000, endFreq: 7040000 },
          { mode: MODES.LSB, startFreq: 7040000, endFreq: 7200000 }]
      },
      {
        ITU: 2,
        name: '40m', min: -40, max: 120, publishBand: true, amateurBand: true, startFreq: 7000000, endFreq: 7300000, stepi: 1000, color: 'rgba(50, 168, 72, 0.6)',
        modes: [
          { mode: MODES.CW, startFreq: 7000000, endFreq: 7050000 },
          { mode: MODES.LSB, startFreq: 7050000, endFreq: 7300000 }]
      },
      {
        ITU: 3,
        name: '40m', min: -40, max: 120, publishBand: true, amateurBand: true, startFreq: 7000000, endFreq: 7200000, stepi: 1000, color: 'rgba(50, 168, 72, 0.6)',
        modes: [
          { mode: MODES.CW, startFreq: 7000000, endFreq: 7040000 },
          { mode: MODES.LSB, startFreq: 7040000, endFreq: 7200000 }]
      },
      {
        ITU: 1,
        name: '41m AM', min: -40, max: 120, publishBand: true, amateurBand: false, startFreq: 7200000, endFreq: 7450000, stepi: 1000, color: 'rgba(199, 12, 193, 0.6)',
        modes: [{ mode: MODES.AM, startFreq: 7200000, endFreq: 7450000 }]
      },
      {
        ITU: 2,
        name: '41m AM', min: -40, max: 120, publishBand: true, amateurBand: false, startFreq: 7300000, endFreq: 7450000, stepi: 1000, color: 'rgba(199, 12, 193, 0.6)',
        modes: [{ mode: MODES.AM, startFreq: 7300000, endFreq: 7450000 }]
      },
      {
        ITU: 3,
        name: '41m AM', min: -40, max: 120, publishBand: true, amateurBand: false, startFreq: 7200000, endFreq: 7450000, stepi: 1000, color: 'rgba(199, 12, 193, 0.6)',
        modes: [{ mode: MODES.AM, startFreq: 7200000, endFreq: 7450000 }]
      },
      {
        ITU: 123,
        name: '31m AM', min: -40, max: 120, publishBand: true, amateurBand: false, startFreq: 9400000, endFreq: 9900000, stepi: 1000, color: 'rgba(199, 12, 193, 0.6)',
        modes: [{ mode: MODES.AM, startFreq: 9400000, endFreq: 9900000 }]
      },
      {
        ITU: 123,
        name: '30m', min: -40, max: 120, publishBand: true, amateurBand: true, startFreq: 10100000, endFreq: 10150000, stepi: 1000, color: 'rgba(50, 168, 72, 0.6)',
        modes: [{ mode: MODES.CW, startFreq: 10100000, endFreq: 10150000 }]
      },
      {
        ITU: 123,
        name: '25m AM', min: -40, max: 120, publishBand: true, amateurBand: false, startFreq: 11600000, endFreq: 12200000, stepi: 1000, color: 'rgba(199, 12, 193, 0.6)',
        modes: [{ mode: MODES.AM, startFreq: 11600000, endFreq: 12200000 }]
      },
      {
        ITU: 123,
        name: '22m AM', min: -40, max: 120, publishBand: true, amateurBand: false, startFreq: 13570000, endFreq: 13870000, stepi: 1000, color: 'rgba(199, 12, 193, 0.6)',
        modes: [{ mode: MODES.AM, startFreq: 13570000, endFreq: 13870000 }]
      },
      {
        ITU: 123,
        name: '20m', min: -40, max: 120, publishBand: true, amateurBand: true, startFreq: 14000000, endFreq: 14350000, stepi: 1000, color: 'rgba(50, 168, 72, 0.6)',
        modes: [
          { mode: MODES.CW, startFreq: 14000000, endFreq: 14070000 },
          { mode: MODES.USB, startFreq: 14070000, endFreq: 14350000 }]
      },
      {
        ITU: 123,
        name: '19m AM', min: -40, max: 120, publishBand: true, amateurBand: false, startFreq: 15100000, endFreq: 15830000, stepi: 1000, color: 'rgba(199, 12, 193, 0.6)',
        modes: [{ mode: MODES.AM, startFreq: 15100000, endFreq: 15830000 }]
      },
      {
        ITU: 123,
        name: '16m AM', min: -40, max: 120, publishBand: true, amateurBand: false, startFreq: 17480000, endFreq: 17900000, stepi: 1000, color: 'rgba(199, 12, 193, 0.6)',
        modes: [{ mode: MODES.AM, startFreq: 17480000, endFreq: 17900000 }]
      },
      {
        ITU: 123,
        name: '17m', min: -40, max: 120, publishBand: true, amateurBand: true, startFreq: 18068000, endFreq: 18168000, stepi: 1000, color: 'rgba(50, 168, 72, 0.6)',
        modes: [
          { mode: MODES.CW, startFreq: 18068000, endFreq: 18100000 },
          { mode: MODES.USB, startFreq: 18100000, endFreq: 18168000 }]
      },
      {
        ITU: 123,
        name: '15m AM', min: -40, max: 120, publishBand: rue, amateurBand: false, startFreq: 18900000, endFreq: 19020000, stepi: 1000, color: 'rgba(199, 12, 193, 0.6)',
        modes: [{ mode: MODES.AM, startFreq: 18900000, endFreq: 19020000 }]
      },
      {
        ITU: 123,
        name: '15m', min: -40, max: 120, publishBand: true, amateurBand: true, startFreq: 21000000, endFreq: 21450000, stepi: 1000, color: 'rgba(50, 168, 72, 0.6)',
        modes: [
          { mode: MODES.CW, startFreq: 21000000, endFreq: 21070000 },
          { mode: MODES.USB, startFreq: 21070000, endFreq: 21450000 }]
      },
      {
        ITU: 123,
        name: '13m AM', min: -40, max: 120, publishBand: true, amateurBand: false, startFreq: 21450000, endFreq: 21850000, stepi: 1000, color: 'rgba(199, 12, 193, 0.6)',
        modes: [{ mode: MODES.AM, startFreq: 21450000, endFreq: 21850000 }]
      },
      {
        ITU: 123,
        name: '12m', min: -40, max: 120, publishBand: true, amateurBand: true, startFreq: 24890000, endFreq: 24990000, stepi: 1000, color: 'rgba(50, 168, 72, 0.6)',
        modes: [
          { mode: MODES.CW, startFreq: 24890000, endFreq: 24920000 },
          { mode: MODES.USB, startFreq: 24920000, endFreq: 24990000 }]
      },
      {
        ITU: 123,
        name: '11m AM', min: -40, max: 120, publishBand: true, amateurBand: false, startFreq: 25600000, endFreq: 26100000, stepi: 1000, color: 'rgba(199, 12, 193, 0.6)',
        modes: [{ mode: MODES.AM, startFreq: 25600000, endFreq: 26100000 }]
      },
      {
        ITU: 1,
        name: 'CB', min: -40, max: 120, publishBand: true, amateurBand: false, startFreq: 26965000, endFreq: 27405000, stepi: 1000, color: 'rgba(3, 227, 252, 0.6)',
        modes: [
          { mode: MODES.AM, startFreq: 26965000, endFreq: 27300000 },
          { mode: MODES.USB, startFreq: 27305000, endFreq: 27405000 }
        ]
      },
      {
        ITU: 2,
        name: 'CB', min: -40, max: 120, publishBand: true, amateurBand: false, startFreq: 26965000, endFreq: 27405000, stepi: 1000, color: 'rgba(3, 227, 252, 0.6)',
        modes: [
          { mode: MODES.AM, startFreq: 26965000, endFreq: 27300000 },
          { mode: MODES.USB, startFreq: 27305000, endFreq: 27405000 }
        ]
      },
      {
        ITU: 123,
        name: '11m SSB', min: -40, max: 120, publishBand: true, amateurBand: false, startFreq: 27405000, endFreq: 28000000, stepi: 1000, color: 'rgba(199, 12, 193, 0.6)',
        modes: [{ mode: MODES.USB, startFreq: 27405000, endFreq: 28000000 }]
      },
      {
        ITU: 123,
        name: '10m', min: -40, max: 120, publishBand: true, amateurBand: true, startFreq: 28000000, endFreq: 29700000, stepi: 1000, color: 'rgba(50, 168, 72, 0.6)',
        modes: [
          { mode: MODES.CW, startFreq: 28000000, endFreq: 28070000 },
          { mode: MODES.USB, startFreq: 28070000, endFreq: 29700000 }]
      },
      {
        ITU: 123,
        name: '6m', min: -40, max: 120, publishBand: true, amateurBand: true, startFreq: 50000000, endFreq: 54000000, stepi: 1000, color: 'rgba(50, 168, 72, 0.6)',
        modes: [
          { mode: MODES.CW, startFreq: 50000000, endFreq: 50100000 },
          { mode: MODES.USB, startFreq: 50100000, endFreq: 54000000 },
          { mode: MODES.FM, startFreq: 51110000, endFreq: 54000000 }]
      },
      {
        ITU: 1,
        name: '4m', min: -40, max: 120, publishBand: true, amateurBand: true, startFreq: 69950000, endFreq: 69950000, stepi: 1000, color: 'rgba(50, 168, 72, 0.6)',
        modes: [{ mode: MODES.FM, startFreq: 69950000, endFreq: 69950000 }]
      },
      {
        ITU: 1,
        name: '2m', min: -40, max: 120, publishBand: true, amateurBand: true, startFreq: 144000000, endFreq: 146000000, stepi: 25000, color: 'rgba(50, 168, 72, 0.6)',
        modes: [
          { mode: MODES.CW, startFreq: 144000000, endFreq: 144150000 },
          { mode: MODES.USB, startFreq: 144150000, endFreq: 144930000 },
          { mode: MODES.FM, startFreq: 144975000, endFreq: 148000000 }]
      },
      {
        ITU: 2,
        name: '2m', min: -40, max: 120, publishBand: true, amateurBand: true, startFreq: 144000000, endFreq: 148000000, stepi: 25000, color: 'rgba(50, 168, 72, 0.6)',
        modes: [
          { mode: MODES.CW, startFreq: 144000000, endFreq: 144100000 },
          { mode: MODES.USB, startFreq: 144100000, endFreq: 144300000 },
          { mode: MODES.FM, startFreq: 144300000, endFreq: 148000000 }]
      },
      {
        ITU: 2,
        name: '1.25m', min: -40, max: 120, publishBand: true, amateurBand: true, startFreq: 220000000, endFreq: 225000000, stepi: 25000, color: 'rgba(50, 168, 72, 0.6)',
        modes: [
          { mode: MODES.CW, startFreq: 222000000, endFreq: 222250000 },
          { mode: MODES.USB, startFreq: 222070000, endFreq: 222250000 },
          { mode: MODES.FM, startFreq: 222250000, endFreq: 225000000 }]
      },
      {
        ITU: 2,
        name: '70cm', min: -40, max: 120, publishBand: true, amateurBand: true, startFreq: 430000000, endFreq: 440000000, stepi: 25000, color: 'rgba(50, 168, 72, 0.6)',
        modes: [
          { mode: MODES.CW, startFreq: 430000000, endFreq: 430100000 },
          { mode: MODES.USB, startFreq: 430100000, endFreq: 432100000 },
          { mode: MODES.FM, startFreq: 432100000, endFreq: 440000000 }]
      },
    ];
  }


  addMarker(frequency, name, mode) {
    this.markers.push({ frequency, name, mode });
    this.markers.sort((a, b) => a.frequency - b.frequency);
  }


  initCanvas(settings) {
    this.canvasElem = settings.canvasElem
    this.ctx = this.canvasElem.getContext('2d')
    this.ctx.imagesmoothingEnabled = false
    //this.ctx.imageSmoothingQuality = "high"
    this.canvasWidth = this.canvasElem.width
    this.canvasHeight = this.canvasElem.height
    this.backgroundColor = window.getComputedStyle(document.body, null).getPropertyValue('background-color')

    this.curLine = this.canvasHeight / 2

    this.ctx.fillRect(0, 0, this.canvasElem.width, this.canvasElem.height)

    this.graduationCanvasElem = settings.graduationCanvasElem
    this.graduationCtx = this.graduationCanvasElem.getContext('2d')

    this.bandPlanCanvasElem = settings.bandPlanCanvasElem
    this.bandPlanCtx = this.bandPlanCanvasElem.getContext('2d')

    this.spectrumCanvasElem = settings.spectrumCanvasElem
    this.spectrumCtx = this.spectrumCanvasElem.getContext('2d')

    this.spectrumCanvasElem.addEventListener('mousemove', this.spectrumMouseMove.bind(this))
    this.spectrumCanvasElem.addEventListener('mouseleave', this.spectrumMouseLeave.bind(this))

    this.tempCanvasElem = settings.tempCanvasElem
    this.tempCtx = this.tempCanvasElem.getContext('2d')
    this.tempCanvasElem.height = this.wfheight

    this.waterfall = true

    this.mobile = false

    let resizeTimeout;
    this.resizeCallback = () => {

      this.setCanvasWidth()

      // Create a new canvas and copy over new canvas
      let resizeCanvas = document.createElement('canvas')
      resizeCanvas.width = this.canvasElem.width
      resizeCanvas.height = this.canvasElem.height
      let resizeCtx = resizeCanvas.getContext('2d')
      resizeCtx.imagesmoothingEnabled = false;
      resizeCtx.drawImage(this.canvasElem, 0, 0)


      this.curLine = Math.ceil(this.curLine * this.canvasElem.height / resizeCanvas.height)
      // Copy resizeCanvas to new canvas with scaling
      this.ctx.imagesmoothingEnabled = false;
      this.ctx.drawImage(resizeCanvas, 0, 0, resizeCanvas.width, resizeCanvas.height, 0, 0, this.canvasElem.width, this.canvasElem.height)
      this.updateGraduation()
      this.updateBandPlan()
      //this.redrawWaterfall()
      resizeTimeout = undefined
    }
    window.addEventListener('resize', () => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout)
      }
      //this.resizeCallback()
      //resizeTimeout = setTimeout(this.resizeCallback, 250)
    })
  }

  async init() {
    if (this.promise) {
      return this.promise
    }

    this.waterfallSocket = new WebSocket(this.endpoint)
    this.waterfallSocket.binaryType = 'arraybuffer'
    this.firstWaterfallMessage = true
    this.waterfallSocket.onmessage = this.socketMessageInitial.bind(this)

    this.promise = new Promise((resolve, reject) => {
      this.resolvePromise = resolve
      this.rejectPromise = reject
    })

    return this.promise
  }

  stop() {
    this.waterfallSocket.close()
  }

  setCanvasWidth() {
    const dpr = window.devicePixelRatio;
    const screenWidth = window.innerWidth;

    let canvasWidth = screenWidth > 1372 ? 1372 : screenWidth;
    canvasWidth *= dpr;
    if (canvasWidth != 1372) {
      this.mobile = true;
    }


    this.canvasElem.width = canvasWidth;
    this.canvasScale = canvasWidth / 1372;

    // Aspect ratio is 1372 to 128px
    this.spectrumCanvasElem.width = canvasWidth;
    this.spectrumCanvasElem.height = (canvasWidth / 1372) * 128;

    // Aspect ratio is 1372 to 20px
    this.graduationCanvasElem.width = canvasWidth;
    this.graduationCanvasElem.height = (canvasWidth / 1372) * 30;

    // Aspect ratio is 1372 to 20px
    this.bandPlanCanvasElem.width = canvasWidth;
    this.bandPlanCanvasElem.height = (canvasWidth / 1372) * 40;

    this.canvasElem.height = this.wfheight;
    this.canvasWidth = canvasWidth;
    this.canvasHeight = this.canvasElem.height;

    // Create a new canvas that will be used as a buffer
    this.bufferCanvas = document.createElement('canvas');
    this.bufferCanvas.width = this.canvasWidth;
    this.bufferCanvas.height = this.canvasHeight;
    this.bufferContext = this.bufferCanvas.getContext('2d', { alpha: false });

  }

  setFrequencyMarkerComponent(component) {
    this.frequencyMarkerComponent = component;
    this.addMarkersToComponent();
  }

  addMarkersToComponent() {
    if (this.frequencyMarkerComponent && this.pendingMarkers.length > 0) {
      this.frequencyMarkerComponent.insertAll(this.pendingMarkers);
      this.frequencyMarkerComponent.finalizeList();
      this.pendingMarkers = []; // Clear pending markers
    }
  }

  socketMessageInitial(event) {
    // First message gives the parameters in json
    if (!(event.data instanceof ArrayBuffer)) {
      const settings = JSON.parse(event.data)
      if (!settings.fft_size) {
        return
      }

      // Handle markers
      if (settings.markers) {
        try {
          const markersData = JSON.parse(settings.markers);
          if (markersData.markers && Array.isArray(markersData.markers)) {
            this.pendingMarkers = markersData.markers.map(marker => ({
              f: marker.frequency,
              d: marker.name,
              m: marker.mode
            }));
            this.addMarkersToComponent();
          }
        } catch (error) {
          console.error("Error parsing markers:", error);
        }
      }
      this.waterfallMaxSize = settings.fft_result_size
      this.fftSize = settings.fft_size
      this.baseFreq = settings.basefreq
      this.sps = settings.sps
      this.totalBandwidth = settings.total_bandwidth
      this.overlap = settings.overlap

      this.setCanvasWidth()
      this.tempCanvasElem.width = settings.waterfall_size


      this.ctx.fillRect(0, 0, this.canvasElem.width, this.canvasElem.height)

      const skipNum = Math.max(1, Math.floor((this.sps / this.fftSize) / 5.0) * 2)
      const waterfallFPS = (this.sps / this.fftSize) / (skipNum / 2)
      //this.waterfallQueue = new JitterBuffer(1000 / waterfallFPS)

      console.log('Waterfall FPS: ' + waterfallFPS)

      requestAnimationFrame(this.drawSpectrogram.bind(this));

      this.waterfallL = 0
      this.waterfallR = this.waterfallMaxSize
      this.waterfallSocket.onmessage = this.socketMessage.bind(this)
      this.firstWaterfallMessage = false

      this.waterfallDecoder = createWaterfallDecoder(settings.waterfall_compression)
      this.updateGraduation()
      this.updateBandPlan()
      this.resolvePromise(settings)

      //eventBus.publish('frequencyChange', { detail: 1e6 });
    }
  }

  socketMessage(event) {
    if (event.data instanceof ArrayBuffer) {
      this.enqueueSpectrogram(event.data)
    }
  }

  getMouseX(canvas, evt) {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width

    return (evt.clientX - rect.left) * scaleX
  }

  enqueueSpectrogram(array) {

    // Decode and extract header
    this.waterfallDecoder.decode(array).forEach((waterfallArray) => {
      this.waterfallQueue.unshift(waterfallArray)
    })

    // Do draw if not requested
    if (!this.waterfall && !this.spectrum) {
      this.waterfallQueue.clear()
      return
    }

    while (this.waterfallQueue.length > 2) {
      this.waterfallQueue.pop()
    }
  }

  accumulateAdjustmentData(waterfallArray) {
    // Add the current data to the buffer
    this.adjustmentBuffer.push(...waterfallArray);
    // Check if the buffer is full
    if (this.adjustmentBuffer.length >= this.bufferSize) {
      // Adjust limits based on the buffered data
      this.adjustWaterfallLimits(this.adjustmentBuffer);
      // Clear the buffer for next accumulation
      this.adjustmentBuffer = [];
    }
  }

  adjustWaterfallLimits(bufferedData) {
    const minValue = Math.min(...bufferedData) - 20;
    const maxValue = Math.max(...bufferedData) - 20;
    // Apply dampening factor to smooth adjustments
    this.minWaterfall += (minValue - this.minWaterfall) * this.dampeningFactor;
    this.maxWaterfall += (maxValue - this.maxWaterfall) * this.dampeningFactor;
  }

  transformValue(value) {
    // Clamp value between minValue and maxValue
    let clampedValue = Math.max(this.minWaterfall, Math.min(this.maxWaterfall, value));

    // Normalize to 0-1 based on min and max settings
    let normalizedValue = (clampedValue - this.minWaterfall) / (this.maxWaterfall - this.minWaterfall);

    // Scale normalized value to colormap range (0-255)
    let colormapIndex = Math.floor(normalizedValue * 255);

    // Ensure index is within the bounds of the colormap array
    return Math.max(0, Math.min(255, colormapIndex));
  }


  // Helper functions

  idxToFreq(idx) {
    return idx / this.waterfallMaxSize * this.totalBandwidth + this.baseFreq
  }

  idxToCanvasX(idx) {
    return (idx - this.waterfallL) / (this.waterfallR - this.waterfallL) * this.canvasWidth
  }

  canvasXtoFreq(x) {
    const idx = x / this.canvasWidth * (this.waterfallR - this.waterfallL) + this.waterfallL
    return this.idxToFreq(idx)
  }

  freqToIdx(freq) {
    return (freq - this.baseFreq) / (this.totalBandwidth) * this.waterfallMaxSize
  }

  // Drawing functions
  calculateOffsets(waterfallArray, curL, curR) {
    // Correct for zooming or shifting
    const pxPerIdx = this.canvasWidth / (this.waterfallR - this.waterfallL)
    const pxL = (curL - this.waterfallL) * pxPerIdx
    const pxR = (curR - this.waterfallL) * pxPerIdx

    const arr = new Uint8Array(waterfallArray.length)
    for (let i = 0; i < arr.length; i++) {
      arr[i] = this.transformValue(waterfallArray[i])
    }
    return [arr, pxL, pxR]
  }

  drawSpectrogram() {
    const draw = () => {
      if (this.waterfallQueue.length === 0) {
        requestAnimationFrame(draw);
        return;
      }

      const { data: waterfallArray, l: curL, r: curR } = this.waterfallQueue.pop();
      const [arr, pxL, pxR] = this.calculateOffsets(waterfallArray, curL, curR);

      if (this.autoAdjust) {
        this.accumulateAdjustmentData(arr);
      }

      if (this.waterfall) {
        this.drawWaterfall(arr, pxL, pxR, curL, curR);
      }
      if (this.spectrum) {
        this.drawSpectrum(arr, pxL, pxR, curL, curR);
      }

      requestAnimationFrame(draw);
    };

    requestAnimationFrame(draw);
  }


  async redrawWaterfall() {

    const toDraw = this.drawnWaterfallQueue.toArray()
    const curLineReset = this.lineResets
    const curLine = this.curLine
    const drawLine = (i) => {
      const toDrawLine = curLine + 1 + i + (this.lineResets - curLineReset) * this.canvasHeight / 2

      const [waterfallArray, curL, curR] = toDraw[i]

      const [arr, pxL, pxR] = this.calculateOffsets(waterfallArray, curL, curR)

      this.drawWaterfallLine(arr, pxL, pxR, toDrawLine)
      if (i + 1 < toDraw.length) {
        this.updateImmediate = setImmediate(() => drawLine(i + 1))
      }
    }
    clearImmediate(this.updateImmediate)
    if (toDraw.length) {
      drawLine(0)
    }
  }

  drawWaterfall(arr, pxL, pxR, curL, curR) {
    // Ensure integer pixel values
    pxL = Math.floor(pxL);
    pxR = Math.ceil(pxR);

    // Calculate the width of the waterfall line
    const width = pxR - pxL;



    // Copy the current canvas content to the buffer canvas
    this.bufferContext.drawImage(this.ctx.canvas, 0, 1, this.canvasWidth, this.canvasHeight - 1, 0, 0, this.canvasWidth, this.canvasHeight - 1);

    // Draw the new line at the top of the buffer canvas
    this.drawWaterfallLine(arr, pxL, pxR, 0, this.bufferContext);

    // Clear the main canvas before drawing
    this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

    // Draw the buffer canvas back to the main canvas
    this.ctx.drawImage(this.bufferCanvas, 0, 0);
  }

  drawWaterfallLine(arr, pxL, pxR, line, ctx) {
    // Ensure integer pixel values
    pxL = Math.floor(pxL);
    pxR = Math.ceil(pxR);
    line = Math.floor(line);

    const width = pxR - pxL;

    // Create an ImageData object with the exact width we need
    const colorarr = ctx.createImageData(width, 1);

    for (let i = 0; i < width; i++) {
      // Map the pixel index to the corresponding array index
      const arrIndex = Math.floor(i * (arr.length - 1) / (width - 1));
      const colorIndex = Math.floor(arr[arrIndex]);

      // Set the color for this pixel
      const pixelStart = i * 4;
      colorarr.data.set(this.colormap[colorIndex], pixelStart);
    }

    // Draw directly to the buffer canvas
    ctx.putImageData(colorarr, pxL, ctx.canvas.height - 1 - line);
  }


  drawSpectrum(arr, pxL, pxR, curL, curR) {
    if (curL !== this.spectrumFiltered[0][0] || curR !== this.spectrumFiltered[0][1]) {
      this.spectrumFiltered[1] = arr;
      this.spectrumFiltered[0] = [curL, curR];
    }

    // Smooth the spectrogram with the previous values
    for (let i = 0; i < arr.length; i++) {
      this.spectrumFiltered[1][i] = this.spectrumAlpha * arr[i] + (1 - this.spectrumAlpha) * this.spectrumFiltered[1][i];
    }

    // Take the smoothed value
    arr = this.spectrumFiltered[1];

    const pixels = (pxR - pxL) / arr.length;
    const scale = this.canvasScale;
    const height = this.spectrumCanvasElem.height;

    // Normalize the array (invert and scale to canvas height)
    const normalizedArr = arr.map(x => height - (x / 255) * height);

    // Clear the canvas
    this.spectrumCtx.clearRect(0, 0, this.spectrumCanvasElem.width, height);

    // Create gradient
    const gradient = this.spectrumCtx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(3, 157, 252, 0.8)');  // Yellow at top
    gradient.addColorStop(1, 'rgba(3, 157, 252, 0.2)');  // Orange at bottom

    // Set up the drawing styles
    this.spectrumCtx.lineWidth = 2;
    this.spectrumCtx.strokeStyle = 'rgba(3, 157, 252, 0.8)';
    this.spectrumCtx.fillStyle = gradient;
    this.spectrumCtx.shadowColor = 'rgba(3, 157, 252, 0.5)';
    this.spectrumCtx.shadowBlur = 10;

    // Begin the path for filling
    this.spectrumCtx.beginPath();
    this.spectrumCtx.moveTo(pxL, height);

    // Draw the smooth curve
    let prevX = pxL;
    let prevY = normalizedArr[0];
    this.spectrumCtx.lineTo(prevX, prevY);

    for (let i = 1; i < normalizedArr.length; i++) {
      const x = pxL + i * pixels;
      const y = normalizedArr[i];

      // Use quadratic curves for smoother lines
      const midX = (prevX + x) / 2;
      this.spectrumCtx.quadraticCurveTo(prevX, prevY, midX, (prevY + y) / 2);

      prevX = x;
      prevY = y;
    }

    this.spectrumCtx.lineTo(pxR, prevY);
    this.spectrumCtx.lineTo(pxR, height);
    this.spectrumCtx.closePath();

    // Fill and stroke the path
    this.spectrumCtx.fill();
    this.spectrumCtx.stroke();



    // Reset shadow for text and frequency line
    this.spectrumCtx.shadowBlur = 0;

    if (this.spectrumFreq) {
      // Draw frequency text with a subtle glow
      this.spectrumCtx.font = '14px Arial';
      this.spectrumCtx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      this.spectrumCtx.shadowColor = 'rgba(255, 255, 255, 0.5)';
      this.spectrumCtx.shadowBlur = 5;
      this.spectrumCtx.fillText(`${(this.spectrumFreq / 1e6).toFixed(6)} MHz`, 10, 20);

      // Draw vertical frequency line
      this.spectrumCtx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      this.spectrumCtx.lineWidth = 1;
      this.spectrumCtx.setLineDash([5, 3]);
      this.spectrumCtx.beginPath();
      this.spectrumCtx.moveTo(this.spectrumX, 0);
      this.spectrumCtx.lineTo(this.spectrumX, height);
      this.spectrumCtx.stroke();
      this.spectrumCtx.setLineDash([]);
    }
  }
  checkBandAndSetMode(frequency) {
    let newBand = null;
    let newMode = null;

    for (const band of this.bands) {
      if (frequency >= band.startFreq && frequency <= band.endFreq) {
        newBand = band;
        for (const modeRange of band.modes) {
          if (frequency >= modeRange.startFreq && frequency <= modeRange.endFreq) {
            newMode = modeRange.mode;

            break;
          }
        }
        break;
      }
    }

    if (newBand !== this.currentBand || (newBand && newMode !== this.currentMode)) {
      this.currentBand = newBand;
      this.currentMode = newMode;

      if (newBand) {
        eventBus.publish('setMode', newMode);
        return newMode;
      } else {
        // We've moved out of all defined bands
        eventBus.publish('outOfBand');
        return null;
      }
    }

    return null; // No change in band or mode
  }



  updateGraduation() {
    const freqL = this.idxToFreq(this.waterfallL)
    const freqR = this.idxToFreq(this.waterfallR)
    const scale = this.canvasScale

    let graduationSpacing = 1

    // Calculate the scale where at least 20 graduation spacings will be drawn
    while ((freqR - freqL) / graduationSpacing > 8) {
      graduationSpacing *= 10
    }
    graduationSpacing /= 10

    this.graduationCtx.fillStyle = 'white'
    this.graduationCtx.strokeStyle = 'white'
    this.graduationCtx.clearRect(0, 0, this.graduationCanvasElem.width, this.graduationCanvasElem.height)

    // Find the first graduation frequency
    let freqLStart = freqL
    if (freqL % graduationSpacing !== 0) {
      freqLStart = freqL + (graduationSpacing - (freqL % graduationSpacing))
    }

    // Find the least amount of trailing zeros
    let minimumTrailingZeros = 5
    for (let freqStart = freqLStart; freqStart <= freqR; freqStart += graduationSpacing) {
      if (freqStart != 0) {
        const trailingZeros = freqStart.toString().match(/0*$/g)[0].length
        minimumTrailingZeros = Math.min(minimumTrailingZeros, trailingZeros)
      }
    }

    if (this.mobile) {
      this.graduationCtx.font = `${12 * scale}px Inter`
    } else {
      this.graduationCtx.font = `${10 * scale}px Inter`
    }

    for (; freqLStart <= freqR; freqLStart += graduationSpacing) {
      // find the middle pixel
      const middlePixel = (freqLStart - freqL) / (freqR - freqL) * this.canvasWidth

      let lineHeight = 5
      let printFreq = false
      if (freqLStart % (graduationSpacing * 10) === 0) {
        lineHeight = 10
        printFreq = true
      } else if (freqLStart % (graduationSpacing * 5) === 0) {
        lineHeight = 7
        printFreq = true
      }

      if (printFreq) {
        this.graduationCtx.textAlign = 'center'
        // Convert Hz to kHz by dividing by 1000, then round to remove decimal places
        const freqInKHz = (freqLStart / 1000)
        this.graduationCtx.fillText(freqInKHz.toString(), middlePixel, 20 * scale)
      }
      // draw a line in the middle of it
      this.graduationCtx.lineWidth = 1 * scale
      this.graduationCtx.beginPath()
      this.graduationCtx.moveTo(middlePixel, (5 + (5 - lineHeight)) * scale)
      this.graduationCtx.lineTo(middlePixel, (10) * scale)
      this.graduationCtx.stroke()
    }



    this.drawClients()
  }

  updateBandPlan() {
    const freqL = this.idxToFreq(this.waterfallL);
    const freqR = this.idxToFreq(this.waterfallR);
    const scale = this.canvasScale;

    // Clear the bandplan canvas
    this.bandPlanCtx.clearRect(0, 0, this.bandPlanCanvasElem.width, this.bandPlanCanvasElem.height);

    // Define the height of the band marker
    const bandHeight = 10 * scale;
    const bandOffset = 25 * scale;

    this.bands.forEach(band => {

      // This comparator will fix an issue of printing the band name multiple times //
      // because of the ITU regions added in the this.bands[] array //
      // I import the region from site_information and do a comparison against //
      // the site ITU region and the band.ITU value. //
      if (band.ITU === siteRegion || band.ITU == 123) {
        const startIdx = this.freqToIdx(band.startFreq);
        const endIdx = this.freqToIdx(band.endFreq);
        const startX = this.idxToCanvasX(startIdx);
        const endX = this.idxToCanvasX(endIdx);
        const bandWidth = endX - startX;

        // Calculate the y-position for the band
        const bandY = this.bandPlanCanvasElem.height - bandHeight - bandOffset;

        // Draw the band line with improved styling
        this.bandPlanCtx.strokeStyle = band.color;
        this.bandPlanCtx.lineWidth = 2 * scale;
        this.bandPlanCtx.lineCap = 'round';
        this.bandPlanCtx.beginPath();
        this.bandPlanCtx.moveTo(startX, bandY);
        this.bandPlanCtx.lineTo(endX, bandY);

        // Add a subtle glow effect
        this.bandPlanCtx.shadowColor = band.color;
        this.bandPlanCtx.shadowBlur = 3 * scale;
        this.bandPlanCtx.stroke();

        // Reset shadow for text
        this.bandPlanCtx.shadowColor = 'transparent';
        this.bandPlanCtx.shadowBlur = 0;

        // Set the font for the band label
        let fontSize = this.mobile ? 12 * scale : 10 * scale;
        this.bandPlanCtx.font = `${fontSize}px Inter`;
        this.bandPlanCtx.fillStyle = 'white';
        this.bandPlanCtx.textAlign = 'center';
        this.bandPlanCtx.textBaseline = 'top';

        // Only draw text if it fits fully within the band width
        if (this.bandPlanCtx.measureText(band.name).width <= bandWidth - 4 * scale) {
          const textY = bandY + bandHeight + 2 * scale;

          // Draw the text with a subtle shadow for better visibility
          this.bandPlanCtx.shadowColor = 'rgba(0, 0, 0, 0.5)';
          this.bandPlanCtx.shadowBlur = 2 * scale;
          this.bandPlanCtx.shadowOffsetY = 1 * scale;
          this.bandPlanCtx.fillText(band.name, (startX + endX) / 2, textY);
          // Reset shadow
          this.bandPlanCtx.shadowColor = 'transparent';
          this.bandPlanCtx.shadowBlur = 0;
          this.bandPlanCtx.shadowOffsetY = 0;
        }
      }
    });

  }



  freqToCanvasX(freq) {
    const idx = this.freqToIdx(freq);
    return this.idxToCanvasX(idx);
  }



  // Helper function to abbreviate band names
  abbreviateBandName(name, width, fontSize) {
    this.bandPlanCtx.font = `${fontSize}px Inter`;
    if (this.bandPlanCtx.measureText(name).width <= width - 4 * this.canvasScale) {
      return name;
    }

    const words = name.split(' ');
    if (words.length === 1) {
      return name.substring(0, Math.floor(width / (fontSize * 0.6)));
    }

    return words.map(word => word[0]).join('');
  }



  setClients(clients) {
    this.clients = clients
  }

  drawClients() {
    Object.entries(this.clients)
      .filter(([_, x]) => (x[1] < this.waterfallR && x[1] >= this.waterfallL))
      .forEach(([id, range]) => {
        const midOffset = this.idxToCanvasX(range[1])
        const [r, g, b, a] = this.clientColormap[parseInt(id.substring(0, 2), 16)]
        this.graduationCtx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`
        this.graduationCtx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${a})`
        this.graduationCtx.beginPath()
        this.graduationCtx.moveTo(midOffset, 0)
        this.graduationCtx.lineTo(midOffset + 2, 5)
        this.graduationCtx.stroke()
        this.graduationCtx.beginPath()
        this.graduationCtx.moveTo(midOffset, 0)
        this.graduationCtx.lineTo(midOffset - 2, 5)
        this.graduationCtx.stroke()
      })
  }

  applyBlur(imageData, width, height, radius) {
    const pixels = imageData.data;
    const tempPixels = new Uint8ClampedArray(pixels);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0, g = 0, b = 0, a = 0, count = 0;

        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const px = x + dx;
            const py = y + dy;
            if (px >= 0 && px < width && py >= 0 && py < height) {
              const i = (py * width + px) * 4;
              r += tempPixels[i];
              g += tempPixels[i + 1];
              b += tempPixels[i + 2];
              a += tempPixels[i + 3];
              count++;
            }
          }
        }

        const i = (y * width + x) * 4;
        pixels[i] = r / count;
        pixels[i + 1] = g / count;
        pixels[i + 2] = b / count;
        pixels[i + 3] = a / count;
      }
    }

    return imageData;
  }

  setWaterfallRange(waterfallL, waterfallR) {
    if (waterfallL >= waterfallR) {
      return;
    }

    const width = waterfallR - waterfallL;
    // If there is out of bounds, fix the bounds
    if (waterfallL < 0 && waterfallR > this.waterfallMaxSize) {
      waterfallL = 0;
      waterfallR = this.waterfallMaxSize;
    } else if (waterfallL < 0) {
      waterfallL = 0;
      waterfallR = width;
    } else if (waterfallR > this.waterfallMaxSize) {
      waterfallR = this.waterfallMaxSize;
      waterfallL = waterfallR - width;
    }

    const prevL = this.waterfallL;
    const prevR = this.waterfallR;
    this.waterfallL = waterfallL;
    this.waterfallR = waterfallR;

    this.waterfallSocket.send(JSON.stringify({
      cmd: 'window',
      l: this.waterfallL,
      r: this.waterfallR
    }));

    const newCanvasX1 = this.idxToCanvasX(prevL)
    const newCanvasX2 = this.idxToCanvasX(prevR)
    const newCanvasWidth = newCanvasX2 - newCanvasX1

    this.ctx.drawImage(this.canvasElem, 0, 0, this.canvasWidth, this.canvasHeight, newCanvasX1, 0, newCanvasWidth, this.canvasHeight)


    // Special case for zoom out or panning, blank the borders
    if ((prevR - prevL) <= (waterfallR - waterfallL) + 1) {
      this.ctx.fillRect(0, 0, newCanvasX1, this.canvasHeight);
      this.ctx.fillRect(newCanvasX2, 0, this.canvasWidth - newCanvasX2, this.canvasHeight);
    }

    this.updateGraduation();
    this.updateBandPlan();
    this.drawSpectrogram();
  }

  getWaterfallRange() {
    return [this.waterfallL, this.waterfallR]
  }

  setWaterfallLagTime(lagTime) {
    this.lagTime = Math.max(0, lagTime)
  }

  setOffset(offset) {
    this.waterfallColourShift = offset
  }
  setMinOffset(offset) {
    this.minWaterfall = offset
  }
  setMaxOffset(offset) {
    this.maxWaterfall = offset
  }

  setAlpha(alpha) {
    this.spectrumAlpha = alpha
  }

  setColormapArray(colormap) {
    this.colormap = computeColormapArray(colormap)
  }

  setColormap(name) {
    this.setColormapArray(getColormap(name))
  }

  setUserID(userID) {
    this.waterfallSocket.send(JSON.stringify({
      cmd: 'userid',
      userid: userID
    }))
  }

  setSpectrum(spectrum) {
    this.spectrum = spectrum
    if (spectrum == true) {
      this.wfheight = 200 * window.devicePixelRatio;
      if (typeof this.resizeCallback == 'function') {
        this.resizeCallback();
      }

    } else if (spectrum == false) {
      this.wfheight = 200 * window.devicePixelRatio;
      if (typeof this.resizeCallback == 'function') {
        this.resizeCallback();
      }
    }
  }

  setWaterfallBig(big) {
    if (big == true) {
      this.wfheight = 300 * window.devicePixelRatio;
      if (typeof this.resizeCallback == 'function') {
        this.resizeCallback();
      }

    } else if (big == false) {
      this.wfheight = 200 * window.devicePixelRatio;
      if (typeof this.resizeCallback == 'function') {
        this.resizeCallback();
      }
    }
  }

  setWaterfall(waterfall) {
    this.waterfall = waterfall
  }

  resetRedrawTimeout(timeout) {
    return;
    if (this.updateTimeout !== undefined) {
      clearTimeout(this.updateTimeout)
    }
    this.updateTimeout = setTimeout(this.redrawWaterfall.bind(this), timeout)
  }

  canvasWheel(e) {
    const computedStyle = window.getComputedStyle(e.target);
    const cursorStyle = computedStyle.cursor;
    if (cursorStyle == 'resize') {
      return;
    }
    // For UI to pass custom zoom range
    const x = (e.coords || { x: this.getMouseX(this.spectrumCanvasElem, e) }).x
    e.preventDefault()

    const zoomAmount = e.deltaY || e.scale
    const l = this.waterfallL
    const r = this.waterfallR
    // For UI to pass in a custom scale amount
    const scale = e.scaleAmount || 0.85

    // Prevent zooming beyond a certain point
    if (r - l <= 128 && zoomAmount < 0) {
      return false
    }
    if (zoomAmount > 0) {
      if (this.zoomFactor != 1) {
        this.zoomFactor = this.zoomFactor - 1
      }
    } else if (zoomAmount < 0) {

      this.zoomFactor = this.zoomFactor + 1
    }



    const centerfreq = (r - l) * x / this.canvasWidth + l
    let widthL = centerfreq - l
    let widthR = r - centerfreq
    if (zoomAmount < 0) {
      widthL *= scale
      widthR *= scale
    } else if (zoomAmount > 0) {
      widthL *= 1 / scale
      widthR *= 1 / scale
    }
    const waterfallL = Math.round(centerfreq - widthL)
    const waterfallR = Math.round(centerfreq + widthR)

    this.setWaterfallRange(waterfallL, waterfallR)

    return false
  }

  mouseMove(e) {
    // Clear the waterfall queue to remove old data
    // Figure out how much is dragged
    const mouseMovement = e.movementX
    const frequencyMovement = Math.round(mouseMovement / this.canvasElem.getBoundingClientRect().width * (this.waterfallR - this.waterfallL))


    const newL = this.waterfallL - frequencyMovement
    const newR = this.waterfallR - frequencyMovement
    this.setWaterfallRange(newL, newR)
  }

  spectrumMouseMove(e) {
    const x = this.getMouseX(this.spectrumCanvasElem, e)
    const freq = this.canvasXtoFreq(x)
    this.spectrumFreq = freq
    this.spectrumX = x
  }

  spectrumMouseLeave(e) {
    this.spectrumFreq = undefined
    this.spectrumX = undefined
  }
}



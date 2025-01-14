<script>
  const VERSION = "1.5.4 with enhancements from ON5HB, NY4Q, HB3XDC, SV1BTL, SV2AMK";

  import { onDestroy, onMount, tick } from "svelte";
  import { fade, fly, scale } from "svelte/transition";
  import copy from "copy-to-clipboard";
  import { RollingMax } from "efficient-rolling-stats";
  import { writable } from "svelte/store";

  import PassbandTuner from "./lib/PassbandTuner.svelte";
  import FrequencyInput from "./lib/FrequencyInput.svelte";
  import FrequencyMarkers from "./lib/FrequencyMarkers.svelte";

  import { eventBus } from "./eventBus";

  import { quintOut } from "svelte/easing";

  import { pinch, pan } from "./lib/hammeractions.js";
  import { availableColormaps } from "./lib/colormaps";
  import { init, audio, waterfall, events, FFTOffsetToFrequency, frequencyToFFTOffset, frequencyToWaterfallOffset, getMaximumBandwidth, waterfallOffsetToFrequency } from "./lib/backend.js";
  import { constructLink, parseLink, storeInLocalStorage } from "./lib/storage.js";

  // Added to create the Site Information area //
  import { siteSysop, siteSysopEmailAddress, siteInformation, siteGridSquare, siteHardware, siteSoftware, siteNote, siteSDRBaseFrequency, siteSDRBandwidth, siteRegion, siteChatEnabled } from '../site_information.json';
  // End of Information Area import //

  // Import to detect mobile devices //
  import Device from 'svelte-device-info';

  let isRecording = false;
  let canDownload = false;

  let waterfallCanvas;
  let spectrumCanvas;
  let graduationCanvas;
  let bandPlanCanvas;
  let tempCanvas;

  let frequencyInputComponent;

  let frequency;

  let passbandTunerComponent;

  let link;
  var chatContentDiv;
 
  // Added to allow the user to toggle the waterfall on and off //
  function handleWaterfallChange() {
    waterfallDisplay = !waterfallDisplay;
  }
  // End of waterfall toggle addition //

 
  // Declarations for the store and restore of the waterfall settings //
  // when Auto Adjust is enabled. //
  let previous_min_waterfall;
  let previous_max_waterfall;
  let previous_brightness;
  let storeWaterfallSettings = false;
  // End of store and restore variables //


  // Definitions for handleBandChange function //
  // To show the proper band upon startup, you must set //
  // currentBand to the integer of the band starting at 0 //
  // uup to that band. I am publishing several bands, so //
  // the integer for 80m is 7. //
  let bandArray = waterfall.bands;
  let currentBand = 7; // 80m


  // Begin Tuning Steps declarations
  let defaultStep,currentTuneStep = 10; // Default step value / Track current step
  let tuningsteps = ["10","50","100","500","1000","5000","9000","10000"];


  // buttons = true for Buttons for Waterfall controls //
  // buttons = false for toggle switches for Waterfall controls //
  let buttons = true;
  
  // Added to create a fineTune function to use //
  // buttons to click on for mobile users //
  let fineTuneAmount = 0;

  
  // Set default AGC (0 = Off) //
  let currentAGC = 0;
  

  // Added to allow an adjustment of the dynamic audio //
  // buffer function inside audio.js //
  let audioBufferDelayEnabled = false;
  let audioBufferDelay = 1;

  // Waterfall Auto Control //
  let AutoAdjustEnabled = false;

  // Used to track bandwidth as to make sure the //
  // static bandwidth buttons can be enabled and returened //
  // to the default bandwidth for thr chosen mode //
  let currentBandwidth = 0;
  let staticBandwidthEnabled = false;

  // Getting The Current Date & Time And Setting It
  let currentDateTime = new Date();
  
  // SMeter Clock
  onMount(() => {
      const interval = setInterval(() => {
       currentDateTime = new Date();
  }, 1000);

   return () => { clearInterval(interval); };
    });
   
  const formatter = new Intl.DateTimeFormat('default', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  // Function added to toggle the Additional Info menu //
  function toggleMenu() {
    const menu = document.getElementById("collapsible-menu");
    const label = document.getElementById("menu-toggle-label");

    if (menu.classList.contains("hidden")) {
      menu.classList.remove("hidden");
      label.innerText = "Close Additional Info";
      }
      else {
        menu.classList.add("hidden");
        label.innerText = "Open Additional Info";
      }
    }
  // End of Site Information addition //

  function toggleRecording() {
    if (!isRecording) {
      audio.startRecording();
      isRecording = true;
      canDownload = false;
    } else {
      audio.stopRecording();
      isRecording = false;
      canDownload = true;
    }
  }

  function downloadRecording() {
    audio.downloadRecording();
  }

  function generateUniqueId() {
    return Math.random().toString(36).substr(2, 10) + Math.random().toString(36).substr(2, 10);
  }

  let userId; // Global variable to store the user's unique ID
  let autoAdjustEnabled = false;

  // Updates the passband display
  function updatePassband(passband) {
    passband = passband || audio.getAudioRange();
    const frequencies = passband.map(FFTOffsetToFrequency);
    // Bandwidth display also needs updating
    bandwidth = ((frequencies[2] - frequencies[0]) / 1000).toFixed(2);
    // Passband Display
    const offsets = frequencies.map(frequencyToWaterfallOffset);
    passbandTunerComponent.changePassband(offsets);
  }
  // Wheel zooming, update passband and markers
  function handleWaterfallWheel(e) {
    waterfall.canvasWheel(e);
    passbandTunerComponent.updatePassbandLimits();
    updatePassband();
    frequencyMarkerComponent.updateFrequencyMarkerPositions();
  }

  function handleBandPlanClick(event) {
    const rect = event.target.getBoundingClientRect();
    const x = event.clientX - rect.left;

    // First, check if a marker was clicked
    const markerClicked = waterfall.handleMarkerClick(x);

    // If no marker was clicked, handle the passband click
    if (!markerClicked) {
      passbandTunerComponent.handlePassbandClick(event);
    }
  }

  function handleBandPlanMouseMove(event) {
    const rect = event.target.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (waterfall.handleMarkerHover(x, y)) {
      event.target.style.cursor = "pointer";
    } else {
      event.target.style.cursor = "default";
      waterfall.updateBandPlan(); // Clear previous hover effects
    }
  }

  // Decoder
  let ft8Enabled = false;

  // Handling dragging the waterfall left or right
  let waterfallDragging = false;
  let waterfallDragTotal = 0;
  let waterfallBeginX = 0;
  function handleWaterfallMouseDown(e) {
    waterfallDragTotal = 0;
    waterfallDragging = true;
    waterfallBeginX = e.clientX;
  }


  function handleWindowMouseMove(e) {
    if (waterfallDragging) {
      waterfallDragTotal += Math.abs(e.movementX) + Math.abs(e.movementY);
      waterfall.mouseMove(e);
      updatePassband();
      frequencyMarkerComponent.updateFrequencyMarkerPositions();
    }
  }


  function handleWindowMouseUp(e) {
    if (waterfallDragging) {
      // If mouseup without moving, handle as click
      if (waterfallDragTotal < 2) {
        passbandTunerComponent.handlePassbandClick(e);
      }
      waterfallDragging = false;
    }
  }

  // Sidebar controls for waterfall and spectrum analyzer
  let waterfallDisplay = true;
  let spectrumDisplay = true;
  let biggerWaterfall = false;
  function handleSpectrumChange() {
    spectrumDisplay = !spectrumDisplay;
    waterfall.setSpectrum(spectrumDisplay);
  }

  function handleWaterfallSizeChange() {
    biggerWaterfall = !biggerWaterfall;
    waterfall.setWaterfallBig(biggerWaterfall);
  }

  // Declaration for the VFO A/B system //
  let vfo = "VFO A";
  let vfoModeA = true;
  let vfoAFrequency = 3645000;
  let vfoBFrequency = 7150000;
  let vfoAMode = "LSB";
  let vfoBMode = "LSB";

// declaration for function handlePassbandChange(passband) //
let bandwidth;

  // Waterfall drawing
  let currentColormap = "gqrx";
  let alpha = 0.5;
  let brightness = 130;
  let min_waterfall = -30;
  let max_waterfall = 110;
  function initializeColormap() {
    // Check if a colormap is saved in local storage
    const savedColormap = localStorage.getItem("selectedColormap");
    if (savedColormap) {
      currentColormap = savedColormap;
    }
    waterfall.setColormap(currentColormap);
  }

  function handleWaterfallColormapSelect(event) {
    currentColormap = event.target.value;
    waterfall.setColormap(currentColormap);

    // Save the selected colormap to local storage
    localStorage.setItem("selectedColormap", currentColormap);
  }

  // Waterfall slider controls
  function handleAlphaMove() {
    waterfall.setAlpha(1 - alpha);
  }
  function handleBrightnessMove() {
    waterfall.setOffset(brightness);
  }
  function handleMinMove() {
    waterfall.setMinOffset(min_waterfall);
  }
  function handleMaxMove() {
    waterfall.setMaxOffset(max_waterfall);
  }
  

  function handleAutoAdjust() {
    autoAdjustEnabled = !autoAdjustEnabled;
    waterfall.autoAdjust = autoAdjustEnabled;
    // Added to track the waterfall settings //
    // This routine stores the settings //
    if(autoAdjustEnabled && !storeWaterfallSettings) {
      previous_min_waterfall = min_waterfall;
      previous_max_waterfall = max_waterfall;
      previous_brightness = brightness;
      storeWaterfallSettings = true;
    }

    // Added to restore the waterfall settings //
    // to the previous levels is Auto Adjust is diaabled //
    if(!autoAdjustEnabled && storeWaterfallSettings) {
     min_waterfall = previous_min_waterfall;
     max_waterfall = previous_max_waterfall;
     brightness = previous_brightness;
     storeWaterfallSettings = false;
     handleMinMove();
     handleMaxMove();
     handleBrightnessMove();
   }
 }

  function checkColor(color) {
  console.log("C = " + color);
  }

  // This function checks the region inside waterfall.js and compares //
  // it to the siteRegion and then approves the proper button to be //
  // printed to the screen. //
  function verifyRegion(region) {
    switch (region) {
      case 123:
        return true;
	break;
     case 1:
       if (region === 1 && siteRegion === 1) { return true; }
       break;
     case 2:
       if (region === 2 && siteRegion === 2) { return true; }
       break;
     case 3:
       if (region === 3 && siteRegion === 3) { return true; }
       break;
    }
    return false;
  }

 // This function checks the siteSDRBasebandFrequency siteSDRBandwidth and //
  // compares it to the startFreq & endFreq from waterfall.js and if all that //
  // passes, then a Band Button is printed to the SDR inttrface. //
  function printBandButton(startFreq,endFreq) {
    let sdrStartFreq = siteSDRBaseFrequency;
    let sdrBandwidth = siteSDRBandwidth;
    return (endFreq >= sdrStartFreq && endFreq <= (sdrStartFreq + sdrBandwidth));
  }


  // Audio demodulation selection
  let demodulators = ["USB", "LSB", "CW", "CW-L", "AM", "FM"];
  const demodulationDefaults = {
    USB: { type: "USB", offsets: [-100, 2800] },
    LSB: { type: "LSB", offsets: [2800, -100] },
    CW: { type: "USB", offsets: [250, 250] },
    //CW: { type: "CW", offsets: [2800, -100] },
    AM: { type: "AM", offsets: [4500, 4500] }, // Set to 9KHz for AM
    FM: { type: "FM", offsets: [5000, 5000] },
    WBFM: { type: "FM", offsets: [95000, 95000] },
  };


  let demodulation = "USB";
  function roundAudioOffsets(offsets) {
    const [l, m, r] = offsets;
    return [Math.floor(l), m, Math.floor(r)];
  }


  function SetMode(mode) {
    if (mode == "CW-U" || mode == "CW-L") {
      mode = "CW";
    }
    console.log("Setting mode to", mode);
    demodulation = mode;

    handleDemodulationChange(null, true);
    updateLink();
  }

  // Demodulation controls
  function handleDemodulationChange(e, changed) {
    passbandTunerComponent.setMode(demodulation);
    const demodulationDefault = demodulationDefaults[demodulation];
    if (changed) {
      if (demodulation === "WBFM") {
        audio.setFmDeemph(50e-6);
      } else {
        audio.setFmDeemph(0);
      }
      if (demodulationDefault.type == "USB" && demodulationDefault.offsets[0] == 250) {
        audio.setAudioDemodulation("CW");
      } else {
        audio.setAudioDemodulation(demodulationDefault.type);
      }
    }
    let prevBFO = frequencyInputComponent.getBFO();
    let newBFO = demodulationDefault.bfo || 0;
    let [l, m, r] = audio.getAudioRange().map(FFTOffsetToFrequency);
    m = m + newBFO - prevBFO;
    l = m - demodulationDefault.offsets[0];
    r = m + demodulationDefault.offsets[1];

    frequencyInputComponent.setBFO(newBFO);
    frequencyInputComponent.setFrequency();

    frequency = (frequencyInputComponent.getFrequency() / 1e3).toFixed(2);

    // CW
    const lOffset = l - 200;
    const mOffset = m - 750;
    const rOffset = r - 200;
    const audioParametersOffset = [lOffset, mOffset, rOffset].map(frequencyToFFTOffset);
    const audioParameters = [l, m, r].map(frequencyToFFTOffset);

    // Set audio range with both normal and offset values
    audio.setAudioRange(...audioParameters, ...audioParametersOffset);

    updatePassband();
    updateLink();
  }

  function handleFt8Decoder(e, value) {
    ft8Enabled = value;
    audio.setFT8Decoding(value);
  }

  // Normalizes dB values to a 0-100 scale for visualization
  function normalizeDb(dbValue) {
    const minDb = -100; // Minimum expected dB value
    const maxDb = 0; // Maximum dB value (best signal)
    return ((dbValue - minDb) / (maxDb - minDb)) * 100;
  }

  function handlePassbandChange(passband) {
    let [l, m, r] = passband.detail.map(waterfallOffsetToFrequency);

    let bfo = frequencyInputComponent.getBFO();
    bfo = 0;

    l += bfo;
    m += bfo;
    r += bfo;

    // CW
    const lOffset = l - 200;
    const mOffset = m - 750;
    const rOffset = r - 200;

    bandwidth = ((r - l) / 1000).toFixed(2);
    frequencyInputComponent.setFrequency(m);
    frequency = (frequencyInputComponent.getFrequency() / 1e3).toFixed(2);

    const audioParameters = [l, m, r].map(frequencyToFFTOffset);
    const audioParametersOffset = [lOffset, mOffset, rOffset].map(frequencyToFFTOffset);

    // Set audio range with both normal and offset values
    audio.setAudioRange(...audioParameters, ...audioParametersOffset);

    updateLink();
    updatePassband();
    waterfall.checkBandAndSetMode(frequency * 1e3);
    updateBandButton();
  }

  // Entering new frequency into the textbox
  function handleFrequencyChange(event) {
    const frequency = event.detail;
    const audioRange = audio.getAudioRange();

    const [l, m, r] = audioRange.map(FFTOffsetToFrequency);

    // Preserve current bandwidth settings
    let audioParameters = [frequency - (m - l), frequency, frequency + (r - m)].map(frequencyToFFTOffset);
    const newm = audioParameters[1];

    const lOffset = frequency - (m - l) - 200;
    const mOffset = frequency - 750;
    const rOffset = frequency + (r - m) - 200;

    const audioParametersOffset = [lOffset, mOffset, rOffset].map(frequencyToFFTOffset);

    // If the ranges are not within limit, shift it back
    let [waterfallL, waterfallR] = waterfall.getWaterfallRange();
    if (newm < waterfallL || newm >= waterfallR) {
      const limits = Math.floor((waterfallR - waterfallL) / 2);
      let offset;
      if (audioRange[1] >= waterfallL && audioRange[1] < waterfallR) {
        offset = audioRange[1] - waterfallL;
      } else {
        offset = limits;
      }
      const newMid = Math.min(waterfall.waterfallMaxSize - limits, Math.max(limits, newm - offset + limits));

      waterfallL = Math.floor(newMid - limits);
      waterfallR = Math.floor(newMid + limits);
      waterfall.setWaterfallRange(waterfallL, waterfallR);
    }
    audio.setAudioRange(...audioParameters, ...audioParametersOffset);
    updatePassband();
    updateLink();
    if (!event.markerclick) {
      waterfall.checkBandAndSetMode(frequency);
    }
    frequencyMarkerComponent.updateFrequencyMarkerPositions();
    updateBandButton();
  }

  // Waterfall magnification controls
  function handleWaterfallMagnify(e, type) {
    let [l, m, r] = audio.getAudioRange();
    const [waterfallL, waterfallR] = waterfall.getWaterfallRange();
    const offset = ((m - waterfallL) / (waterfallR - waterfallL)) * waterfall.canvasWidth;
    switch (type) {
      case "max":
        m = Math.min(waterfall.waterfallMaxSize - 512, Math.max(512, m));
        l = Math.floor(m - 512);
        r = Math.ceil(m + 512);
        break;
      case "+":
        e.coords = { x: offset };
        e.scale = -1;
        waterfall.canvasWheel(e);
        updatePassband();
        frequencyMarkerComponent.updateFrequencyMarkerPositions();
        return;
      case "-":
        e.coords = { x: offset };
        e.scale = 1;
        waterfall.canvasWheel(e);
        updatePassband();
        frequencyMarkerComponent.updateFrequencyMarkerPositions();
        return;
      case "min":
        l = 0;
        r = waterfall.waterfallMaxSize;
        break;
    }
    waterfall.setWaterfallRange(l, r);
    frequencyMarkerComponent.updateFrequencyMarkerPositions();

    updatePassband();
  }

  let mute = false;
  let volume = 50;
  let squelchEnable;
  let squelch = -50;
  let power = 0;
  let powerPeak = 0;
  const numberOfDots = 35;
  const s9Index = 17;
  const accumulator = RollingMax(10);

  // Function to draw the S-meter
  function drawSMeter(value) {
    const canvas = document.getElementById("sMeter");
    const ctx = canvas.getContext("2d");

    canvas.width = 300;
    canvas.height = 40;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    const segmentWidth = 6;
    const segmentGap = 3;
    const segmentHeight = 8;
    const lineY = 15;
    const labelY = 25;
    const tickHeight = 5;
    const longTickHeight = 5;

    const s9Position = width / 2;

    ctx.strokeStyle = "#a7e6fe";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, lineY);
    ctx.lineTo(s9Position, lineY);
    ctx.stroke();

    ctx.strokeStyle = "#ed1c24";
    ctx.beginPath();
    ctx.moveTo(s9Position, lineY);
    ctx.lineTo(268, lineY);
    ctx.stroke();

    for (let i = 0; i < 30; i++) {
      const x = i * (segmentWidth + segmentGap);
      if (i < value) {
        ctx.fillStyle = i < 17 ? "#a3eced" : "#d9191c";
      } else {
        ctx.fillStyle = i < 17 ? "#003333" : "#330000";
      }
      ctx.fillRect(x, 0, segmentWidth, segmentHeight);
    }

    ctx.font = "11px monospace";
    ctx.textAlign = "center";

    const labels = ["S1", "3", "5", "7", "9", "+20", "+40", "+60dB"];

    for (let i = 0; i <= 16; i++) {
      const x = i * 16.6970588235;
      ctx.fillStyle = x <= s9Position ? "#a3eced" : "#d9191c";

      if (i % 2 === 1) {
        ctx.fillRect(x, lineY, 1, longTickHeight + 2);
        if ((i - 1) / 2 < labels.length) {
          ctx.fillText(labels[(i - 1) / 2], x, labelY + 8);
        }
      } else {
        ctx.fillRect(x, lineY, 1, tickHeight);
      }
    }
  }

  // Function to update signal strength
  function setSignalStrength(db) {
    db = Math.min(Math.max(db, -100), 0);
    const activeSegments = Math.round(((db + 100) * numberOfDots) / 100);

    drawSMeter(activeSegments);
  }


  function handleWheel(node) {
    function onWheel(event) {
      event.preventDefault();
      const delta = event.deltaY > 0 ? -1 : 1;
      const isShiftPressed = event.shiftKey;
      const isAltPressed = event.altKey;

      // Convert frequency to Hz for calculations
      let frequencyHz = Math.round(parseFloat(frequency) * 1e3);

      function adjustFrequency(freq, direction, shiftPressed, altPressed) {
        const step = currentTuneStep || (altPressed ? 10000 : shiftPressed ? 1000 : defaultStep);
        const lastDigits = freq % step;

        if (lastDigits === 0) {
          return freq + direction * step;
        } else if (direction > 0) {
          return Math.ceil(freq / step) * step;
        } else {
          return Math.floor(freq / step) * step;
        }
      }

      frequencyHz = adjustFrequency(frequencyHz, delta, isShiftPressed, isAltPressed);

      // Convert back to kHz and ensure 2 decimal places
      frequency = (frequencyHz / 1e3).toFixed(2);

      // Ensure frequency is not negative
      frequency = Math.max(0, parseFloat(frequency));

      frequencyInputComponent.setFrequency(frequencyHz);
      handleFrequencyChange({ detail: frequencyHz });
    }

    node.addEventListener("wheel", onWheel);

    return {
      destroy() {
        node.removeEventListener("wheel", onWheel);
      },
    };
  }

  // Bandwidth offset controls
  let bandwithoffsets = ["-1000", "-500", "-100", "+100", "+500", "+1000"];
  function handleBandwidthOffsetClick(bandwidthoffset) {
    bandwidthoffset = parseFloat(bandwidthoffset);
    const demodulationDefault = demodulationDefaults[demodulation].type;
    let [l, m, r] = audio.getAudioRange().map(FFTOffsetToFrequency);
    if (demodulationDefault === "USB") {
      r = Math.max(m, Math.min(m + getMaximumBandwidth(), r + bandwidthoffset));
    } else if (demodulationDefault === "LSB") {
      l = Math.max(m - getMaximumBandwidth(), Math.min(m, l - bandwidthoffset));
    } else {
      r = Math.max(0, Math.min(m + getMaximumBandwidth() / 2, r + bandwidthoffset / 2));
     l = Math.max(m - getMaximumBandwidth() / 2, Math.min(m, l - bandwidthoffset / 2));
    }
    let audioParameters = [l, m, r].map(frequencyToFFTOffset);
    const lOffset = l - 200;
    const mOffset = m - 750;
    const rOffset = r - 200;
    const audioParametersOffset = [lOffset, mOffset, rOffset].map(frequencyToFFTOffset);

    audio.setAudioRange(...audioParameters, ...audioParametersOffset);
    updatePassband();
  }

  // Toggle buttons and slides for audio
  function handleMuteChange() {
    mute = !mute;
    audio.setMute(mute);
  }

  function handleVolumeChange() {
    audio.setGain(Math.pow(10, (volume - 50) / 50 + 2.6));
  }

  function handleSquelchChange() {
    squelchEnable = !squelchEnable;
    audio.setSquelch(squelchEnable);
  }

  function handleSquelchMove() {
    audio.setSquelchThreshold(squelch);
  }

  function handleEnterKey(event) {
    if (event.key === "Enter") {
      event.preventDefault(); // Prevent the default action
      sendMessage();
    }
  }

  let NREnabled = false;
  let NBEnabled = false;
  let ANEnabled = false;
  let CTCSSSupressEnabled = false;
  function handleNRChange() {
    NREnabled = !NREnabled;
    audio.decoder.set_nr(NREnabled);
  }

  function handleNBChange() {
    NBEnabled = !NBEnabled;
    audio.nb = NBEnabled;
    audio.decoder.set_nb(NBEnabled);
  }

  function handleANChange() {
    ANEnabled = !ANEnabled;
    audio.decoder.set_an(ANEnabled);
  }

  function handleCTCSSChange() {
    CTCSSSupressEnabled = !CTCSSSupressEnabled;
    audio.setCTCSSFilter(CTCSSSupressEnabled);
    console.log("mD = " + Device.isMobile);
  }


  // This function was added to track band changes //
  // and makes the band buttons track along with frequency //
  // adjustments. //
  let prevBand,stepi = 0;

  function updateBandButton() {
      currentBand = -1;
      for (var i = 0; i < bandArray.length; i++) {
          if(frequency >= (bandArray[i].startFreq / 1000) && frequency <= (bandArray[i].endFreq / 1000) && ((bandArray[i].ITU === siteRegion) || bandArray[i].ITU === 123)) {
            currentBand = i;
              if(prevBand != currentBand) { currentTuneStep = bandArray[i].stepi };
          }  
     } 
     prevBand = currentBand;
  }



  // Regular updating UI elements:
  // Other user tuning displays
  //
  let updateInterval;
  let lastUpdated = 0;

  function updateTick() {
    power = (audio.getPowerDb() / 150) * 100 + audio.smeter_offset;
    powerPeak = (accumulator(power) / 150) * 100 + audio.smeter_offset;

    setSignalStrength(power);

    if (events.getLastModified() > lastUpdated) {
      const myRange = audio.getAudioRange();
      const clients = events.getSignalClients();
      // Don't show our own tuning
      // Find the id that is closest to myRange[i]
      const myId = Object.keys(clients).reduce((a, b) => {
        const aRange = clients[a];
        const bRange = clients[b];
        const aDiff = Math.abs(aRange[1] - myRange[1]);
        const bDiff = Math.abs(bRange[1] - myRange[1]);
        return aDiff < bDiff ? a : b;
      });
      delete clients[myId];
      waterfall.setClients(clients);
      requestAnimationFrame(() => {
        waterfall.updateGraduation();
        waterfall.drawClients();
      });
      lastUpdated = events.getLastModified();
    }
  }

  // Tune to the frequency when clicked
  let frequencyMarkerComponent;
  function handleFrequencyMarkerClick(event) {
    handleFrequencyChange({
      detail: event.detail.frequency,
      markerclick: true,
    });

    // Convert back to kHz and ensure 2 decimal places
    frequency = (event.detail.frequency / 1e3).toFixed(2);

    // Ensure frequency is not negative
    frequency = Math.max(0, parseFloat(frequency));

    frequencyInputComponent.setFrequency(event.detail.frequency);

    SetMode(event.detail.modulation);
    //demodulation = event.detail.modulation;
    //handleDemodulationChange();
  }

  // Permalink handling
  function updateLink() {
    const linkObj = {
      frequency: frequencyInputComponent.getFrequency().toFixed(0),
      modulation: demodulation,
    };
    frequency = (frequencyInputComponent.getFrequency() / 1e3).toFixed(2);
    const linkQuery = constructLink(linkObj);
    link = `${location.origin}${location.pathname}?${linkQuery}`;
    storeInLocalStorage(linkObj);
  }
  function handleLinkCopyClick() {
    copy(link);
  }

  let bookmarks = writable([]);
  let newBookmarkName = "";

  let messages = writable([]);
  let newMessage = "";
  let socket;

  let username = `user${Math.floor(Math.random() * 10000)}`;
  let showUsernameInput = false;

  function saveUsername() {
    localStorage.setItem("chatusername", username);
    showUsernameInput = false;
  }

  function editUsername() {
    showUsernameInput = true;
  }

  const formatMessage = (text) => {
    const now = new Date();
    return `${username}: ${text.substring(0, 500)}`; // Ensure message is capped at 25 chars
  };

  function addBookmark() {
    const [currentWaterfallL, currentWaterfallR] = waterfall.getWaterfallRange();

    const bookmark = {
      name: newBookmarkName,
      link: link,
      frequency: frequencyInputComponent.getFrequency(),
      demodulation: demodulation,
      // This section was added to store more settings in the bookmark //
      volume: volume,
      squelch: squelch,
      squelchEnable: squelchEnable,
      audioBufferDelay: audioBufferDelay,
      audioBufferDelayEnabled: audioBufferDelayEnabled,
      NREnabled: NREnabled,
      ANEnabled: ANEnabled,
      NBEnabled: NBEnabled,
      CTCSSSupressEnabled: CTCSSSupressEnabled,
      currentTuneStep: currentTuneStep,
      min_waterfall: min_waterfall,
      max_waterfall: max_waterfall,
      brightness: brightness,
      currentWaterfallR: currentWaterfallR,
      currentWaterfallL: currentWaterfallL,
      currentColormap: currentColormap,
      waterfallDisplay: waterfallDisplay,
      spectrumDisplay: spectrumDisplay,
      currentBandwidth: currentBandwidth,
      staticBandwidthEnabled: staticBandwidthEnabled,
    };

    frequency = (frequencyInputComponent.getFrequency() / 1e3).toFixed(2);
    bookmarks.update((currentBookmarks) => {
      const updatedBookmarks = [...currentBookmarks, bookmark];
      localStorage.setItem("bookmarks", JSON.stringify(updatedBookmarks));
      return updatedBookmarks;
    });
    newBookmarkName = "";
  }


  function goToBookmark(bookmark) {
    // Set frequency
    frequencyInputComponent.setFrequency(bookmark.frequency);
    handleFrequencyChange({ detail: bookmark.frequency });

    // Set demodulation
    demodulation = bookmark.demodulation;
    handleDemodulationChange(null, true);

    // This next section was added to restore more //
    // settings in a bookmark. 

    // Set Volume
    volume = bookmark.volume;
    handleVolumeChange();

    // Set Squelch
    audio.setSquelch(false);
    squelch = bookmark.squelch;
    squelchEnable = bookmark.squelchEnable;
    audio.setSquelch(squelchEnable);
    audio.setSquelchThreshold(squelch);

    // Begin code to store and restore additional //
    // WebSDR settings.  
    // Set Audio Buffer
    audioBufferDelayEnabled = false;
    if(bookmark.audioBufferDelayEnabled) {
      audioBufferDelay = bookmark.audioBufferDelay;
      audioBufferDelayEnabled = bookmark.audioBufferDelayEnabled;
    }

    // Set Noise Reduction
    audio.decoder.set_nr(false);
    NREnabled = bookmark.NREnabled;
    audio.decoder.set_nr(NREnabled);

    // Set Noise Blanker
    audio.decoder.set_nb(false);
    NBEnabled = bookmark.NBEnabled;
    audio.decoder.set_nb(NBEnabled);

    // Set Auto Notch
    audio.decoder.set_an(false);
    ANEnabled = bookmark.ANEnabled;
    audio.decoder.set_an(ANEnabled);

    // Set CTCSS
    CTCSSSupressEnabled = false;
    audio.setCTCSSFilter(CTCSSSupressEnabled);
    CTCSSSupressEnabled = bookmark.CTCSSSupressEnabled;
    audio.setCTCSSFilter(CTCSSSupressEnabled);

    // Set bandwidth
    if(bookmark.staticBandwidthEnabled) {
      handleBandwidthChange(bookmark.currentBandwidth);
      staticBandwidthEnabled = bookmark.staticBandwidthEnabled;
      currentBandwidth = bookmark.currentBandwidth;
    }


    // Set Tuning Step
    currentTuneStep = bookmark.currentTuneStep;
    handleTuningStep(currentTuneStep);
    // Set Waterfall brightness
    min_waterfall = bookmark.min_waterfall;
    max_waterfall = bookmark.max_waterfall;
    brightness = bookmark.brightness;
    handleMinMove();
    handleMaxMove();
    handleBrightnessMove();

    // Set Waterfall Display
    waterfallDisplay = !bookmark.waterfallDisplay;
    handleWaterfallChange();

    // Set Spectrum Display
    spectrumDisplay = !bookmark.spectrumDisplay;
    handleSpectrumChange();

    // Set Waterfall Size
    let [l, m, r] = audio.getAudioRange();
    const [waterfallL, waterfallR] = waterfall.getWaterfallRange();
    const offset = ((m - waterfallL) / (waterfallR - waterfallL)) * waterfall.canvasWidth;
    m = Math.min(waterfall.waterfallMaxSize - 512, Math.max(512, m));
    l = bookmark.currentWaterfallL;
    r = bookmark.currentWaterfallR;
    waterfall.setWaterfallRange(l, r);
    frequencyMarkerComponent.updateFrequencyMarkerPositions();
    updatePassband();

    // Set Waterfall Colormap
    currentColormap = bookmark.currentColormap;
    waterfall.setColormap(currentColormap);
  
  // Update the link
    updateLink();
  }


  function copyToClipboard(text) {
    try {
      navigator.clipboard.writeText(text).then(() => {
        console.log("Text copied to clipboard!");
      });
    } catch (err) {
      console.error("Clipboard write failed", err);
    }
  }

  function deleteBookmark(index) {
    bookmarks.update((currentBookmarks) => {
      const updatedBookmarks = currentBookmarks.filter((_, i) => i !== index);
      saveBookmarks(updatedBookmarks);
      return updatedBookmarks;
    });
  }

  function saveBookmarks(bookmarksToSave) {
    localStorage.setItem("bookmarks", JSON.stringify(bookmarksToSave));
  }

  let showBookmarkPopup,showModePopup,showBandPopup,showIFPopup = false;

  function toggleBookmarkPopup() {
    showBookmarkPopup = !showBookmarkPopup;
  }

  function toggleModePopup() {
    showModePopup = !showModePopup;
  }

  function toggleBandPopup() {
    showBandPopup = !showBandPopup;
  }

  function toggleIFPopup() {
    showIFPopup = !showIFPopup;
  }


  function toggleVFO() {
    if (vfoModeA) {
      vfo = "VFO B";
      vfoAFrequency = (frequency * 1000);
      vfoAMode = demodulation;
      frequencyInputComponent.setFrequency(vfoBFrequency);
      handleFrequencyChange({ detail: vfoBFrequency });
      SetMode(vfoBMode);
      updatePassband();
    }
      if(!vfoModeA) {
	vfo = "VFO A";
	vfoBFrequency = (frequency * 1000);
	vfoBMode = demodulation;
	frequencyInputComponent.setFrequency(vfoAFrequency);
        handleFrequencyChange({ detail: vfoAFrequency });
        SetMode(vfoAMode);
        updatePassband();
     }
     vfoModeA = !vfoModeA;
  }

  let currentStep = 0;
  let showTutorial = false;
  let isFirstTime = false;
  let highlightedElement = null;
  let highlightPosition = { top: 0, left: 0, width: 0, height: 0 };

  const tutorialSteps = [
    {
      selector: "#demodulator-select",
      content: "Welcome to PhantomSDR - This is the Tutorial.",
    },
    {
      selector: "#waterfall",
      content: "This is the Waterfall, the main part of a WebSDR where you see all signals visuallly.",
    },
    {
      selector: "#volume-slider",
      content: "Use this Slider to change the Volume.",
    },
    {
      selector: "#squelch-slider",
      content: "Use this Slider to change the Squelch.",
    },
    {
      selector: "#agc-selector",
      content: "Use these buttons to choose different AGC speeds.",
    },
    {
      selector: "#tuning-step-selector",
      content: "Use these buttons to change the tuning steps when using the mouse wheel.",
    },
    {
      selector: "#band-selector",
      content: "Use these buttons to choose specific bands.",
    },
    {
      selector: "#bandwidth-offset-selector",
      content: "This button is used to select a different bandwidth.",
    },
    {
      selector: "#audio-buffer-slider",
      content: "This button/slider allows the user to adjust the limits on the dynamic audio buffer.",
    },
    {
      selector: "#ft8-decoder",
      content: "This Button lets you Decode FT8 Signals, if you are on the proper Frequency",
    },
    {
      selector: "#smeter-tut",
      content: "This Section shows you the S-Meter, lets you Input the Frequency and shows the Mode with Filter Bandwidth.",
    },
    {
      selector: "#demodulationModes",
      content: "Use this Section to change the Demodulation Mode.",
    },
    {
      selector: "#mobile-fine-tuning-selector",
      content: "Use these buttons to fine tune the frequency.",
    },
    {
      selector: "#fine-tuning-selector",
      content: "Use these buttons to fine tune the frequency.",
    },
    {
      selector: "#static-bandwidth-selector",
      content: "Use these buttons to choose static IF filtering.",
    },
    {
      selector: "#zoom-controls",
      content: "Use these buttons to zoom in and out of the waterfall display.",
    },
    {
      selector: "#moreoptions",
      content: "These options allow you to enable things like CTCSS Supression, Noise Reduction and more.",
    },
    {
      selector: "#brightness-controls",
      content: "Adjust the brightness levels of the waterfall display.",
    },
    {
      selector: "#colormap-select",
      content: "Choose different color schemes for the waterfall.",
    },
    {
      selector: "#auto-adjust",
      content: "Toggle automatic adjustment of the waterfall display.",
    },
    {
      selector: "#waterfall-toggle",
      content: "Toggle Waterfall on and off.",
    },
    {
      selector: "#spectrum-toggle",
      content: "Turn the spectrum display on or off.",
    },
    {
      selector: "#bigger-waterfall",
      content: "Increase the size of the waterfall display.",
    },
    {
      selector: "#if-filter-popup-button",
      content: "This allows for the setting of static IF filters.",
    },
    {
      selector: "#band-popup-button",
      content: "This button opens the Bands menu and allows for the selection of different bands.",
    },
    {
      selector: "#mode-popup-button",
      content: "This button opens the Modes and allows for the selection of different modes.",
    },
    {
      selector: "#vfo-ab-toggle",
      content: "Use this to toggle VFO A/B.",
    },
    {
      selector: "#bookmark-button",
      content: "Click this to open the Bookmarks Menu.",
    },
    {
      selector: "#chat-box",
      content: "This is the Chatbox, where to communicae with other users and sending Frequencies",
    },
    {
      selector: "#chat-box",
      content: "Thank you for completing the Tutorial, now you can use the WebSDR as you wish. Enjoy!",
    },
  ];

  async function initTutorial() {
    if (!localStorage.getItem("TutorialComplete")) {
      await tick();
      const allElementsPresent = tutorialSteps.every((step) => document.querySelector(step.selector));
      if (allElementsPresent) {
        showTutorial = true;
        isFirstTime = true;
        updateHighlightedElement();
      } else {
        console.warn("Some tutorial elements are missing. Skipping tutorial.");
        localStorage.setItem("TutorialComplete", "true");
      }
    }
  }

  function updateHighlightedElement() {
    const { selector } = tutorialSteps[currentStep];
    highlightedElement = selector ? document.querySelector(selector) : null;
    if (highlightedElement) {
      var rect = highlightedElement.getBoundingClientRect();
      highlightPosition = {
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
        height: rect.height,
      };

      // Smooth scroll only if the element is not fully visible
      const elementTop = rect.top;
      const elementBottom = rect.bottom;
      const viewportHeight = window.innerHeight;

      if (elementTop < 0 || elementBottom > viewportHeight) {
        highlightedElement.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest",
        });
      }

      rect = highlightedElement.getBoundingClientRect();
      highlightPosition = {
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
        height: rect.height,
      };
    }
  }

  async function nextStep() {
    if (currentStep < tutorialSteps.length - 1) {
      currentStep += 1;
      await tick();
      updateHighlightedElement();
      if (currentStep == 7) {
        activeTab = "waterfall";
      }
    } else {
      endTutorial();
    }
  }

  function endTutorial() {
    showTutorial = false;
    localStorage.setItem("TutorialComplete", "true");
  }

  initTutorial();

  let backendPromise;
  onMount(async () => {
    if (!localStorage.getItem("TutorialComplete")) {
      await tick();
      const allElementsPresent = tutorialSteps.slice(1).every((step) => document.querySelector(step.selector));
      if (allElementsPresent) {
        isFirstTime = true;
        showTutorial = true;
        await updateHighlightedElement();
      } else {
        console.warn("Some tutorial elements are missing. Skipping tutorial.");
        localStorage.setItem("TutorialComplete", "true");
      }
    }

    waterfall.initCanvas({
      canvasElem: waterfallCanvas,
      spectrumCanvasElem: spectrumCanvas,
      graduationCanvasElem: graduationCanvas,
      bandPlanCanvasElem: bandPlanCanvas,
      tempCanvasElem: tempCanvas,
    });

    backendPromise = init();

    await backendPromise;

    waterfall.setFrequencyMarkerComponent(frequencyMarkerComponent);

    // Enable after connection established
    [...document.getElementsByTagName("button"), ...document.getElementsByTagName("input")].forEach((element) => {
      element.disabled = false;
    });

    // Enable WBFM option if bandwidth is wide enough
    if (audio.trueAudioSps > 170000) {
      demodulators.push("WBFM");
      demodulators = demodulators;
      bandwithoffsets.unshift("-100000");
      bandwithoffsets.push("+100000");
      bandwithoffsets = bandwithoffsets;
    }

    frequencyInputComponent.setFrequency(FFTOffsetToFrequency(audio.getAudioRange()[1]));
    frequencyInputComponent.updateFrequencyLimits(audio.baseFreq, audio.baseFreq + audio.totalBandwidth);

    username = localStorage.getItem("chatusername") || "";
    if (!username) {
      console.log("No Username. Setting a random username.");
      username = `user${Math.floor(Math.random() * 10000)}`;
    }
    showUsernameInput = !username;

    demodulation = audio.settings.defaults.modulation;

    const updateParameters = (linkParameters) => {
      frequencyInputComponent.setFrequency(linkParameters.frequency);
      if (frequencyInputComponent.getFrequency() === linkParameters.frequency) {
        handleFrequencyChange({ detail: linkParameters.frequency });
      }
      if (demodulators.indexOf(linkParameters.modulation) !== -1) {
        demodulation = linkParameters.modulation;
        handleDemodulationChange({}, true);
      }
      frequencyMarkerComponent.updateFrequencyMarkerPositions();
    };

    /* const storageParameters = loadFromLocalStorage()
    updateParameters(storageParameters) */
    const linkParameters = parseLink(location.search.slice(1));
    updateParameters(linkParameters);

    // Refresh all the controls to the initial value
    updatePassband();
    passbandTunerComponent.updatePassbandLimits();
    //handleWaterfallColormapSelect();
    initializeColormap();
    handleDemodulationChange({}, true);
    handleSpectrumChange();
    handleVolumeChange();
    updateLink();
    userId = generateUniqueId();
    let [l, m, r] = audio.getAudioRange().map(FFTOffsetToFrequency);

    const storedBookmarks = localStorage.getItem("bookmarks");
    if (storedBookmarks) {
      bookmarks.set(JSON.parse(storedBookmarks));
    }

    updateInterval = setInterval(() => requestAnimationFrame(updateTick), 200);

    window["spectrumAudio"] = audio;
    window["spectrumWaterfall"] = waterfall;

    socket = new WebSocket(window.location.origin.replace(/^http/, "ws") + "/chat");

    chatContentDiv = document.getElementById("chat_content");

    socket.onmessage = (event) => {
      if (event.data.startsWith("Chat history:")) {
        const history = event.data.replace("Chat history:\n", "").trim();
        if (history) {
          const historyMessages = history.split("\n").map((line, index) => ({
            id: Date.now() + index,
            text: line.trim(),
            isCurrentUser: line.startsWith(userId),
            timestamp: Date.now() - (history.length - index) * 1000, // Approximate timestamp
          }));
          messages.set(historyMessages);
        }
      } else {
        const receivedMessageObject = {
          id: Date.now(),
          text: event.data.trim(),
          isCurrentUser: event.data.startsWith(userId),
          timestamp: Date.now(),
        };
        messages.update((currentMessages) => [...currentMessages, receivedMessageObject]);
      }
      scrollToBottom();
    };

    const middleColumn = document.getElementById("middle-column");
    const chatBox = document.getElementById("chat-box");

    function setWidth() {
      const width = middleColumn.offsetWidth;
      document.documentElement.style.setProperty("--middle-column-width", `1372px`);
    }

    setWidth();
    window.addEventListener("resize", setWidth);

    eventBus.subscribe("frequencyClick", ({ frequency, mode }) => {
      handleFrequencyClick(frequency, mode);
    });

    eventBus.subscribe("frequencyChange", (event) => {
      frequencyInputComponent.setFrequency(event.detail);
      frequency = (event.detail / 1e3).toFixed(2);
      handleFrequencyChange(event);
    });

    eventBus.subscribe("setMode", (mode) => {
      SetMode(mode);
    });

    return () => {
      window.removeEventListener("resize", setWidth);
    };
  });

  function sendMessage() {
    if (newMessage.trim() && username.trim()) {
      const messageObject = {
        cmd: "chat",
        message: newMessage.trim(),
        username: username,
      };
      socket.send(JSON.stringify(messageObject));
      newMessage = "";
      scrollToBottom();
    }
  }

  function pasteFrequency() {
    const frequency = frequencyInputComponent.getFrequency();
    const currentDemodulation = demodulation;
    const frequencyText = `[FREQ:${Math.round(frequency)}:${currentDemodulation}]`;
    newMessage = newMessage + " " + frequencyText; // Append the frequency to the current message
  }

  function shareFrequency() {
    const frequency = frequencyInputComponent.getFrequency();
    const currentDemodulation = demodulation;
    const shareMessage = `[FREQ:${Math.round(frequency)}:${currentDemodulation}] Check out this frequency!`;
    const messageObject = {
      cmd: "chat",
      message: shareMessage,
      userid: userId,
    };
    socket.send(JSON.stringify(messageObject));
    scrollToBottom();
  }

  let chatMessages;

  function scrollToBottom() {
    if (chatMessages) {
      chatMessages.scrollTo({
        top: chatMessages.scrollHeight,
        behavior: "smooth",
      });
    }
  }

  $: {
    if ($messages) {
      setTimeout(scrollToBottom, 100);
    }
  }

  // Function to handle clicking on a shared frequency
  function handleFrequencyClick(frequency, mode) {
    demodulation = mode;
    const numericFrequency = parseInt(frequency, 10);
    if (isNaN(numericFrequency)) {
      console.error("Invalid frequency:", frequency);
      return;
    }
    frequencyInputComponent.setFrequency(numericFrequency);
    handleFrequencyChange({ detail: numericFrequency });

    handleDemodulationChange(null, true);
    updateLink();
  }

  function sanitizeHtml(html) {
    const div = document.createElement("div");
    div.textContent = html;
    return div.innerHTML;
  }

  function formatFrequencyMessage(text) {
    const regex = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) (.+?): (.+)$/;
    const match = text.match(regex);
    if (match) {
      const [_, timestamp, username, message] = match;
      const freqRegex = /\[FREQ:(\d+):([\w-]+)\]/;
      const freqMatch = message.match(freqRegex);
      if (freqMatch) {
        const [fullMatch, frequency, demodulation] = freqMatch;
        const [beforeFreq, afterFreq] = message.split(fullMatch).map((part) => formatLinks(sanitizeHtml(part)));
        return {
          isFormatted: true,
          timestamp: sanitizeHtml(timestamp),
          username: sanitizeHtml(username),
          frequency: parseInt(frequency, 10),
          demodulation: sanitizeHtml(demodulation),
          beforeFreq,
          afterFreq,
        };
      }
      return {
        isFormatted: false,
        timestamp: sanitizeHtml(timestamp),
        username: sanitizeHtml(username),
        parts: formatLinks(sanitizeHtml(message)),
      };
    }
    return {
      isFormatted: false,
      parts: formatLinks(sanitizeHtml(text)),
    };
  }

  function formatLinks(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = urlRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({
          type: "text",
          content: text.slice(lastIndex, match.index),
        });
      }
      parts.push({ type: "link", content: match[0], url: match[0] });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push({ type: "text", content: text.slice(lastIndex) });
    }

    return parts;
  }

  function renderParts(parts) {
    return parts
      .map((part) => {
        if (part.type === "link") {
          return `<a href="${sanitizeHtml(part.url)}" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:underline">${sanitizeHtml(part.content)}</a>`;
        }
        return part.content;
      })
      .join("");
  }

  onDestroy(() => {
    // Stop everything
    clearInterval(updateInterval);
    audio.stop();
    waterfall.stop();
    socket.close();
  });

  //Time
  function startTime() {
    var Digital=new Date()
    var hours=Digital.getUTCHours()
    var minutes=Digital.getUTCMinutes()
    var seconds=Digital.getUTCSeconds()
      if (hours>=24){
          hours="0"
          //this makes the first hour of the day display as "00" UTC (the 2nd "0" is added below).
      }
      // Add leading zeros when needed:
      if (hours<=9)
          hours="0"+hours
      if (minutes<=9)
          minutes="0"+minutes
     if (seconds<=9)
          seconds="0"+seconds
  
     var LDigital=new Date()
     var l_hours=LDigital.getHours()
     var l_minutes=LDigital.getMinutes()
     var l_seconds=LDigital.getSeconds()
      if (l_hours>=24){
          l_hours="0"
          //this makes the first hour of the day display as "00" UTC (the 2nd "0" is added below).
      }
      // Add leading zeros when needed:
      if (l_hours<=9)
          l_hours="0"+l_hours
      if (l_minutes<=9)
          l_minutes="0"+l_minutes
      if (l_seconds<=9)
          l_seconds="0"+l_seconds
          document.getElementById('time').innerHTML =
          hours+":"+minutes+":"+seconds+" (UTC) ⬌ "+l_hours+":"+l_minutes+":"+l_seconds+" (Local)"
      let t = setTimeout(startTime, 500);
      }
  function checkTime(i) {
          if (i < 10) {i = "0" + i};  // add zero in front of numbers < 10
          return i;
  }

  // Added to allow the user to adjust the dynamic audio //
  // buffer limits in the playAudio(pcmArray) function inside //
  // audio.js - the variables inside audio.js to allow this adjustment //
  // are bufferLimit = 0.5 and bufferThreshold = 0.1 //
  function handleAudioBufferDelayMove(newAudioBufferDelay) {
    if(newAudioBufferDelay > 5) { newAudioBufferDelay = 1;}
    audioBufferDelay = newAudioBufferDelay;
    if (audioBufferDelay === 1) { audioBufferDelayEnabled = false; }
      else { audioBufferDelayEnabled = true; }
    switch (audioBufferDelay) {
      case 1:
        audio.setAudioBufferDelay(0.5,0.1);
      break;
      case 2:
        audio.setAudioBufferDelay(1.0,0.2);
      break;
      case 3:
        audio.setAudioBufferDelay(1.5,0.3);
      break;
      case 4:
        audio.setAudioBufferDelay(2.0,0.4);
      break;
      case 5:
        audio.setAudioBufferDelay(2.5,0.5);
      break;
    }
}

// This function was added to enable AGC to the client //
function handleAGCChange(newAGC) {

  currentAGC = newAGC;
  switch(newAGC) {
    case 0:
      audio.setAGCStateSpeed(false,0);
      break;
    case 1:
     audio.setAGCStateSpeed(true,1);
     break;
    case 2:
      audio.setAGCStateSpeed(true,2);
      break;
    case 3:
      audio.setAGCStateSpeed(true,3);
      break;
  }
}

// This Band Selection function handles band changes sent from the Band Selection section of the main page //
// The 7.15255 float below is (total_watefall_span / maximum_frequency_sampled) // 
function handleBandChange(newBand) {
  let centerFreq = parseFloat((((bandArray[newBand].endFreq - bandArray[newBand].startFreq) /2 ) + bandArray[newBand].startFreq)); 
  let waterfallEndSpan = parseFloat((bandArray[newBand].endFreq / 7.15255));
  let waterfallStartSpan = parseFloat((bandArray[newBand].startFreq / 7.15255));
  let waterfallSpan = ((waterfallEndSpan - waterfallStartSpan) / 2);
  waterfallSpan = waterfallSpan + (waterfallSpan * 0.01); // 10% above band edge
  frequencyInputComponent.setFrequency(centerFreq);
  handleFrequencyChange({ detail: centerFreq });
  updatePassband();
  let [l, m, r] = audio.getAudioRange();
  const [waterfallL, waterfallR] = waterfall.getWaterfallRange();
  const offset = ((m - waterfallL) / (waterfallR - waterfallL)) * waterfall.canvasWidth;
  m = Math.min(waterfall.waterfallMaxSize - 512, Math.max(512, m));
  l = Math.floor(m - 512);
  r = Math.ceil(m + 512);
  // Below sets the waterfall brightness //
  min_waterfall = -40;
  max_waterfall = 120;
  handleMinMove();
  handleMaxMove();
  // End waterfall brightness // 
  l -= waterfallSpan;
  r += waterfallSpan;
  frequencyInputComponent.setFrequency(centerFreq);
  handleFrequencyChange({ detail: centerFreq });
  waterfall.setWaterfallRange(l, r);
  frequencyMarkerComponent.updateFrequencyMarkerPositions();
  updatePassband();
  currentBand = newBand;
}
// End of Band Selection Function //


// Function to publish bandwidth buttons //
let newBandwidth = ["250","500","1800","2400","2800","3000","3500","4000","4500","5000","10000","12000"]
let bwDiff = 0;
function handleBandwidthChange(newBW) {
  staticBandwidthEnabled = !staticBandwidthEnabled;
  currentBandwidth = newBW;
  // Set Mode
  SetMode(demodulation);
  // Set a starting point so we can calculate the offset from //
  // the default setting for the particular mode //
  switch (demodulation) {
    case "CW":
      bwDiff = Math.abs(newBW - 500);
      break;
    case "LSB":
      bwDiff = (newBW - 2700);
      break;
    case "USB":
      bwDiff = (newBW - 2700); 
      break;
    case "AM":
      bwDiff = (newBW - 9000);
      break;
    case "FM":
      bwDiff = (newBW - 10000);
      break;
  }
  handleBandwidthOffsetClick(bwDiff);
  if(!staticBandwidthEnabled) { 
    SetMode(demodulation);
    currentBandwidth = 0;
  }
}


// Begin Fine Tuning Steps Function
//Function created to create a fine tune button //
// for mobile users //
let mobilefinetuningsteps = ["+0.1","+0.5","+1","+5","+10","-0.1","-0.5","-1","-5","-10","0"];
// For desktop users
let finetuningsteps = ["-10","-5","-1","-0.5","-0.1","0","+0.1","+0.5","+1","+5","+10"];

function handleFineTuningStep(finetuningstep) {
  finetuningstep = (parseFloat(finetuningstep) * 1e3);
  if(finetuningstep == 0) { frequency = Math.round(frequency)}
  frequencyInputComponent.setFrequency((frequency * 1e3) + finetuningstep);
  handleFrequencyChange({ detail: ((frequency * 1e3) + finetuningstep) });
  updatePassband();
}
// End Fine Tuning Steps Function //

// Begin Tuning Steps Function
  function handleTuningStep(tuningstep) {
    //parseFloat(tuningstep);
    currentTuneStep = tuningstep;
  }
// End Tuning Steps Function //


  // Mobile gestures
  // Pinch = Mousewheel = Zoom
  let pinchX = 0;
  function handleWaterfallPinchStart(e) {
    pinchX = 0;
  }
  function handleWaterfallPinchMove(e) {
    const diff = e.detail.scale - pinchX;
    pinchX = e.detail.scale;
    const scale = 1 - Math.abs(e.detail.srcEvent.movementX) / waterfallCanvas.getBoundingClientRect().width;
    const evt = e.detail.srcEvent;
    evt.coords = { x: e.detail.center.x };
    evt.deltaY = -Math.sign(diff);
    evt.scaleAmount = scale;
    waterfall.canvasWheel(evt);
    updatePassband();
    // Prevent mouseup event from firing
    waterfallDragTotal += 2;
  }
  // Pan = Mousewheel = waterfall dragging
  function handleWaterfallPanMove(e) {
    if (e.detail.srcEvent.pointerType === "touch") {
      waterfall.mouseMove(e.detail.srcEvent);
      updatePassband();
    }
  }
  
</script>

<svelte:window on:mousemove={handleWindowMouseMove} on:mouseup={handleWindowMouseUp} />

<main class="custom-scrollbar">
  <div class="h-screen overflow-hidden flex flex-col min-h-screen">
    <div class="w-full sm:h-screen overflow-y-scroll sm:w-1/2 xl:w-1/3 lg:w-1/4 sm:transition-all sm:ease-linear sm:duration-100" style="width:100%;">
      <div class="min-h-screen bg-custom-dark text-gray-200" style="padding-top: 5px;">
        <div class="max-w-screen-lg mx-auto">
          <div class="xl:pt-1"></div>

          <!--Titel Box with Admin Infos, to be personalized-->
          <div class="flex flex-col rounded p-2 justify-center" id="chat-column">
            <div class="p-3 sm:p-5 flex flex-col bg-gray-800 border border-gray-700 rounded-lg w-full mb-8" id="chat-box" style="opacity: 0.85;">
              <!-- Header -->
              <h4 class="text-xl sm:text-2xl font-semibold text-gray-100 mb-2 sm:mb-4">
                <span>
		  {siteInformation}<a href="https://k7fry.com/grid/?qth={siteGridSquare}" target="new" style="color:rgba(0, 225, 255, 0.993)">{siteGridSquare}</a>.
                </span>
              </h4>

              <!-- Details -->
	      <span class="text-white text-xs sm:text-sm mr-4 mb-2 sm:mb-0">
		{siteSysop} e-mail:
		<a href="mailto:{siteSysopEmailAddress}?subject=WebSDR" style="color:rgba(0, 225, 255, 0.993)">{siteSysopEmailAddress}</a> - Visit other PhantomSDR+ WebSDR servers at:&nbsp;
		<a href="https://sdr-list.xyz/" target="_blank" style="color:#FF0000;">sdr-list.xyz</a>
	      </span>

<span>&nbsp;</span>

<div class="flex justify-center w-full">

<!-- Frequency Lookup -->

Frequency Lookup :&nbsp; 
                <button class="glass-button text-white py-1 px-3 mb-2 lg:mb-0 rounded-lg text-xs sm:text-sm" style="color:rgba(0, 225, 255, 0.993)" onClick="window.open('http://www.mwlist.org/mwlist_quick_and_easy.php?area=1&amp;kHz='+{Math.round(frequency)},'websdrstationinfo','');">
                  <span class="icon">MW List</span>
                  </button>
&nbsp;&nbsp;&nbsp;
                <button class="glass-button text-white py-1 px-3 mb-2 lg:mb-0 rounded-lg text-xs sm:text-sm" style="color:rgba(0, 225, 255, 0.993)" onClick="window.open('http://www.short-wave.info/index.php?freq='+{Math.round(frequency)}+'&amp;timbus=NOW&amp;ip=179&amp;porm=4','websdrstationinfo','')">
                  <span class="icon">Shortwave List</span>
                  </button>
&nbsp;&nbsp;&nbsp;
<form method="get" target="_blank" action="https://www.qrzcq.com" >
                Callsign lookup: &nbsp;&nbsp;&nbsp;
                <input type="text" name="q" value="" size="6" style=" background-color: #2D3B4F; color: rgb(0, 255, 255); border-style: groove; border-color: grey; text-align:center; font-size: 84%;" on:click={() => this.form.q.select().focus()}>&nbsp;&nbsp;&nbsp;
                <input type="hidden" name="action" value="search" >
                <input class="glass-button text-white py-1 px-3 mb-2 lg:mb-0 rounded-lg text-xs sm:text-sm" type="submit" name="page" value="Search" />
                </form>

</div>
<!-- End Frequency Lookup -->
              

              <!-- Collapsible Menu -->
              <div>
                <!-- Toggle Button -->
                <center>
		  <button class="bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg flex items-center transition-colors ring-2 ring-blue-500 s-XsEmFtvddWTw" on:click={() => toggleMenu()} style="margin-top: 15px;">
                    <span id="menu-toggle-label">Open Additional Info</span>
                  </button>
                </center>

                <!-- Collapsible Content -->
                <div id="collapsible-menu" class="hidden mt-3 bg-gray-700 p-3 rounded">
                  <ul style="font-size: 0.91rem; text-align: left;">
                    <b>Setup &amp; Configuration:</b>
                    <br />
		    <span style="/*text-decoration: line-through*/"><b>Hardware:</b> {siteHardware}</span>
                    <br /> <br />
		    <span style="/*text-decoration: line-through*/"><b>Software:</b> {siteSoftware}</span>
                    <br /><br />
<span style="/*text-decoration: line-through*/"><b>Note:</b>
                    <br />
		    {siteNote}
                    <br />                    
                    <br />
                    <div style="font-weight: bold;">Current band propagation statistics:</div>
                    <div style="display: flex; align-items: center; margin-top: 10px;">
                      <a href="https://www.hamqsl.com/solar.html" title="Click for more information">
                        <img alt="Solar propagation" src="https://www.hamqsl.com/solar101vhf.php" />
                      </a>
                      <br />
                    </div>
                    <br />
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <style>
            .hidden {
              display: none;
            }
          </style>
          <!--End of Titel Box -->

          <!--Beginn of Waterfall -->
          <div class="flex justify-center w-full">
            <div class="w-full" id="outer-waterfall-container">
              <div style="image-rendering:pixelated;" class="w-full xl:rounded-lg peer overflow-hidden" id="waterfall">
                <canvas class="w-full bg-black peer {spectrumDisplay ? 'max-h-40' : 'max-h-0'}" bind:this={spectrumCanvas} on:wheel={handleWaterfallWheel} on:click={passbandTunerComponent.handlePassbandClick} width="1024" height="128"></canvas>
                <canvas
                  class="w-full bg-black {waterfallDisplay ? 'block' : 'hidden'}"
                  bind:this={waterfallCanvas}
                  use:pinch
                  on:pinchstart={handleWaterfallPinchStart}
                  on:pinchmove={handleWaterfallPinchMove}
                  use:pan
                  on:panmove={handleWaterfallPanMove}
                  on:wheel={handleWaterfallWheel}
                  on:mousedown={handleWaterfallMouseDown}
                  width="1024"
                ></canvas>
                <canvas class="hidden" bind:this={tempCanvas} width="1024" height="1024"></canvas>
                <FrequencyInput bind:this={frequencyInputComponent} on:change={handleFrequencyChange}></FrequencyInput>

                <FrequencyMarkers bind:this={frequencyMarkerComponent} on:click={passbandTunerComponent.handlePassbandClick} on:wheel={handleWaterfallWheel} on:markerclick={handleFrequencyMarkerClick}></FrequencyMarkers>
                <canvas
                  class="w-full bg-black peer"
                  bind:this={graduationCanvas}
                  on:wheel={handleWaterfallWheel}
                  on:click={passbandTunerComponent.handlePassbandClick}
                  on:mousedown={(e) => passbandTunerComponent.handleMoveStart(e, 1)}
                  on:touchstart={passbandTunerComponent.handleTouchStart}
                  on:touchmove={passbandTunerComponent.handleTouchMove}
                  on:touchend={passbandTunerComponent.handleTouchEnd}
                  width="1024"
                  height="20"
                ></canvas>
                <PassbandTuner on:change={handlePassbandChange} on:wheel={handleWaterfallWheel} bind:this={passbandTunerComponent}></PassbandTuner>
                <canvas
                  class="w-full bg-black peer"
                  bind:this={bandPlanCanvas}
                  on:wheel={handleWaterfallWheel}
                  on:click={passbandTunerComponent.handlePassbandClick}
                  on:mousedown={(e) => passbandTunerComponent.handleMoveStart(e, 1)}
                  on:touchstart={passbandTunerComponent.handleTouchStart}
                  on:touchmove={passbandTunerComponent.handleTouchMove}
                  on:touchend={passbandTunerComponent.handleTouchEnd}
                  width="1024"
                  height="20"
                >
                </canvas>
              </div>
            </div>
          </div>

          <div class="absolute inset-0 z-20 bg-black bg-opacity-40 backdrop-filter backdrop-blur-sm transition-opacity duration-300 ease-in-out cursor-pointer flex justify-center items-center" id="startaudio">
            <div class="text-center p-4 pointer-events-none">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mx-auto mb-2 text-white opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
              <p class="text-white text-lg font-medium">Tap to enable audio</p>
            </div>
          </div>

          {#if showTutorial}
            <div class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center" on:click|self={nextStep} transition:fade={{ duration: 300 }}>
              {#key currentStep}
                {#if highlightedElement}
                  <div
                    class="absolute bg-blue-500 bg-opacity-20 border-2 border-blue-500 transition-all duration-300 ease-in-out pointer-events-none"
                    style="
                    top: {highlightPosition.top}px;
                    left: {highlightPosition.left}px;
                    width: {highlightPosition.width}px;
                    height: {highlightPosition.height}px;
                  "
                    transition:scale={{ duration: 300, start: 0.95 }}
                  ></div>
                {/if}
              {/key}

              <div
                class="fixed bottom-4 left-4 right-4 sm:left-1/2 sm:right-auto sm:transform sm:-translate-x-1/2 bg-gray-800 text-white p-4 sm:p-6 rounded-lg shadow-lg max-w-md text-center backdrop-filter backdrop-blur-lg bg-opacity-90 border border-gray-700"
                transition:fly={{ y: 50, duration: 300 }}
              >
                <h3 class="text-lg sm:text-xl font-semibold mb-2">
                  Step {currentStep + 1} of {tutorialSteps.length}
                </h3>
                <p class="mb-4 text-sm sm:text-lg">
                  {tutorialSteps[currentStep].content}
                </p>
                <div class="flex flex-col sm:flex-row justify-between space-y-2 sm:space-y-0 sm:space-x-4">
                  <button class="w-full sm:w-auto px-4 sm:px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50" on:click|stopPropagation={endTutorial}> Skip Tutorial </button>
                  <button class="w-full sm:w-auto px-4 sm:px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50" on:click|stopPropagation={nextStep}>
                    {currentStep < tutorialSteps.length - 1 ? "Next" : "Finish"}
                  </button>
                </div>
              </div>
            </div>
          {/if}


<!-- Begin Waterfall Controls Section  -->

	 <div class="flex flex-col xl:flex-row rounded p-5 justify-center rounded w-full mb-2" id="middle-column">
            <div class="p-5 flex flex-col items-center bg-gray-800 lg:border lg:border-gray-700 rounded-none rounded-t-lg lg:rounded-none lg:rounded-l-lg" style="opacity: 0.95;">

<h3 class="text-white text-lg font-semibold mb-4">Waterfall Controls</h3>

              <div class="w-full mb-6">
                <div id="brightness-controls" class="flex items-center justify-between mb-2">
                  <span class="text-gray-300 text-sm w-10">Min:</span>
                  <div class="slider-container w-48 mx-2">
                    <input type="range" bind:value={min_waterfall} min="-100" max="255" step="1" class="glass-slider w-full" on:input={handleMinMove} />
                  </div>
                  <span class="text-gray-300 text-sm w-10 text-right">{min_waterfall}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-gray-300 text-sm w-10">Max:</span>
                  <div class="slider-container w-48 mx-2">
                    <input type="range" bind:value={max_waterfall} min="0" max="255" step="1" class="glass-slider w-full" on:input={handleMaxMove} />
                  </div>
                  <span class="text-gray-300 text-sm w-10 text-right">{max_waterfall}</span>
                </div>
              </div>

              <div class="w-full mb-6">
                <div id="colormap-select" class="relative">
                  <select bind:value={currentColormap} on:change={handleWaterfallColormapSelect} class="glass-select block w-full pl-3 pr-10 py-2 text-sm rounded-lg text-gray-200 appearance-none focus:outline-none">
                    {#each availableColormaps as colormap}
                      <option value={colormap}>{colormap}</option>
                    {/each}
                  </select>
                  <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
                    <svg class="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                      <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                    </svg>
                  </div>
                </div>
              </div>


<div class="w-full mb-6">
<h3 class="text-white text-lg font-semibold mb-2">Zoom</h3>
                      <div id="zoom-controls" class="grid grid-cols-4 gap-2">
                        {#each [{ action: "+", title: "Zoom in", icon: "zoom-in", text: "In" }, { action: "-", title: "Zoom out", icon: "zoom-out", text: "Out" }, { action: "max", title: "Zoom to max", icon: "maximize", text: "Max" }, { action: "min", title: "Zoom to min", icon: "minimize", text: "Min" }] as { action, title, icon, text }}
                          <button class="retro-button text-white font-bold h-10 text-sm rounded-md flex items-center justify-center border border-gray-600 shadow-inner transition-all duration-200 ease-in-out bg-gray-700 hover:bg-gray-600" on:click={(e) => handleWaterfallMagnify(e, action)} {title}>
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                              {#if icon === "zoom-in"}
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                <line x1="11" y1="8" x2="11" y2="14" />
                                <line x1="8" y1="11" x2="14" y2="11" />
                              {:else if icon === "zoom-out"}
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                <line x1="8" y1="11" x2="14" y2="11" />
                              {:else if icon === "maximize"}
                                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                              {:else if icon === "minimize"}
                                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                              {/if}
                            </svg>
                            <span>{text}</span>
                          </button>
                        {/each}
                      </div>
		      <hr class="border-gray-600 my-2" />
                    </div>

<!-- END -->

<!-- START of waterfal control buttons -->
{#if buttons }
<div class="w-full mb-6">
<div class="grid grid-cols-4 gap-2">
        <button id="waterfall-toggle" class="retro-button text-sm text-white font-bold h-10 text-base rounded-md flex items-center justify-center border border-gray-600 shadow-inner transition-all duration-200 ease-in-out {waterfallDisplay === true ? 'bg-blue-600 pressed scale-95' : 'bg-gray-700 hover:bg-gray-600'}" on:click={handleWaterfallChange} title="Waterfall Toggle">
                          Waterfall
			  </button>

        <button id="spectrum-toggle" class="retro-button text-sm text-white font-bold h-10 text-base rounded-md flex items-center justify-center border border-gray-600 shadow-inner transition-all duration-200 ease-in-out {spectrumDisplay === true ? 'bg-blue-600 pressed scale-95' : 'bg-gray-700 hover:bg-gray-600'}" on:click={handleSpectrumChange} title="Spectrum Toggle">
	                   Spectrum
			   </button>
	<button id="auto-adjust" class="retro-button text-sm text-white font-bold h-10 text-base rounded-md flex items-center justify-center border border-gray-600 shadow-inner transition-all duration-200 ease-in-out {autoAdjustEnabled === true ? 'bg-blue-600 pressed scale-95' : 'bg-gray-700 hover:bg-gray-600'}" on:click={() => handleAutoAdjust()} title="Auto Adjust">                                                                         Auto Adjust
                          </button>
			          <button id="bigger-waterfall" class="retro-button text-sm text-white font-bold h-10 text-base rounded-md flex items-center justify-center border border-gray-600 shadow-inner transition-all duration-200 ease-in-out {biggerWaterfall === true ? 'bg-blue-600 pressed scale-95' : 'bg-gray-700 hover:bg-gray-600'}" on:click={handleWaterfallSizeChange} title="Height (+)">                                             Height (+)
                          </button>
</div>
<hr class="border-gray-600 my-2" />
                  </div>

{:else}
<!-- END of Waterfall Control Buttons -->

              <div class="w-full mb-6">
                <div class="grid grid-cols-1 sm:grid-cols-4 gap-2">
                 <div id="waterfall-toggle" class="flex flex-col items-center">
                    <span class="text-sm text-gray-300 mb-1 text-center">Waterfall</span>
                    <label class="toggle-switch">
                    {#if (waterfallDisplay)}
                      <input type="checkbox" checked on:change={handleWaterfallChange} />
                       {:else}
                       <input type="checkbox" on:change={handleWaterfallChange} />
                       {/if}
                      <span class="toggle-slider"></span>
                    </label>
                  </div>

                   <div id="spectrum-toggle" class="flex flex-col items-center">
                    <span class="text-sm text-gray-300 mb-1">Spectrum</span>
                    <label class="toggle-switch">
                     {#if (spectrumDisplay)}
                      <input type="checkbox" checked on:change={handleSpectrumChange} />
                       {:else}
                       <input type="checkbox" on:change={handleSpectrumChange} />
                       {/if}
                      <span class="toggle-slider"></span>
                    </label>
                  </div>

                <div id="auto-adjust" class="flex flex-col items-center">
                    <span class="text-sm text-gray-300 mb-1">Auto Adjust</span>
                    <label class="toggle-switch">
                      <input type="checkbox" on:change={() => handleAutoAdjust()} />
                      <span class="toggle-slider"></span>
                    </label>
                  </div>

                  <div id="bigger-waterfall" class="flex flex-col items-center">
                    <span class="text-sm text-gray-300 mb-1 text-center">Height (+)</span>
                    <label class="toggle-switch">
                      <input type="checkbox" on:change={handleWaterfallSizeChange} />
                      <span class="toggle-slider"></span>
                    </label>
                  </div>
                </div>
                <hr class="border-gray-600 my-2" />
              </div>
{/if}

              <!-- Decoder Options -->
              <div class="w-full mt-6">
                <h3 class="text-white text-lg font-semibold mb-2">Decoder Options</h3>
                <div class="flex justify-center gap-4">
                  <button class="bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg flex items-center transition-colors {!ft8Enabled ? 'ring-2 ring-blue-500' : ''}" on:click={(e) => handleFt8Decoder(e, false)}> None </button>
                  <button id="ft8-decoder" class="bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg flex items-center transition-colors {ft8Enabled ? 'ring-2 ring-blue-500' : ''}" on:click={(e) => handleFt8Decoder(e, true)}> FT8 </button>
                </div>
              </div>

              <!-- FT8 Messages List -->
              {#if ft8Enabled}
                <div class="bg-gray-700 rounded-lg p-4 mt-6">
                  <div class="flex justify-between items-center mb-3 text-sm">
                    <h4 class="text-white font-semibold">FT8 Messages</h4>
                    <span class="text-gray-300 pl-4 lg:pl-0" id="farthest-distance">Farthest: 0 km</span>
                  </div>
                  <div class="text-gray-300 overflow-auto max-h-40 custom-scrollbar pr-2">
                    <div id="ft8MessagesList">
                      <!-- Dynamic content populated here -->
                    </div>
                  </div>
                </div>
              {/if}
</div>

            <div class="flex flex-col items-center bg-gray-800 p-6 border-l-0 border-r-0 border border-gray-700" style="opacity: 0.95;">
              <div class="bg-black rounded-lg p-8 min-w-80 lg:min-w-0 lg:p-4 mb-4 w-full" id="smeter-tut">
                <div class="flex flex-col sm:flex-row items-center justify-between gap-4">
		  <div class="flex flex-col items-center text-sm">
<input class="text-4xl h-16 w-48 text-center bg-black text-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-500 rounded-lg mb-2"
                      type="text"
                      bind:value={frequency}
                      size="3"
                      name="frequency"
                      on:keydown={(e) => {
                        if (e.key === "Enter") {
                          frequencyInputComponent.setFrequency(frequency * 1e3);
                          handleFrequencyChange({ detail: frequency * 1e3 });
                        }
                      }}
                      use:handleWheel
                    />
                    <div class="flex items-center justify-center text-sm w-48">
		    <span class="text-yellow-400 px-2">{vfo}</span>
		     <span class="text-gray-400 px-2">|</span>
                      <span class="text-green-400 px-2">Mode {demodulation}</span>
                      <span class="text-gray-400 px-2">|</span>
                      <span class="text-cyan-300 px-2">BW {bandwidth} kHz</span>
		    </div>
                  </div>



<div class="flex flex-col items-center"><span class="date-time" style="color:rgba(0, 225, 255, 0.993)" >{formatter.format(currentDateTime)}
</span><div></div><div class="flex space-x-1 mb-1">


<div class="px-1 py-0.5 flex items-center justify-center w-12 h-5 relative overflow-hidden">
<span class="text-xs font-mono {mute ? 'text-red-500' : 'text-red-500 opacity-20 relative z-10'}">MUTED</span>
</div>

<div class="px-1 py-0.5 flex items-center justify-center w-12 h-5 relative overflow-hidden">
<span class="text-xs font-mono {NREnabled ? `text-green-500` : `text-green-500 opacity-20 relative z-10`}">NR</span>
</div>

<div class="px-1 py-0.5 flex items-center justify-center w-12 h-5 relative overflow-hidden">
<span class="text-xs font-mono {NBEnabled ? `text-green-500` : `text-green-500 opacity-20 relative z-10`}">NB<span>
</div>

<div class="px-1 py-0.5 flex items-center justify-center w-12 h-5 relative overflow-hidden">
<span class="text-xs font-mono {ANEnabled ? `text-green-500` : `text-green-500 opacity-20 relative z-10`}">AN</span>
</div>

<div class="px-1 py-0.5 flex items-center justify-center w-12 h-5 relative overflow-hidden">
<span class="text-xs font-mono {CTCSSSupressEnabled ? `text-yellow-500` : `text-yellow-500 opacity-20 relative z-10`}">CTCSS</span>
</div>
</div>

<!-- SMeter -->
<canvas id="sMeter" width="250" height="40"></canvas>
</div>
</div>
</div>

<!-- Begin Fine Tuning Buttons -->

<div class="w-full mt-4">
<h3 class="text-white text-lg font-semibold mb-2">Fine Tuning (kHz)</h3>
<div class="grid grid-cols-5 sm:grid-cols-11 gap-2">
  {#if Device.isMobile}
    {#each mobilefinetuningsteps as finetuningstep}

        <button id="mobile-fine-tuning-selector" class="retro-button text-white font-bold h-10 text-base rounded-md flex items-center justify-center border border-gray-600 shadow-inner transition-all duration-200 ease-in-out bg-gray-700 hover:bg-gray-600"
                          on:click={() => handleFineTuningStep(finetuningstep)} title="{finetuningstep} kHz">
                          {finetuningstep}
                          </button>
			  {/each}
{:else}
  {#each finetuningsteps as finetuningstep}

        <button id="fine-tuning-selector" class="retro-button text-white font-bold h-10 text-base rounded-md flex items-center justify-center border border-gray-600 shadow-inner transition-all duration-200 ease-in-out bg-gray-700 hover:bg-gray-600"
                          on:click={() => handleFineTuningStep(finetuningstep)} title="{finetuningstep} kHz">
                          {finetuningstep}
                          </button>
                      {/each}

{/if}




</div>
<hr class="border-gray-600 my-2" />
                  </div>

<!-- End Fine Tuning Buttons -->

<!-- Begin Popup Buttons Section -->

<div class="w-full mt-4">
<div class="grid grid-cols-4 sm:grid-cols-4 gap-2">

<button id="vfo-ab-toggle" class="glass-button text-white font-bold py-2 px-4 rounded-lg flex items-center w-full justify-center" on:click={toggleVFO}>

                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
                </svg>
                A/B
              </button>



<button id="mode-popup-button" class="glass-button text-white font-bold py-2 px-4 rounded-lg flex items-center w-full justify-center"
                on:click={toggleModePopup}
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
                </svg>
                Mode
              </button>


                <!-- Bookmark Popup -->
                {#if showModePopup}
                <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                  <div class="bg-gray-800 p-6 rounded-lg max-w-lg w-full max-h-[80vh] flex flex-col">
                    <div class="flex justify-between items-center mb-4">
                      <h2 class="text-xl font-bold text-white">Modes</h2>
                      <button class="text-gray-400 hover:text-white" on:click={toggleModePopup}>
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                      </button>
                    </div>
<!-- Start Content Area -->

<div class="flex justify-center">
                    <div id="demodulationModes" class="grid grid-cols-3 sm:grid-cols-5 gap-2 w-full max-w-md">
                      {#each ["USB", "LSB", "CW", "AM", "FM"] as mode}
                        <button on:click={() => SetMode(mode)}
                          class="retro-button text-white font-bold h-10 text-sm rounded-md flex items-center justify-center border border-gray-600 shadow-inner transition-all duration-200 ease-in-out {demodulation === mode ? 'bg-blue-600 pressed scale-95' : 'bg-gray-700 hover:bg-gray-600'}"
                        >
                          {mode}
                        </button>
                      {/each}
                    </div>
                    </div>


<!-- End Content Area -->
                  </div>
                </div>
              {/if}

<!-- End Mode -->


<button id="band-popup-button"
                class="glass-button text-white font-bold py-2 px-4 rounded-lg flex items-center w-full justify-center"
                on:click={toggleBandPopup}
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
                </svg>
                Band
              </button>


                <!-- Bookmark Popup -->
                {#if showBandPopup}
                <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                  <div class="bg-gray-800 p-6 rounded-lg max-w-lg w-full max-h-[80vh] flex flex-col">
                    <div class="flex justify-between items-center mb-4">
                      <h2 class="text-xl font-bold text-white">Bands</h2>
                      <button class="text-gray-400 hover:text-white" on:click={toggleBandPopup}>
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                      </button>
                    </div>
                    <!-- Content Starts -->

<div class="grid grid-cols-5 sm:grid-cols-5 gap-2">
    {#each bandArray as bandData, index}
      {#if verifyRegion(bandData.ITU)}
        {#if printBandButton(bandData.startFreq,bandData.endFreq)}
          <button id="band-selector" class="retro-button text-sm text-white fontrbold h-7 text-base rounded-md flex items-center justify-center border border-gray-600 shadow-inner transition-all duration-200 ease-in-out {currentBand === index ? 'bg-blue-600 pressed scale-95' : 'bg-gray-700 hover:bg-gray-600'}"
            on:click={() => handleBandChange(index)} title="{bandData.name}">{bandData.name}
          </button>
        {/if}
      {:else}
    {/if}
  {/each}
</div>
<!-- Content Ends -->
</div>
</div>
 {/if}



<!--START NEW -->


<button id="if-filter-popup-button" class="glass-button text-white font-bold py-2 px-4 rounded-lg flex items-center w-full justify-center" on:click={toggleIFPopup}>
  <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
    <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
  </svg>IF Filters
</button>

<!-- Bookmark Popup -->
{#if showIFPopup}
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div class="bg-gray-800 p-6 rounded-lg max-w-lg w-full max-h-[80vh] flex flex-col">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-xl font-bold text-white">Static IF Filters</h2>
          <button class="text-gray-400 hover:text-white" on:click={toggleIFPopup}>
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
           </svg>
         </button>
      </div>
<!-- Content Starts -->

<div class="w-full mt-4">
  <div class="grid grid-cols-4 sm:grid-cols-6 gap-2">
    {#each newBandwidth as newbandwidth}
      <button id="static-bandwidth-selector" class="retro-button text-sm text-white font-bold h-10 text-base rounded-md flex items-center justify-center border border-gray-600 shadow-inner transition-all duration-200 ease-in-out {currentBandwidth === newbandwidth ? 'bg-blue-600 pressed scale-95' : 'bg-gray-700 hover:bg-gray-600'}" on:click={() => handleBandwidthChange(newbandwidth)} title="{newbandwidth}">
        {#if newbandwidth == 250}250 Hz
	{:else if newbandwidth == 500}500 Hz
	{:else if newbandwidth == 1800}1.8 kHz
        {:else if newbandwidth == 2400}2.4 kHz
        {:else if newbandwidth == 2800}2.8 kHz
        {:else if newbandwidth == 3000}3.0 kHz
        {:else if newbandwidth == 3500}3.5 kHz
        {:else if newbandwidth == 4000}4.0 kHz
	{:else if newbandwidth == 4500}4.5 kHz
	{:else if newbandwidth == 5000}5.0 kHz
	{:else if newbandwidth == 10000}10.0 kHz
	{:else if newbandwidth == 12000}12.0 kHz
        {:else}
        {/if}
      </button>
    {/each}
  </div>
</div>

<!-- Content Ends -->
</div>
</div>
{/if}

<!-- Content Ends -->
</div>
<hr class="border-gray-600 my-2" />
</div>

<!-- Start Fine Tuning -->
<div id="frequencyContainer" class="w-full mt-4">
	       <!-- <div class="space-y-3">-->

<!-- End of Mode Selection Area -->

<!-- Begin Bandwidth Selection Area -->
 <div class="w-full mt-4">
 <h3 class="text-white text-lg font-semibold mb-2">Bandwidth</h3>
 <div class="grid grid-cols-3 sm:grid-cols-6 gap-2">
   {#each bandwithoffsets as bandwidthoffset (bandwidthoffset)}
   <button id="bandwidth-offset-selector" class="retro-button text-white font-bold h-10 text-base rounded-md flex items-center justify-center border border-gray-600 shadow-inner transition-all duration-200 ease-in-out {bandwidth === bandwidthoffset
? 'bg-blue-600 pressed scale-95'
: 'bg-gray-700 hover:bg-gray-600'}"
    on:click={(e) => handleBandwidthOffsetClick(bandwidthoffset)}
     title="{bandwidthoffset} kHz"
 >
  {bandwidthoffset}
 </button>
  {/each}
</div>
<hr class="border-gray-600 my-2" />
                  </div>
<!-- End of Bandwidth Selection Area -->


 <!-- Tuning Steps -->
<div class="w-full mt-4">
<h3 class="text-white text-lg font-semibold mb-2">Tuning Steps</h3>
<div class="grid grid-cols-4 sm:grid-cols-8 gap-2">
  {#each tuningsteps as tuningstep (tuningstep)}
    <button id="tuning-step-selector" class="text-sm retro-button text-white font-bold h-10 text-base rounded-md flex items-center justify-center border border-gray-600 shadow-inner transition-all duration-200 ease-in-out {currentTuneStep == tuningstep ? 'bg-blue-600 pressed scale-95' : 'bg-gray-700 hover:bg-gray-600'}"
      on:click={() => handleTuningStep(tuningstep)} title="{tuningstep} Hz">
      {#if tuningstep == 10}Default
      {:else if tuningstep == 50}50 Hz
      {:else if tuningstep == 100}100 Hz
      {:else if tuningstep == 500}500 Hz
      {:else if tuningstep == 1000}1 kHz
      {:else if tuningstep == 5000}5 kHz
      {:else if tuningstep == 9000}9 kHz
      {:else if tuningstep == 10000}10 kHz
      {:else}
      {tuningstep}
      {/if}
</button>
  {/each}
</div>
<hr class="border-gray-600 my-2" />
</div>

<!-- End of Tuning Step Selection Area -->

</div>
</div>
<!--</div>-->
            

<div class="flex flex-col items-center bg-gray-800 p-6 lg:border lg:border-gray-700 rounded-none rounded-b-lg lg:rounded-none lg:rounded-r-lg" style="opacity: 0.95;">
<h3 class="text-white text-lg font-semibold mb-4">Audio</h3>
  <div class="control-group" id="volume-slider">
  <button class="glass-button text-white font-bold rounded-full w-10 h-10 flex items-center justify-center mr-4" on:click={handleMuteChange}>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
          {#if mute}
            <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 001.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06zM17.78 9.22a.75.75 0 10-1.06 1.06L18.44 12l-1.72 1.72a.75.75 0 001.06 1.06L19.5 13.06l1.72 1.72a.75.75 0 101.06-1.06L20.56 12l1.72-1.72a.75.75 0 00-1.06-1.06L19.5 10.94l-1.72-1.72z"  />
                    {:else}
                      <path
                        d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 001.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06zM18.584 5.106a.75.75 0 011.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 11-1.06-1.06 8.25 8.25 0 000-11.668.75.75 0 010-1.06z"
                      />
                    {/if}
                  </svg>
                </button>
                <div class="slider-container">
                  <input type="range" bind:value={volume} on:input={handleVolumeChange} class="glass-slider" disabled={mute} min="0" max="100" step="1" />
                </div>
                <span class="value-display text-gray-300 ml-4">{volume}%</span>
              </div>

              <div class="control-group mt-4" id="squelch-slider">
                <button class="glass-button text-white font-bold rounded-full w-10 h-10 flex items-center justify-center mr-4" style="background: {squelchEnable ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)'}" on:click={handleSquelchChange}>
		  <span class="text-white text-xs font-semibold">SQ</span>
                </button>
                <div class="slider-container">
                  <input type="range" bind:value={squelch} on:input={handleSquelchMove} class="glass-slider" min="-150" max="0" step="1" />
                </div>
                <span class="value-display text-gray-300 ml-4">{squelch}dB</span>
              </div>
<!-- Added -->

<div class="control-group mt-4" id="audio-buffer-slider">
                <button class="glass-button text-white font-bold rounded-full w-10 h-10 flex items-center justify-center mr-4" style="background: {audioBufferDelayEnabled ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)'}" on:click={() => handleAudioBufferDelayMove((audioBufferDelay+=1))}>
                  <span class="text-white text-xs font-semibold">Buffer</span>
                </button>
                <div class="slider-container">
                  <input type="range" bind:value={audioBufferDelay} on:input={handleAudioBufferDelayMove(audioBufferDelay)} class="glass-slider" min="1" max="5" step="1" />
                </div>
                <span class="value-display text-gray-300 ml-4">×{audioBufferDelay}</span>
              <hr class="border-gray-600 my-2" />
              </div>


<!-- AGC Selection -->
<!--
<h3 class="text-white text-lg font-semibold mb-4">AGC</h3>
<div class="w-full mb-6">
<div class="grid grid-cols-1 sm:grid-cols-4 gap-2">
<button id="agc-selection" class="retro-button text-white font-bold h-10 text-base rounded-md flex items-center justify-center border border-gray-600 shadow-inner transition-all duration-200 ease-in-out {currentAGC === 0 ? 'bg-blue-600 pressed scale-95' : 'bg-gray-700 hover:bg-gray-600'}" on:click={() => handleAGCChange(0)} title="Auto">Auto
</button>

<button class="retro-button text-white font-bold h-10 text-base rounded-md flex items-center justify-center border border-gray-600 shadow-inner transition-all duration-200 ease-in-out {currentAGC === 1 ? 'bg-blue-600 pressed scale-95' : 'bg-gray-700 hover:bg-gray-600'}" on:click={() => handleAGCChange(1)} title="Fast AGC">Fast
</button>

<button class="retro-button text-white font-bold h-10 text-base rounded-md flex items-center justify-center border border-gray-600 shadow-inner transition-all duration-200 ease-in-out {currentAGC === 2 ? 'bg-blue-600 pressed scale-95' : 'bg-gray-700 hover:bg-gray-600'}" on:click={() => handleAGCChange(2)} title="Mid AGC">Mid
</button>

<button class="retro-button text-white font-bold h-10 text-base rounded-md flex items-center justify-center border border-gray-600 shadow-inner transition-all duration-200 ease-in-out {currentAGC === 3 ? 'bg-blue-600 pressed scale-95' : 'bg-gray-700 hover:bg-gray-600'}" on:click={() => handleAGCChange(3)} title="Slow AGC">Slow
</button>
</div>
<hr class="border-gray-600 my-2" />
</div>
-->
<!-- End AGC Section -->

<!-- Begin Filter Selection -->
 <h3 class="text-white text-lg font-semibold mb-2">Filters</h3>
                    <div class="w-full mb-6">
                      <div id="moreoptions" class="grid grid-cols-4 gap-2">
                        {#each [{ option: "NR", icon: "wave-square", enabled: NREnabled }, { option: "NB", icon: "zap", enabled: NBEnabled }, { option: "AN", icon: "shield", enabled: ANEnabled }, { option: "CTCSS", icon: "filter", enabled: CTCSSSupressEnabled }] as { option, icon, enabled }}
                          <button
                            class="retro-button text-white font-bold h-10 text-sm rounded-md flex items-center justify-center border border-gray-600 shadow-inner transition-all duration-200 ease-in-out {enabled ? 'bg-blue-600 pressed scale-95' : 'bg-gray-700 hover:bg-gray-600'}"
                            on:click={() => {
                              if (option === "NR") handleNRChange();
                              else if (option === "NB") handleNBChange();
                              else if (option === "AN") handleANChange();
                              else handleCTCSSChange();
                            }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                              {#if icon === "wave-square"}
                                <path d="M0 15h3v-3h3v3h3v-3h3v3h3v-3h3v3h3v-3h3" />
                              {:else if icon === "zap"}
                                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                              {:else if icon === "shield"}
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                              {:else if icon === "filter"}
                                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                              {/if}
                            </svg>
                            <span>{option}</span>
                          </button>
                        {/each}
                      </div>
                      <hr class="border-gray-600 my-2" />
<!-- End Filter Selection -->

              <!-- Recording Options -->
              <div class="mt-6 w-full">
                <h3 class="text-white text-lg font-semibold mb-2">Recording Options</h3>
                <div class="flex justify-center gap-4">
                  <button class="bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg flex items-center transition-colors {isRecording ? 'ring-2 ring-red-500' : ''}" on:click={toggleRecording}>
                    {#if isRecording}
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" />
                      </svg>
                      Stop
                    {:else}
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" />
                      </svg>
                      Record
                    {/if}
                  </button>

                  {#if canDownload}
                    <button class="bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg flex items-center transition-colors" on:click={downloadRecording}>
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd" />
                      </svg>
                      Download
                    </button>
                  {/if}
                </div>
              </div>
</div>
<hr class="border-gray-600 my-2" />


<!-- PHIL START -->



<button id="bookmark-button" class="glass-button text-white font-bold py-2 px-4 rounded-lg flex items-center w-full justify-center"
 on:click={toggleBookmarkPopup}>
   <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
     <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
   </svg>
   Bookmarks
</button>
            
              <div id="user_count_container" class="w-full mt-4 bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg p-1">
                <div id="total_user_count" class="bg-gray-800 rounded-md p-2 text-center flex justify-between items-center">
                  <!-- Content will be populated by JavaScript -->
                </div>
              </div>
            

                <!-- Bookmark Popup -->
                {#if showBookmarkPopup}
                <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                  <div class="bg-gray-800 p-6 rounded-lg max-w-lg w-full max-h-[80vh] flex flex-col">
                    <div class="flex justify-between items-center mb-4">
                      <h2 class="text-xl font-bold text-white">Bookmarks</h2>
                      <button class="text-gray-400 hover:text-white" on:click={toggleBookmarkPopup}>
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                      </button>
                    </div>
					
					<!-- Add Bookmark Section -->
                    <div class="mb-6">
                      <label class="block text-sm font-medium text-gray-300 mb-2">Add New Bookmark</label>
                      <div class="flex items-center gap-2">
                        <input
                          class="glass-input text-white text-sm rounded-lg focus:outline-none px-3 py-2 flex-grow"
                          bind:value={newBookmarkName}
                          placeholder="Bookmark name"
                        />
                        <button
                          class="glass-button text-white font-bold py-2 px-4 rounded-lg flex items-center"
                          on:click={addBookmark}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-5 w-5 mr-2"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path
                              fill-rule="evenodd"
                              d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                              clip-rule="evenodd"
                            />
                          </svg>
                          Add
                        </button>
                      </div>
                    </div>
              
                    <!-- Current Link Section -->
                    <div class="mb-6">
                      <label class="block text-sm font-medium text-gray-300 mb-2">Current Link</label>
                      <div class="flex items-center gap-2">
                        <input
                          type="text"
                          class="glass-input text-white text-sm rounded-lg focus:outline-none px-3 py-2 flex-grow"
                          value={link}
                          readonly
                        />
                        <button
                          class="glass-button text-white font-bold py-2 px-4 rounded-lg flex items-center"
                          on:click={handleLinkCopyClick}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-5 w-5 mr-2"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                            <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                          </svg>
                          Copy
                        </button>
                      </div>
                    </div>
              
                    <!-- Bookmarks List -->
                    <div class="overflow-y-auto flex-grow h-80">
                      <label class="block text-sm font-medium text-gray-300 mb-2">Saved Bookmarks</label>
                      {#each $bookmarks as bookmark, index}
                        <div class="glass-panel rounded-lg p-3 flex items-center justify-between mb-2">
                          <div class="flex flex-col">
                            <span class="text-white text-sm">{bookmark.name}</span>
                            <span class="text-gray-400 text-xs">{(bookmark.frequency / 1000).toFixed(3)} kHz</span>
                          </div>
                          <div class="flex gap-2">
                            <button
                              class="glass-button text-white font-bold py-1 px-3 rounded-lg flex items-center"
                              on:click={() => goToBookmark(bookmark)}
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="h-4 w-4 mr-1"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                              >
                                <path
                                  fill-rule="evenodd"
                                  d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
                                  clip-rule="evenodd"
                                />
                              </svg>
                              Go
                            </button>
                            <button
                              class="glass-button text-white font-bold py-1 px-3 rounded-lg flex items-center"
                              on:click={() => copy(bookmark.link)}
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="h-4 w-4 mr-1"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                              >
                                <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                                <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                              </svg>
                              Copy
                            </button>
                            <button
                              class="glass-button text-white font-bold py-1 px-3 rounded-lg flex items-center"
                              on:click={() => deleteBookmark(index)}
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="h-4 w-4 mr-1"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                              >
                                <path
                                  fill-rule="evenodd"
                                  d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                                  clip-rule="evenodd"
                                />
                              </svg>
                              Delete
                            </button>
                          </div>
                        </div>
                      {/each}
                    </div>
                  </div>
                </div>
              {/if}
			  
			  
			  
					
















</div>
</div>




<!-- PHIL END -->

{#if siteChatEnabled}

          <!--Beginn of Chatbox -->
          <!--To disable Chatbox: Delte Code from here to .. -->
          <div class="flex flex-col rounded p-2 justify-center" id="chat-column">
            <div class="p-3 sm:p-5 flex flex-col bg-gray-800 border border-gray-700 rounded-lg w-full mb-8" id="chat-box" style="opacity: 0.95;">
              <h2 class="text-xl sm:text-2xl font-semibold text-gray-100 mb-2 sm:mb-4">WebSDR Chatbox</h2>
              <p class="text-white text-xs sm:text-sm mr-2 mb-2 sm:mb-0">
                This chatbox is intended to discuss the operation of the WebSDR, so please keep the discussion civil and polite.<br /><br />
                <!--Your Callsigne if you have--
              <br />
              </p>

              <!-- Username Display/Input -->
              <div class="mb-2 sm:mb-4 flex flex-wrap items-center">
                <span class="text-white text-xs sm:text-sm mr-2 mb-2 sm:mb-0">Chatting as:</span>
                {#if showUsernameInput}
                  <input class="glass-input text-white py-1 px-2 rounded-lg outline-none text-xs sm:text-sm flex-grow mr-2 mb-2 sm:mb-0" bind:value={username} placeholder="Enter your name/callsign" on:keydown={(e) => e.key === "Enter" && saveUsername()} />
                  <button class="glass-button text-white py-1 px-3 mb-2 lg:mb-0 rounded-lg text-xs sm:text-sm" on:click={saveUsername}> Save </button>
                {:else}
                  <span class="glass-username text-white text-xs sm:text-sm px-3 py-1 rounded-lg mr-2 mb-2 sm:mb-0">
                    {username || "Anonymous"}
                  </span>
                  <button class="glass-button text-white py-1 px-3 mb-2 lg:mb-0 rounded-lg text-xs sm:text-sm" on:click={editUsername}> Edit </button>
                {/if}
              </div>

              <!-- Chat Messages -->
              <div class="bg-gray-900 rounded-lg p-2 sm:p-3 mb-2 sm:mb-4 h-48 sm:h-64 overflow-y-auto custom-scrollbar" bind:this={chatMessages}>
                {#each $messages as { id, text } (id)}
                  {@const formattedMessage = formatFrequencyMessage(text)}
                  <div class="mb-2 sm:mb-3 text-left" in:fly={{ y: 20, duration: 300, easing: quintOut }}>
                    <div class="inline-block bg-gray-800 rounded-lg p-2 max-w-full">
                      <p class="text-white text-xs sm:text-sm break-words">
                        <span class="font-semibold text-blue-300">{formattedMessage.username}</span>
                        <span class="text-xs text-gray-400 ml-2">{formattedMessage.timestamp}</span>
                      </p>
                      <p class="text-white text-xs sm:text-sm break-words mt-1">
                        {#if formattedMessage.isFormatted}
                          {@html renderParts(formattedMessage.beforeFreq)}
                          <a href="#" class="text-blue-300 hover:underline" on:click|preventDefault={() => handleFrequencyClick(formattedMessage.frequency, formattedMessage.demodulation)}>
                            {(formattedMessage.frequency / 1000).toFixed(3)} kHz ({formattedMessage.demodulation})
                          </a>
                          {@html renderParts(formattedMessage.afterFreq)}
                        {:else}
                          {@html renderParts(formattedMessage.parts)}
                        {/if}
                      </p>
                    </div>
                  </div>
                {/each}
              </div>

              <!-- Message Input and Buttons -->
              <div class="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                <input class="glass-input text-white py-2 px-3 rounded-lg outline-none text-xs sm:text-sm flex-grow" bind:value={newMessage} on:keydown={handleEnterKey} placeholder="Type a message..." />
                <div class="flex space-x-2">
                  <button class="glass-button text-white font-semibold py-2 px-4 rounded-lg flex items-center justify-center text-xs sm:text-sm flex-grow sm:flex-grow-0" on:click={sendMessage}>
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                    </svg>
                    Send
                  </button>
                  <button class="glass-button text-white font-semibold py-2 px-4 rounded-lg flex items-center justify-center text-xs sm:text-sm flex-grow sm:flex-grow-0" on:click={pasteFrequency}>
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                      <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                    </svg>
                    Paste Freq
                  </button>
                </div>
              </div>
            </div>
          </div>
	  {:else}
	  {/if}
          <!--To disable Chatbox: Delte Code till above this here -->
        </div>
      </div>
      <footer class="mt-4 mb-4 text-center text-gray-400 text-sm">
        <span class="text-sm text-gray-400">PhantomSDR+ | v{VERSION}</span>
        <!--<a href="./websdr_privacy.html" class="font-bold text-blue-500 hover:underline" target="_blank"> View Privacy Policy</a>-->
      </footer>
    </div>
  </div>
</main>

<svelte:head>
  <link href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap" rel="stylesheet" />
  <link href="https://fonts.googleapis.com/css2?family=Courier+Prime:ital,wght@0,400;0,700;1,400;1,700&display=swap" rel="stylesheet" />
</svelte:head>

<style global lang="postcss">
  body {
    font-family: "Inter", sans-serif;
    background-color: #f0f0f0;
    color: #333;
    line-height: 1.6;
    margin: 0;
    padding: 0;
  }

  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 20px;
  }

  #hero {
    background-color: #2c3e50;
    color: #ecf0f1;
    padding: 100px 0;
    text-align: center;
  }

  #tagline {
    font-size: 2rem;
    margin-bottom: 2rem;
  }

  .btn {
    display: inline-block;
    padding: 12px 24px;
    background-color: #e74c3c;
    color: #fff;
    text-decoration: none;
    border-radius: 5px;
    font-weight: 700;
    transition: background-color 0.3s ease;
  }

  .btn:hover {
    background-color: #c0392b;
  }

  :root {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif;
  }

  @media (min-width: 1372px) {
    #chat-box {
      min-width: var(--middle-column-width);
    }
    #chat-column {
      align-items: center;
    }
  }

  .full-screen-container {
    display: flex;
    flex-direction: row;
    height: 100vh;
  }

  .side-nav {
    flex-basis: 250px;
    overflow-y: auto;
    background-color: #333;
    color: #fff;
  }

  .main-content {
    flex-grow: 1;
    overflow-y: auto;
    padding: 20px;
    max-width: 1372px;
    margin: auto;
  }

  .tab-content {
    display: none;
  }

  .tab-content.active {
    display: block;
  }

  :global(body.light-mode) {
    background-color: #a9a9a9;
    transition: background-color 0.3s;
  }
  :global(body) {
    background-color: #212121;
  }

  main {
    text-align: center;
    margin: 0 auto;
  }
  .thick-line-through {
    text-decoration-thickness: 2px;
  }

  .basic-button {
    @apply text-blue-500 border border-blue-500 font-bold uppercase transition-all duration-100 text-center text-xs px-2 py-1
            peer-checked:bg-blue-600 peer-checked:text-white;
  }
  .basic-button:hover {
    @apply border-blue-400 text-white;
  }

  .click-button {
    @apply text-blue-500 border border-blue-500 font-bold uppercase transition-all duration-100 text-center text-xs px-2 py-1;
  }
  .click-button:active {
    @apply bg-blue-600 text-white;
  }

  .custom-scrollbar::-webkit-scrollbar {
    width: 12px;
    background-color: transparent;
  }

  .custom-scrollbar::-webkit-scrollbar-track {
    background-color: rgba(255, 255, 255, 0.05);
    border-radius: 10px;
    margin: 5px 0;
  }

  .custom-scrollbar::-webkit-scrollbar-thumb {
    background-color: rgba(255, 255, 255, 0.2);
    border-radius: 10px;
    border: 3px solid rgba(0, 0, 0, 0.2);
    background-clip: padding-box;
  }

  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background-color: rgba(255, 255, 255, 0.3);
  }

  .custom-scrollbar {
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.2) rgba(255, 255, 255, 0.05);
  }

  .scrollbar-container {
    padding-right: 12px;
    box-sizing: content-box;
  }

  /* Here you can Change the Background of WebSDR, Picture must be in assets folder*/
  .bg-custom-dark {
    /* background-color: #1c1c1c; /* Original: A very dark gray with a tiny hint of warmth */
    background: url("./assets/background.jpg") no-repeat center center fixed;
    background-size: cover;
  }

  .glass-username {
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(5px);
    display: inline-block;
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .glass-button {
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    transition: all 0.3s ease;
  }

  .glass-button:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.2);
  }

  .glass-slider {
    -webkit-appearance: none;
    width: 100%;
    height: 6px;
    background: rgba(255, 255, 255, 0.1);
    outline: none;
    border-radius: 3px;
  }

  .glass-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    background: rgba(255, 255, 255, 0.8);
    cursor: pointer;
    border-radius: 50%;
  }

  #sMeter {
    width: 300px;
    height: 40px;
    background-color: transparent;
    display: block;
    margin-left: 30px;
    margin-top: 5px;
  }

  .smeter-container {
    background-color: black;
    padding: 10px;
    border-radius: 5px;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 310px;
    padding: 15px;
    background: #111;
    border-radius: 5px;
    position: relative;
    margin: 0 auto;
    box-shadow: 0 0 10px rgb(83 83 83 / 30%);
    font-family: "VT323", monospace;
  }

  .glass-slider::-moz-range-thumb {
    width: 18px;
    height: 18px;
    background: rgba(255, 255, 255, 0.8);
    cursor: pointer;
    border-radius: 50%;
  }

  .glass-message {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    transition: background-color 0.3s;
  }

  .glass-message:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .glass-panel {
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.2);
    transition: all 0.3s ease;
  }

  .glass-panel:hover {
    background: rgba(255, 255, 255, 0.15);
    transform: translateY(-5px);
    box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2);
  }

  .glass-input {
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(5px);
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .control-group {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    max-width: 400px;
  }

  .slider-container {
    flex-grow: 1;
    margin: 0 15px;
    width: 200px;
  }

  .value-display {
    width: 50px;
    text-align: right;
  }

  .glass-button.active {
    background: linear-gradient(135deg, rgba(50, 50, 80, 0.8), rgba(60, 50, 80, 0.8));
    border-color: rgba(120, 100, 180, 0.4);
    box-shadow:
      0 2px 4px rgba(0, 0, 0, 0.2),
      inset 0 1px 2px rgba(150, 130, 200, 0.1);
  }

  .glass-select {
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    transition: all 0.3s ease;
  }

  .glass-select:focus {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(99, 102, 241, 0.5);
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.25);
  }

  .glass-select option {
    background-color: #2a2c3e;
  }

  .glass-toggle-button {
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    transition: all 0.3s ease;
    min-width: 48px;
  }

  .glass-toggle-button:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.2);
  }

  .glass-toggle-button.active {
    background: rgba(16, 185, 129, 0.2);
    border-color: rgba(16, 185, 129, 0.4);
  }

  .myButton {
   -moz-box-shadow: 1px 1px 3px -1px #414445;
   -webkit-box-shadow: 1px 1px 3px -1px #414445;
   box-shadow: 1px 1px 3px -1px #414445;
   background:linear-gradient(to bottom, #ededed 5%, #c2c0c2 100%);
   background-color:#ededed;
   border-radius:6px;
   border:1px solid #dcdcdc;
   display:inline-block;
   cursor:pointer;
   color:#050505;
   font-family:Arial;
   font-size:12px;
   font-weight:normal;
   padding:0px 6px;
   text-decoration:none;
   text-shadow:0px 1px 0px #ffffff;
}
.myButton:hover {
   background:linear-gradient(to bottom, #c2c0c2 5%, #ededed 100%);
   background-color:#c2c0c2;
}
.myButton:active {
   position:relative;
   top:1px;
}

  .slide-transition {
    transition: max-height 300ms cubic-bezier(0.23, 1, 0.32, 1);
    overflow: hidden;
  }

  .chat-input {
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;
    background-color: rgba(255, 255, 255, 0.1) !important;
    color: white !important;
    border: 1px solid rgba(255, 255, 255, 0.2) !important;
  }

  .chat-input::placeholder {
    color: rgba(255, 255, 255, 0.5);
  }

  .chat-button {
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;
    background-color: rgba(255, 255, 255, 0.1) !important;
    color: white !important;
    border: 1px solid rgba(255, 255, 255, 0.2) !important;
    font-size: 14px;
  }

  @supports (-webkit-touch-callout: none) {
    .chat-input,
    .chat-button {
      background-color: rgba(255, 255, 255, 0.1) !important;
      color: white !important;
      border: 1px solid rgba(255, 255, 255, 0.2) !important;
    }
  }

  .toggle-switch {
    position: relative;
    display: inline-block;
    width: 40px;
    height: 22px;
  }

  .toggle-switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle-slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #676767;
    transition: 0.4s;
    border-radius: 22px;
  }

  .toggle-slider:before {
    position: absolute;
    content: "";
    height: 18px;
    width: 18px;
    left: 2px;
    bottom: 2px;
    background-color: white;
    transition: 0.4s;
    border-radius: 50%;
  }

  input:checked + .toggle-slider {
    background-color: #2196f3;
  }

  input:focus + .toggle-slider {
    box-shadow: 0 0 1px #2196f3;
  }

  input:checked + .toggle-slider:before {
    transform: translateX(18px);
  }

  @media screen and (min-width: 1372px) {
    #outer-waterfall-container {
      min-width: 1372px;
    }
  }
</style>



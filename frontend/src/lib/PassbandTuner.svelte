<script>
    import { createEventDispatcher, onMount } from 'svelte'
    import { bandwidthToWaterfallOffset, getMaximumBandwidth } from './backend'
    import { pan } from './hammeractions';

    const dispatch = createEventDispatcher()
    const NoDrag = 0
    const All = 1
    const Left = 2
    const Right = 3
    const Click = 4

    let demod = "USB";

    let startedNormalDrag = false;
    let isMouseDown = false;

    let draggingState = NoDrag
    let draggingOffset
    let draggingTotal

    let passbandWidth
    let passbandParent

    let passbandOffset = -1000
    let passbandLeftOffset
    let passbandRightOffset

    let maximumSideband
    let maximumSidebandOffset
    $: maximumSidebandOffset = maximumSideband * passbandWidth / 2

    let cssPassbandOffset
    let cssPassband

    let zoomLvl = 1

    function getClientX(e) {
      // Check in order:
      // e.clientX
      // e.detail.center.x
      if (e.clientX) {
        return e.clientX
      } else if (e.detail.center.x) {
        return e.detail.center.x
      }
    }

    
    function getFrequencyPerPixel() {
      const totalFrequencySpan = (passbandRightOffset - passbandLeftOffset) * 1e6; // in Hz
      return totalFrequencySpan / passbandWidth; // Hz per pixel
    }
    
    
    function handleWheel(e) {
      e.preventDefault(); 
      
      const direction = e.deltaY < 0 ? 1 : -1; 
      const basePixelStep = 0.1; 
      const speedFactor = Math.min(Math.abs(e.deltaY) / 100, 10); 
      
      const pixelStep = basePixelStep * speedFactor; 
      const frequencyPerPixel = getFrequencyPerPixel();
      const frequencyStep = pixelStep * frequencyPerPixel;
      
      const newOffset = passbandOffset + direction * (frequencyStep / passbandWidth);

      passbandOffset = Math.min(Math.max(-passbandLeftOffset, newOffset), 1 - passbandRightOffset);
      
      dispatchPassbandChange();
    }

    function adjustFrequency(delta) {
      // Convert frequency delta to offset delta
      const offsetDelta = delta ;
      
      // Update passbandOffset
      passbandOffset += offsetDelta;
      
      // Ensure passbandOffset stays within bounds (0 to 1)
      passbandOffset = Math.max(0, Math.min(1, passbandOffset));
      
      dispatchPassbandChange();
    }

    function setZoomLevel(zoom)
    {
      zoomLvl = zoom;
    }
    
    
    

    export function handleMoveStart(e, state) {
      isMouseDown = true;
      if((state == Left || state == Right) && !startedNormalDrag)
      {
        startedNormalDrag = true;
        console.log("Normal Drag for " + draggingState);
      }
        const clientX = getClientX(e);
        draggingState = state;
        draggingTotal = 0;
        const rect = passbandParent.getBoundingClientRect();
        const zero = rect.x + rect.width / 2; // Center of the waterfall

        if (draggingState === All) {
          draggingOffset = clientX - zero - passbandOffset * passbandWidth;
        } else if (draggingState === Left) {
          draggingOffset = clientX - zero - (passbandOffset + passbandLeftOffset) * passbandWidth;
        } else if (draggingState === Right) {
          draggingOffset = clientX - zero - (passbandOffset + passbandRightOffset) * passbandWidth;
        }
        
        updatePassbandLimits();
      }
      function handleMove(e) {
      
          
        const clientX = getClientX(e);
        if (draggingState === Click) {
          draggingTotal += e.detail.srcEvent.movementX;
        } else if (draggingState !== NoDrag) {
          const computedStyle = window.getComputedStyle(e.target);
          const cursorStyle = computedStyle.cursor;
         

          const rect = passbandParent.getBoundingClientRect();
          const zero = rect.x + rect.width / 2; // Center of the waterfall
          const offsetX = clientX - zero - draggingOffset;


          if (draggingState === All && !startedNormalDrag && !cursorStyle.includes('ew-resize')) {
              const zero = passbandParent.getBoundingClientRect().x;
              const offsetX = e.clientX - (zero );
              passbandOffset = offsetX / (passbandWidth ) - ((passbandRightOffset + passbandLeftOffset) / 2);
          } 
       
            if (draggingState === Left) {
                passbandLeftOffset = (offsetX - passbandOffset * passbandWidth) / passbandWidth;
            } else if (draggingState === Right) {
                passbandRightOffset = (offsetX - passbandOffset * passbandWidth) / passbandWidth;
            }
          dispatchPassbandChange();
        }
      }
    function handleMoveEnd (e) {
      if (draggingState === Click && draggingTotal < 5) {
        handlePassbandClick(e)
      }
      
      draggingState = NoDrag
      passbandOffset = passbandOffset
      startedNormalDrag = false;
      isMouseDown = false;
    }

    export function setMode(mode)
    {
      demod = mode;
    }

    function handleParentClick(e) {

      if (draggingState === NoDrag) {
        const computedStyle = window.getComputedStyle(e.target);
        const cursorStyle = computedStyle.cursor;

        if (cursorStyle != 'resize' ) {
          if (draggingState === Click && draggingTotal < 5 && !startedNormalDrag) {
            handlePassbandClick(e)
           
          }else if(!startedNormalDrag && isMouseDown)
          {
            // Click is outside the passband (on the spectrum)
            const zero = passbandParent.getBoundingClientRect().x;
            const offsetX = e.clientX - zero;
            passbandOffset = offsetX / passbandWidth - ((passbandLeftOffset + passbandRightOffset) / 2);
            dispatchPassbandChange();
          }
          
        } 
      }
    }

    export function handleTouchStart(e) {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      handleMoveStart(touch, All);
    }
  }

  export function handleTouchMove(e) {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      handleMove(touch);
    }
  }

  export function handleTouchEnd(e) {

    handleMoveEnd(e);
  }

    export function handlePassbandClick (e) {
      
      const zero = passbandParent.getBoundingClientRect().x;
      const offsetX = e.clientX - zero
      passbandOffset = offsetX / (passbandWidth ) - ((passbandRightOffset + passbandLeftOffset) / 2);

      dispatchPassbandChange()
    
      
    }

    export function getOffsetFromEvent (e) {
      const zero = passbandParent.getBoundingClientRect().x
      const offsetX = e.clientX - zero
      return offsetX / passbandWidth
    }

    function constrainOffset(offset) {
        return Math.max(0, Math.min(1, offset));
    }

    function constrainWidth(width) {
        return Math.max(0, Math.min(passbandWidth, width));
    }

    $: cssPassbandOffset = `transform: translate3d(${passbandOffset * passbandWidth - 0.5}px, 0, 0)`
    $: cssPassband = `transform: translate3d(${passbandLeftOffset * passbandWidth + 0.5}px, 0, 0); width: ${(passbandRightOffset - passbandLeftOffset) * passbandWidth}px`

    let dispatchTime = 0
    function dispatchPassbandChange () {
      const message = [(passbandOffset + passbandLeftOffset), passbandOffset, (passbandOffset + passbandRightOffset)]
      const currentTime = Date.now()
      if (currentTime - dispatchTime > 50) {
        dispatch('change', message)
        dispatchTime = currentTime
      }
    }
    export function changePassband (offsets) {
      const [l, m, r] = offsets
      passbandOffset = m
      passbandLeftOffset = l - m
      passbandRightOffset = r - m
    }

    export function updatePassbandLimits () {
      maximumSideband = bandwidthToWaterfallOffset(getMaximumBandwidth())
    }
height:
    onMount(() => {
    })
</script>



<svelte:window on:mouseup={handleMoveEnd} on:mousemove={handleMove}  
on:touchmove={handleTouchMove}
on:touchend={handleTouchEnd}/>

<div class="w-full h-5 bg-black"
  on:wheel={handleWheel}
  bind:this={passbandParent}
  bind:clientWidth={passbandWidth}
  on:mousedown={(e) => handleMoveStart(e, All)}
  on:click={handleParentClick}
  on:touchstart={handleTouchStart}
 >
  
    <div class="h-full w-px bg-yellow-500" style={cssPassbandOffset}>
        <div class="h-full absolute cursor-grab z-10"
          style={cssPassband}>
            <svg class="h-5 w-2 inline absolute group cursor-w-resize z-0"
              style="right: 100%"
              on:mousedown={(e) => handleMoveStart(e, Left)}
              use:pan
              on:panstart={(e) => handleMoveStart(e, Left)}
              on:panmove={handleMove}
              on:panend={handleMoveEnd}
              role="slider"
              aria-valuenow={passbandLeftOffset}
              tabindex="-1">
                <line x1="100%" y1="20%" x2="20%" y2="100%" class="stroke-current text-yellow-500 stroke-1 group-hover:stroke-2"></line>
                <line x1="0%" y1="100%" x2="20%" y2="100%" class="stroke-current text-yellow-500 stroke-1 group-hover:stroke-2"></line>
            </svg>
            <div class="w-full h-full border-t border-yellow-500 align-middle absolute z-10"
              style="top: 20%"
              
              role="slider"
              tabindex="-1"></div>
            <svg class="h-5 w-2 inline absolute group cursor-e-resize z-0"
              style="left: 100%"
              on:mousedown={(e) => handleMoveStart(e, Right)}
              use:pan
              on:panstart={(e) => handleMoveStart(e, Right)}
              on:panmove={handleMove} 
              on:panend={handleMoveEnd}
              role="slider"
              aria-valuenow={passbandRightOffset}
              tabindex="-1">
                <line x1="0%" y1="20%" x2="80%" y2="100%" class="stroke-current text-yellow-500 stroke-1 group-hover:stroke-2"></line>
                <line x1="80%" y1="100%" x2="100%" y2="100%" class="stroke-current text-yellow-500 stroke-1 group-hover:stroke-2"/>
            </svg>
        </div>
        
    </div>
</div>
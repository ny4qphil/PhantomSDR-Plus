<script>
    import { onDestroy, onMount } from 'svelte'
    import { createPopper } from '@popperjs/core'

    export let text
    let popover
    
    let popoverPopper = null
    let parentNode = null
    let timeout = null

    function show () {
      if (!popoverPopper && popover) {
        popoverPopper = createPopper(parentNode, popover, {
          modifiers: [
            {
              name: 'offset',
              options: {
                offset: [0, 8]
              }
            }
          ],
          placement: 'top'
        })
      }
      popover.setAttribute('data-show', '')
      if (timeout) {
        clearTimeout(timeout)
      }
      timeout = setTimeout(() => {
        popover.removeAttribute('data-show')
      }, 1000)
    }
    onMount(() => {
      parentNode = popover.parentElement
      parentNode.addEventListener('click', show)
    })

    onDestroy(() => {
      parentNode.removeEventListener('click', show)
    })
</script>

<style>
    #popover {
      background: #333;
      color: white;
      font-weight: bold;
      padding: 4px 8px;
      font-size: 13px;
      border-radius: 4px;
      display: none;
    }
  
    :global(#popover[data-show]) {
        display: block;
    }

    #arrow,
    #arrow::before {
      position: absolute;
      width: 8px;
      height: 8px;
      z-index: -1;
    }

    #arrow::before {
      content: '';
      transform: rotate(45deg);
      background: #333;
    }
      
    :global(#popover[data-popper-placement^='top'] > #arrow) {
        bottom: -4px;
    }

    :global(#popover[data-popper-placement^='bottom'] > #arrow) {
        top: -4px;
    }

    :global(#popover[data-popper-placement^='left'] > #arrow) {
        right: -4px;
    }

    :global(#popover[data-popper-placement^='right'] > #arrow) {
        left: -4px;
    }

</style>

<div bind:this={popover} id="popover" role="tooltip" class="z-50">
    {text}
    <div id="arrow" data-popper-arrow></div>
</div>

<script>
    import { onDestroy, onMount } from 'svelte'
    import { createPopper } from '@popperjs/core'

    export let text
    let tooltip
    let tooltipPopper = null
    let parentNode = null
    function show () {
      if (!tooltipPopper && tooltip) {
        tooltipPopper = createPopper(parentNode, tooltip, {
          modifiers: [
            {
              name: 'offset',
              options: {
                offset: [0, 8]
              }
            }
          ],
          placement: 'bottom'
        })
      }
      tooltip.setAttribute('data-show', '')
    }
    function hide () {
      tooltip.removeAttribute('data-show')
    }

    onMount(() => {
      parentNode = tooltip.parentElement
      parentNode.addEventListener('mouseenter', show)
      parentNode.addEventListener('mouseleave', hide)
    })

    onDestroy(() => {
      parentNode.removeEventListener('mouseenter', show)
      parentNode.removeEventListener('mouseleave', hide)
    })
</script>

<style>
    #tooltip {
      background: #333;
      color: white;
      font-weight: bold;
      padding: 4px 8px;
      font-size: 13px;
      border-radius: 4px;
      display: none;
    }
  
    :global(#tooltip[data-show]) {
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
      
    :global(#tooltip[data-popper-placement^='top'] > #arrow) {
        bottom: -4px;
    }

    :global(#tooltip[data-popper-placement^='bottom'] > #arrow) {
        top: -4px;
    }

    :global(#tooltip[data-popper-placement^='left'] > #arrow) {
        right: -4px;
    }

    :global(#tooltip[data-popper-placement^='right'] > #arrow) {
        left: -4px;
    }

</style>

<div bind:this={tooltip} id="tooltip" role="tooltip" class="z-50">
    {text}
    <div id="arrow" data-popper-arrow></div>
</div>

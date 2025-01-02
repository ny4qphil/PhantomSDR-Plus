<script>
    import { beforeUpdate, afterUpdate } from 'svelte'
    import Denque from 'denque'

    export let capacity = 1000
    let log = new Denque(capacity)

    export function addLine (text) {
      log.push(text)

      if (log.length > capacity) {
        log.unshift()
      }
      log = log
    }

    let loggerDiv
    let autoscroll
    beforeUpdate(() => {
      autoscroll = loggerDiv && (loggerDiv.offsetHeight + loggerDiv.scrollTop) > (loggerDiv.scrollHeight - 20)
    })

    afterUpdate(() => {
      if (autoscroll) loggerDiv.scrollTo(0, loggerDiv.scrollHeight)
    })
</script>


<div class="fixed w-full sm:w-1/2 md:w-2/3 lg:w-3/4 h-1/4 bg-white bottom-0 p-1 overflow-y-scroll" bind:this={loggerDiv}>
      {#each log.toArray() as logLine}
        <div class="text-xs text-left font-mono border border-b-1 border-t-0 border-l-0 border-r-0">{logLine}</div>
      {/each}
</div>
<script>
    export let name
    export let checked
</script>
<label on:click>
    <input type="checkbox" class="hidden peer" autocomplete="off" bind:checked={checked} on:change>
    <div class="basic-button line-through thick-line-through peer-checked:no-underline" type="button">
        &nbsp;{name}&nbsp;
    </div>
    <slot/>
</label>
<script lang="ts">
  import { onMount } from 'svelte';

  let status = $state<'processing' | 'success' | 'error'>('processing');
  let errorMessage = $state('');

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');

    if (error) {
      status = 'error';
      errorMessage = params.get('error_description') ?? error;
      if (window.opener) {
        window.opener.postMessage({ type: 'parqet-oauth-error', error: errorMessage }, window.location.origin);
      }
      return;
    }

    if (!code || !state) {
      status = 'error';
      errorMessage = 'Missing code or state in callback.';
      return;
    }

    status = 'success';
    if (window.opener) {
      window.opener.postMessage({ type: 'parqet-oauth-code', code, state }, window.location.origin);
      window.close();
    }
  });
</script>

<div class="callback-page">
  {#if status === 'processing'}
    <p>Connecting to Parqet...</p>
  {:else if status === 'success'}
    <p>Connected! This window will close automatically.</p>
  {:else}
    <p>Authentication failed: {errorMessage}</p>
    <p>You can close this window.</p>
  {/if}
</div>

<style>
  .callback-page {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    font-family: sans-serif;
    color: var(--color-text-primary, #333);
    background: var(--color-bg-primary, #fff);
  }
  p {
    font-size: 1.1rem;
  }
</style>

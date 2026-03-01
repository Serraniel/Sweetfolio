/**
 * Share a URL using the native OS share menu (Web Share API) if available,
 * otherwise fall back to copying to clipboard.
 *
 * Returns a message describing what happened for toast display.
 */
export async function shareOrCopy(url: string, title: string): Promise<string> {
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      return 'Shared successfully';
    } catch (err) {
      // User cancelled the share dialog — not an error
      if (err instanceof DOMException && err.name === 'AbortError') {
        return '';
      }
      // Fall through to clipboard
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return 'Share link copied to clipboard';
  } catch {
    return 'Could not copy to clipboard';
  }
}

/**
 * core/orientation.ts
 * Forces the game into landscape, two layers deep:
 *
 *  1. Real orientation lock (screen.orientation.lock('landscape')) — works on Android
 *     Chrome/WebView when the page is running fullscreen (which is why telegram.ts calls
 *     requestFullscreen() first). Most Telegram clients on iOS do NOT support this API at
 *     all, and even on Android it can be refused depending on the client version.
 *
 *  2. CSS rotate fallback — if the phone is still physically portrait after step 1 (or the
 *     API doesn't exist/throws), we rotate the #stage element 90deg and resize it to fill
 *     the viewport, so the app *looks* and *behaves* landscape without the phone ever
 *     needing to physically rotate. This is the same trick used by most landscape-only
 *     HTML5 games embedded in portrait webviews (matches what we saw in the reference
 *     videos). The rotation is re-evaluated on every resize/orientationchange so it keeps
 *     working if the person rotates their phone for real, or if Telegram's webview resizes.
 */

const ROTATE_CLASS = 'force-landscape-rotate';

async function tryNativeLock(): Promise<boolean> {
  try {
    const orientation = (screen as unknown as { orientation?: ScreenOrientation & { lock?: (o: string) => Promise<void> } }).orientation;
    if (orientation?.lock) {
      await orientation.lock('landscape');
      return true;
    }
  } catch {
    // not permitted in this context (no fullscreen, iOS, older Telegram client, etc.)
    // this is expected most of the time - the CSS fallback below is the real workhorse.
  }
  return false;
}

function isPhysicallyLandscape(): boolean {
  return window.innerWidth >= window.innerHeight;
}

function applyRotateFallback(): void {
  const stage = document.getElementById('stage');
  if (!stage) return;

  if (isPhysicallyLandscape()) {
    // phone is already landscape (or we're on a landscape desktop window) - no CSS trick needed
    stage.classList.remove(ROTATE_CLASS);
    return;
  }
  stage.classList.add(ROTATE_CLASS);
}

let initialized = false;

export async function initForcedLandscape(): Promise<void> {
  if (initialized) return;
  initialized = true;

  await tryNativeLock(); // best effort, result doesn't change what we do next

  applyRotateFallback();
  window.addEventListener('resize', applyRotateFallback);
  window.addEventListener('orientationchange', () => {
    // give the browser a moment to report the new innerWidth/innerHeight
    setTimeout(applyRotateFallback, 60);
  });
}

export function isForcedRotateActive(): boolean {
  return document.getElementById('stage')?.classList.contains(ROTATE_CLASS) ?? false;
}

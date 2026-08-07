/**
 * ui/loading.ts
 * Step 1's placeholder loading screen. Later steps will replace onComplete's setTimeout
 * with real progress (asset loading, PixiJS renderer boot, etc) and call
 * updateProgress(0..1) as things actually finish loading instead of faking it.
 */

const TIPS_AR = [
  'اسحب الجويستك لتوجيه الثعبان',
  'اضغط مطولاً لتفعيل الاندفاع',
  'لف حول الأعداء الأصغر لإسقاطهم',
  'اجمع الطعام النادر للحصول على XP إضافية'
];

export interface LoadingScreenHandle {
  updateProgress(ratio: number): void;
  destroy(): void;
}

export function mountLoadingScreen(root: HTMLElement, onComplete: () => void): LoadingScreenHandle {
  const el = document.createElement('div');
  el.className = 'loading-screen';
  const tip = TIPS_AR[Math.floor(Math.random() * TIPS_AR.length)];
  el.innerHTML = `
    <div class="loading-logo">🐍 <span>Snake<b>Legendary</b></span></div>
    <div class="loading-bar-track">
      <div class="loading-bar-fill"></div>
    </div>
    <div class="loading-pct">0%</div>
    <div class="loading-tip">${tip}</div>
  `;
  root.appendChild(el);

  const fill = el.querySelector<HTMLDivElement>('.loading-bar-fill')!;
  const pct = el.querySelector<HTMLDivElement>('.loading-pct')!;

  function updateProgress(ratio: number) {
    const clamped = Math.max(0, Math.min(1, ratio));
    fill.style.width = `${clamped * 100}%`;
    pct.textContent = `${Math.round(clamped * 100)}%`;
    if (clamped >= 1) {
      setTimeout(() => {
        el.classList.add('loading-screen-out');
        setTimeout(onComplete, 400); // matches the CSS fade-out transition duration
      }, 200);
    }
  }

  function destroy() {
    el.remove();
  }

  // Step 1 has nothing real to load yet, so we fake a short progress ramp just to prove
  // the screen and its transition work end-to-end. Step 2+ will feed real progress in.
  let fakeProgress = 0;
  const interval = setInterval(() => {
    fakeProgress += 0.08 + Math.random() * 0.1;
    updateProgress(fakeProgress);
    if (fakeProgress >= 1) clearInterval(interval);
  }, 120);

  return { updateProgress, destroy };
}

/**
 * core/telegram.ts
 * Thin wrapper around the Telegram WebApp bridge. Every call is defensive because this
 * code also has to run fine in a plain desktop/mobile browser during development
 * (outside Telegram, window.Telegram is simply undefined).
 */

export function getTelegramWebApp(): TelegramWebApp | null {
  return window.Telegram?.WebApp ?? null;
}

export function initTelegram(): void {
  const wa = getTelegramWebApp();
  if (!wa) return; // running outside Telegram (plain browser) - nothing to do

  try {
    wa.ready();
    wa.expand();
    // requestFullscreen is only available on recent Telegram clients; fullscreen is what
    // actually lets screen.orientation.lock() succeed later in orientation.ts, so we ask
    // for it as early as possible.
    wa.requestFullscreen?.();
    wa.setHeaderColor?.('#05060a');
    wa.setBackgroundColor?.('#05060a');
  } catch {
    // older Telegram client versions may not implement some of these calls - ignore
  }
}

export function getTelegramUserName(): string | null {
  const user = getTelegramWebApp()?.initDataUnsafe?.user;
  if (!user) return null;
  if (user.username) return '@' + user.username;
  return user.first_name + (user.last_name ? ' ' + user.last_name : '');
}

export function isInsideTelegram(): boolean {
  return getTelegramWebApp() !== null;
}

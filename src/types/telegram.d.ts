// Minimal ambient types for the Telegram WebApp bridge (window.Telegram.WebApp).
// Only the fields Step 1 actually touches are declared; we extend this file as later
// steps need more of the API (haptics, theme params, main button, etc).

interface TelegramWebAppUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

interface TelegramWebApp {
  ready(): void;
  expand(): void;
  requestFullscreen?(): void;
  isExpanded?: boolean;
  viewportHeight?: number;
  viewportStableHeight?: number;
  platform?: string;
  colorScheme?: 'light' | 'dark';
  initDataUnsafe?: {
    user?: TelegramWebAppUser;
  };
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  onEvent?(eventType: string, callback: () => void): void;
  offEvent?(eventType: string, callback: () => void): void;
}

interface Window {
  Telegram?: {
    WebApp?: TelegramWebApp;
  };
}

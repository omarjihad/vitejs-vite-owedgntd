import './style.css';
import { initTelegram } from './core/telegram';
import { initForcedLandscape } from './core/orientation';
import { mountLoadingScreen } from './ui/loading';

async function bootstrap() {
  initTelegram();
  await initForcedLandscape();

  const app = document.getElementById('app');
  if (!app) throw new Error('#app root element missing from index.html');

  mountLoadingScreen(app, () => {
    // Step 1 stops here on purpose. Step 2 will take over from this callback and boot
    // the actual PixiJS renderer / game engine instead of just logging.
    // eslint-disable-next-line no-console
    console.log('[Step 1 complete] Telegram + forced landscape + loading screen are ready. Waiting for Step 2.');
  });
}

bootstrap();

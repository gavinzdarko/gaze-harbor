import { cp, mkdir } from 'node:fs/promises';
await mkdir('public/vendor', { recursive: true });
await cp('node_modules/webgazer/dist/webgazer.js', 'public/vendor/webgazer.js');
await cp('node_modules/webgazer/dist/mediapipe', 'public/vendor/mediapipe', { recursive: true });

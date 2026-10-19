import { defineConfig } from 'vite';
const headers = {
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};
export default defineConfig({ server: { headers }, preview: { headers } });

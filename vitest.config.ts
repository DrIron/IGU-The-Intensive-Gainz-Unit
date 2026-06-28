import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 10000,
    // Dummy Supabase env so modules that import `@/integrations/supabase/client`
    // at top level (e.g. canonicalSessionResolver, clientPlanBoardAdapter,
    // deloadAutoApply — all tested via pure helpers) can load under CI, where no
    // .env is present. createClient() needs a valid-looking URL or it throws
    // "supabaseUrl is required". Unit tests never hit the network; this only lets
    // the module graph instantiate. Real values come from .env locally / Vercel in prod.
    env: {
      VITE_SUPABASE_URL: 'https://test.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'test-anon-key',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});

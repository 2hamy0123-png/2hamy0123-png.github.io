import { defineConfig } from 'vitest/config';

// Security-rules tests need the Firestore emulator: run `npm run test:rules`.
export default defineConfig({
  test: { include: ['rules-test/**/*.test.ts'], testTimeout: 20000, fileParallelism: false },
});

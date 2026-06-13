import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out/test/**/*.spec.js',
  version: 'stable',
  mocha: {
    ui: 'bdd',
    timeout: 60000
  }
});

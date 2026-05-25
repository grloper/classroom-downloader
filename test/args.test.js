import test from 'node:test';
import assert from 'node:assert/strict';
import { hasFlag } from '../src/utils/args.js';

test('hasFlag reads direct argv flags', () => {
  assert.equal(hasFlag('--export-only', ['node', 'script.js', '--export-only'], {}), true);
});

test('hasFlag reads npm config flags', () => {
  assert.equal(hasFlag('--export-only', ['node', 'script.js'], { npm_config_export_only: 'true' }), true);
  assert.equal(hasFlag('--api-only', ['node', 'script.js'], { npm_config_api_only: 'true' }), true);
});

test('hasFlag reads npm inverted no flags', () => {
  assert.equal(hasFlag('--no-download', ['node', 'script.js'], { npm_config_download: '' }), true);
});

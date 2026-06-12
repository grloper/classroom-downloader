import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { getSourcePath, quoteForCmd, sourceRoot } from '../src/utils/runtimePaths.js';

test('sourceRoot points at the bundled src directory', () => {
  assert.equal(path.basename(sourceRoot), 'src');
  assert.equal(getSourcePath('system', 'engine.js'), path.join(sourceRoot, 'system', 'engine.js'));
});

test('quoteForCmd wraps command arguments for visible Windows launches', () => {
  assert.equal(quoteForCmd('C:\\Program Files\\node\\node.exe'), '"C:\\Program Files\\node\\node.exe"');
  assert.equal(quoteForCmd('name "with quotes"'), '"name ""with quotes"""');
});

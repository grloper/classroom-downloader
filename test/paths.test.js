import test from 'node:test';
import assert from 'node:assert/strict';
import { safeSegment } from '../src/utils/paths.js';

test('safeSegment removes cross-platform unsafe path characters', () => {
  assert.equal(safeSegment('Algebra: Unit / Lesson * 1?'), 'Algebra Unit Lesson 1');
});

test('safeSegment avoids reserved Windows names', () => {
  assert.equal(safeSegment('con'), 'con_');
});

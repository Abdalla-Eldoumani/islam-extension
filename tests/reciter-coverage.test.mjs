import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCoverageLabel } from '../shared/reciter-coverage.js';

test('getCoverageLabel returns unknown for stale or empty coverage', () => {
  assert.equal(getCoverageLabel(null, 'qc:7'), 'unknown');
  assert.equal(getCoverageLabel({}, 'qc:7'), 'unknown');
  assert.equal(getCoverageLabel({ timestamp: Date.now(), map: {} }, 'qc:7'), 'unknown');
});

test('getCoverageLabel returns unknown for entries past the 30-day TTL', () => {
  const stale = { timestamp: Date.now() - 31 * 24 * 60 * 60 * 1000, map: { 'qc:7': 'complete' } };
  assert.equal(getCoverageLabel(stale, 'qc:7'), 'unknown');
});

test('getCoverageLabel returns the cached label within the TTL window', () => {
  const fresh = { timestamp: Date.now() - 1000, map: { 'qc:7': 'complete', 'mp3:228': 'limited' } };
  assert.equal(getCoverageLabel(fresh, 'qc:7'), 'complete');
  assert.equal(getCoverageLabel(fresh, 'mp3:228'), 'limited');
  assert.equal(getCoverageLabel(fresh, 'unknown:key'), 'unknown');
});

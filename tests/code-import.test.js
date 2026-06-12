import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseW3cTokens } from '../src/code-import/w3c-tokens.js';

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'code-import');
const fixture = (name) => readFileSync(join(FIX, name), 'utf8');

test('w3c: extracts colors with $value and legacy value, drops group prefix', () => {
  const { tokens } = parseW3cTokens(fixture('tokens-style-dictionary.json'));
  assert.equal(tokens.color['brand-primary'], '#0969da');
  assert.equal(tokens.color['brand-secondary'], '#6639ba');
});

test('w3c: resolves {alias} references', () => {
  const { tokens } = parseW3cTokens(fixture('tokens-style-dictionary.json'));
  assert.equal(tokens.color['text-default'], '#0969da');
});

test('w3c: dimensions become numbers (px direct, rem ×16)', () => {
  const { tokens } = parseW3cTokens(fixture('tokens-style-dictionary.json'));
  assert.equal(tokens.radius['radius-md'], 6);
  assert.equal(tokens.radius['radius-lg'], 12);
  assert.equal(tokens.spacing['spacing-sm'], 8);
});

test('w3c: typography tokens keep the full shape', () => {
  const { tokens } = parseW3cTokens(fixture('tokens-style-dictionary.json'));
  assert.deepEqual(tokens.typography['font-body'], { fontFamily: 'Inter', fontSize: 14, fontWeight: 400, lineHeight: 20 });
  assert.ok(tokens.fonts.includes('Inter'));
});

test('w3c: cyclic aliases throw a clear error', () => {
  const cyclic = JSON.stringify({ a: { $value: '{b}' }, b: { $value: '{a}' } });
  assert.throws(() => parseW3cTokens(cyclic), /cycl|circular/i);
});

test('w3c: invalid JSON throws with context', () => {
  assert.throws(() => parseW3cTokens('not json'), /JSON/);
});

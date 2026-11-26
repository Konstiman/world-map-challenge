import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('startup bypasses old cached URLs throughout the local module graph and map metadata', () => {
  const root = new URL('./', import.meta.url);
  const html = readFileSync(new URL('index.html', root), 'utf8');
  const entry = html.match(/<script src="(bootstrap\.js\?[^"]+)"><\/script>/)?.[1];
  assert.ok(entry, 'The classic bootstrap must run before importing the app');
  const version = new URL(entry, root).searchParams.get('version');
  assert.ok(version);
  const pending = [entry];
  const visited = new Set();
  while (pending.length) {
    const url = new URL(pending.pop(), root);
    if (visited.has(url.href)) continue;
    visited.add(url.href);
    assert.equal(url.searchParams.get('version'), version, `Unversioned or mismatched dependency: ${url}`);
    const source = readFileSync(url, 'utf8');
    for (const match of source.matchAll(/(?:from\s+|import\(\s*)['"](\.\/[^'"]+\.js(?:\?[^'"]*)?)['"]/g)) {
      pending.push(match[1]);
    }
    if (url.pathname.endsWith('/game.js')) {
      const metadata = source.match(/d3\.json\(['"](\.\/countries\.json[^'"]*)['"]/)?.[1];
      assert.ok(metadata, 'Country metadata must be loaded');
      assert.equal(new URL(metadata, root).searchParams.get('version'), version);
    }
  }
  assert.ok(visited.has(new URL(`game.js?version=${version}`, root).href), 'The graph must include map initialization');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const modules = ['exams', 'candidates', 'subjects', 'sbd', 'rooming', 'settings'];

test('each application tab has a separate mount and HTML module with unique IDs', async () => {
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const loader = await readFile(new URL('../js/module-loader.js', import.meta.url), 'utf8');
  const ids = [...index.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);

  for (const name of modules) {
    assert.match(index, new RegExp(`id="module-${name}"`));
    const html = await readFile(new URL(`../modules/${name}.html`, import.meta.url), 'utf8');
    assert.match(html, new RegExp(`<section\\s+class="tab-panel(?:\\s+hidden)?"\\s+id="tab-${name}"`));
    assert.match(loader, new RegExp(`'${name}'`));
    ids.push(...[...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
  }

  assert.equal(new Set(ids).size, ids.length, 'HTML IDs must remain unique across modules');
});

test('exam creation and selection do not force navigation to the subjects tab', async () => {
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /switchTab\('subjects'\)/);
  assert.match(app, /notifyExamSelected\(data,true\)/);
  assert.match(app, /notifyExamSelected\(exam\)/);
  assert.match(app, /function updateSelectedExamTitle\(\)/);
});

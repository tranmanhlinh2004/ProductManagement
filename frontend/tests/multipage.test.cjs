
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('shared navigation contains products and scanner after removing barcode creation', () => {
  const source = readFileSync(path.join(__dirname, '../assets/js/script.js'), 'utf8');
  const links = [];
  let initialize;
  vm.runInNewContext(source, {
    document: {
      body: { dataset: { page: 'products' } },
      addEventListener: (_, callback) => { initialize = callback; },
      getElementById: () => ({ append: link => links.push(link) }),
      createElement: () => ({ setAttribute(name, value) { this[name] = value; } })
    }
  });
  initialize();
  assert.deepEqual(links.map(link => link.href), ['products.html', 'scanner.html']);
  assert.equal(links[0]['aria-current'], 'page');
  assert.equal(links[1]['aria-current'], undefined);
});

test('legacy barcode URL points visitors to the products page', () => {
  const source = readFileSync(path.join(__dirname, '../sources/barcode.html'), 'utf8');
  assert.match(source, /http-equiv="refresh" content="0; url=products.html"/);
  assert.doesNotMatch(source, /barcode-form/);
});

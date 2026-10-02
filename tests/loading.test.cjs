const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');

function frontend() {
  let spec;
  let next = 0;
  const timers = new Map();
  const images = [];
  const context = {
    Module: { register: (_, value) => { spec = value; } },
    console,
    Date,
    Image: class { constructor() { images.push(this); } },
    setTimeout: (fn, ms) => { timers.set(++next, { fn, ms }); return next; },
    clearTimeout: id => timers.delete(id),
    setInterval: () => 0
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'MMM-MuseumMasterpiece.js'), 'utf8'), context);
  const sent = [];
  const instance = { ...spec, config: { ...spec.defaults, refreshAtMidnight: false },
    sendSocketNotification: (...args) => sent.push(args), updateDom() {} };
  instance.start();
  const fire = ms => {
    const entry = [...timers].find(([, timer]) => timer.ms === ms);
    assert.ok(entry, `timer ${ms} exists`);
    timers.delete(entry[0]); entry[1].fn();
  };
  return { instance, images, timers, sent, fire };
}

test('unanswered helper request shows local artwork and permits another request', () => {
  const { instance, fire, sent } = frontend();
  instance.sendFetchRequest();
  assert.equal(sent.length, 1);
  fire(30000);
  assert.equal(instance.art, instance.fallbackArt);
  assert.equal(instance.loaded, true);
  instance.sendFetchRequest();
  assert.equal(sent.length, 2);
});

for (const failure of ['error', 'timeout']) {
  test(`image ${failure} shows fallback on first load`, () => {
    const { instance, images, fire } = frontend();
    instance.socketNotificationReceived('AIC_RESULT', { image: 'https://example.org/art.jpg' });
    if (failure === 'error') images[0].onerror(); else fire(15000);
    assert.equal(instance.art, instance.fallbackArt);
    assert.equal(instance.isFetching, false);
    assert.equal(images[0].onload, null);
  });
}

test('late successful artwork replaces fallback; failed refresh preserves it', () => {
  const { instance, images, fire, timers } = frontend();
  fire(30000);
  const art = { image: 'https://example.org/art.jpg' };
  instance.socketNotificationReceived('AIC_RESULT', art);
  images[0].onload();
  assert.equal(instance.art, art);
  assert.equal(timers.size, 0);
  instance.sendFetchRequest();
  instance.socketNotificationReceived('AIC_RESULT', { image: 'https://example.org/broken.jpg' });
  images[1].onerror();
  assert.equal(instance.art, art);
});

function backend(fetch) {
  const context = { module: { exports: {} }, require: () => ({ create: x => x }),
    global: { fetch }, AbortController, URL, setTimeout, clearTimeout, console };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'node_helper.js'), 'utf8'), context);
  return { ...context.module.exports, requestTimeoutMs: 10 };
}

for (const stage of ['headers', 'body']) {
  test(`API timeout aborts stalled ${stage}`, async () => {
    let signal;
    const helper = backend(async (_, options) => {
      signal = options.signal;
      const stalled = () => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
      if (stage === 'headers') return stalled();
      return { ok: true, json: stalled };
    });
    await assert.rejects(helper._fetchJson('https://example.org/api'), /aborted/);
    assert.equal(signal.aborted, true);
  });
}

test('HTTP failures are rejected before parsing the body', async () => {
  const helper = backend(async () => ({ ok: false, status: 503, json() { throw new Error('must not parse'); } }));
  await assert.rejects(helper._fetchJson('https://example.org/api'), /HTTP 503/);
});

test('exhausted providers notify the frontend instead of silently returning', async () => {
  const helper = backend(async () => ({ ok: false, status: 503 }));
  helper.start();
  const sent = [];
  helper.sendSocketNotification = (...args) => sent.push(args);
  await helper.socketNotificationReceived('AIC_FETCH', { seed: 'test', providers: ['AIC'], imageSize: 843 });
  assert.equal(sent.length, 1);
  assert.equal(sent[0][0], 'AIC_ERROR');
});

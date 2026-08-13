'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'config.js'), 'utf8');

function boot({ mode = null, serverTime = null, clientNow = '2026-08-13T12:00:00Z' } = {}) {
  const metas = {
    'meta[name="diktant-mode"]': mode === null ? null : { getAttribute: () => mode },
    'meta[name="server-time"]': serverTime === null ? null : { getAttribute: () => serverTime }
  };
  const NativeDate = Date;
  const nowMs = NativeDate.parse(clientNow);
  class FakeDate extends NativeDate {
    static now() { return nowMs; }
  }
  const context = {
    window: {},
    document: { querySelector: selector => metas[selector] || null },
    Date: FakeDate,
    Number
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'config.js' });
  return context.window.DIKTANT;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const demo = boot();
assert(demo.CONFIG.runtimeMode === 'demo', 'режим без meta должен быть demo');
assert(demo.status.production() === false, 'demo не должен считаться production');
assert(demo.status.timeReady() === true, 'demo может использовать часы устройства');
assert(demo.status.synced === false, 'demo без server-time не синхронизирован');

const brokenProd = boot({ mode: 'production' });
assert(brokenProd.status.production() === true, 'production meta не распознан');
assert(brokenProd.status.timeReady() === false, 'production без server-time должен блокироваться');
assert(brokenProd.status.started() === false, 'production без времени не должен стартовать');
assert(brokenProd.status.ongoing() === false, 'production без времени не должен идти');

const ongoing = boot({
  mode: 'production',
  serverTime: '2026-11-06T12:00:00+03:00'
});
assert(ongoing.status.synced === true, 'server-time должен включить синхронизацию');
assert(ongoing.status.timeReady() === true, 'production с server-time должен быть готов');
assert(ongoing.status.started() === true, 'событие должно начаться 06.11');
assert(ongoing.status.ongoing() === true, 'событие должно идти 06.11');

const ended = boot({
  mode: 'production',
  serverTime: '2026-11-09T00:00:00+03:00'
});
assert(ended.status.started() === true, 'после финиша started остаётся true');
assert(ended.status.ongoing() === false, 'после финиша ongoing должен быть false');

console.log('runtime modes: OK');

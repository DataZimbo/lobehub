import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const entry = require.resolve('../update');
const electron = require.resolve('electron');
const rescue = require.resolve('../rescue');
const updaterPath = require.resolve('../rescue/electron-updater.cjs');
let updater;
let userData, window, handler, app, createStartupUpdate;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const marker = () =>
  JSON.parse(fs.readFileSync(path.join(userData, 'startup-update.json'), 'utf8'));
const action = (value) => handler({ sender: window.webContents }, value);
beforeEach(() => {
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'startup-update-'));
  app = Object.assign(new EventEmitter(), {
    exit: vi.fn(),
    quit: vi.fn(),
    getLocale: () => 'zh-CN',
    getPath: () => userData,
    whenReady: async () => {},
    releaseSingleInstanceLock: vi.fn(),
    relaunch: vi.fn(),
  });
  class Window extends EventEmitter {
    constructor() {
      super();
      // eslint-disable-next-line @typescript-eslint/no-this-alias -- Expose the fake native window to the test.
      window = this;
      this.webContents = Object.assign(new EventEmitter(), {
        send: vi.fn(),
        setWindowOpenHandler: vi.fn(),
      });
    }
    center() {}
    destroy() {
      this.destroyed = true;
      if (!app.emit('window-all-closed')) app.quit();
    }
    isDestroyed() {
      return this.destroyed;
    }
    async loadFile() {}
    show() {}
    focus() {}
  }
  require.cache[electron] = {
    exports: {
      app,
      BrowserWindow: Window,
      nativeTheme: {},
      ipcMain: {
        handle: (_channel, callback) => {
          handler = callback;
        },
        removeHandler: vi.fn(),
      },
    },
  };
  require.cache[rescue] = {
    exports: {
      configureUpdater: vi.fn(),
      resolveChannel: () => 'stable',
      resolveFeedUrl: () => 'https://updates.test',
    },
    loaded: true,
  };
  updater = Object.assign(new EventEmitter(), {
    checkForUpdates: vi.fn(async () => ({ isUpdateAvailable: true })),
    downloadUpdate: vi.fn(async () => {
      updater.emit('download-progress', { percent: 45 });
    }),
    quitAndInstall: vi.fn(),
  });
  require.cache[updaterPath] = { exports: { autoUpdater: updater }, loaded: true };
  delete require.cache[entry];
  ({ createStartupUpdate } = require(entry));
});
afterEach(() => {
  for (const file of [entry, electron, rescue, updaterPath]) delete require.cache[file];
  fs.rmSync(userData, { recursive: true, force: true });
});
it('keeps first launch pending until the check passes and the business renderer is healthy', async () => {
  const gate = createStartupUpdate({ userData });
  gate.markHealthy();
  expect(marker().completed).toBe(false);
  await expect(gate.run(async () => 'ready')).resolves.toBe(true);
  expect(window.isDestroyed()).toBe(true);
  expect(app.quit).not.toHaveBeenCalled();
  expect(marker().completed).toBe(false);
  gate.markHealthy();
  expect(marker().completed).toBe(true);
  const check = vi.fn();
  await createStartupUpdate({ userData }).run(check);
  expect(check).not.toHaveBeenCalled();
});
it('migrates existing installations without forcing them through first launch again', async () => {
  fs.writeFileSync(path.join(userData, 'lobehub-settings.json'), '{}');
  const check = vi.fn();
  await expect(createStartupUpdate({ userData }).run(check)).resolves.toBe(true);
  expect(check).not.toHaveBeenCalled();
});
it('shows a recoverable error, ignores concurrent retries, and completes after a successful retry', async () => {
  let resume;
  const check = vi
    .fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resume = resolve;
        }),
    );
  const result = createStartupUpdate({ userData }).run(check);
  await flush();
  expect(action('state')).toMatchObject({ phase: 'error', language: 'zh-CN' });
  expect(marker().completed).toBe(false);
  action('retry');
  action('retry');
  expect(check).toHaveBeenCalledTimes(2);
  expect(() => handler({ sender: {} }, 'quit')).toThrow('Untrusted');
  resume('ready');
  await expect(result).resolves.toBe(true);
});
it('quits without completing first launch and retries the gate on the next launch', async () => {
  const result = createStartupUpdate({ userData }).run(async () => {
    throw new Error('offline');
  });
  await flush();
  action('quit');
  await expect(result).resolves.toBe(false);
  expect(app.exit).toHaveBeenCalledWith(0);
  expect(createStartupUpdate({ userData }).pending).toBe(true);
  expect(app.listenerCount('activate')).toBe(0);
});

it('uses the full installer when required and leaves first launch pending until the new app boots', async () => {
  updater.downloadUpdate.mockRejectedValueOnce(new Error('download failed'));
  const result = createStartupUpdate({ userData }).run(async () => 'full-update');
  await flush();
  expect(action('state').phase).toBe('error');
  expect(updater.quitAndInstall).not.toHaveBeenCalled();
  action('retry');
  await flush();
  expect(window.webContents.send).toHaveBeenCalledWith(
    'shell:update-state',
    expect.objectContaining({ phase: 'downloading', percent: 45 }),
  );
  expect(updater.quitAndInstall).toHaveBeenCalledWith(true, true);
  expect(app.releaseSingleInstanceLock).not.toHaveBeenCalled();
  expect(marker().completed).toBe(false);
  action('quit');
  await result;
  expect(updater.listenerCount('download-progress')).toBe(0);
});

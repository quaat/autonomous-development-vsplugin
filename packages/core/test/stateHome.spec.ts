import assert from 'node:assert/strict';
import { join } from 'node:path';
import { expandUser, resolveStateHome } from '../src/stateHome';

const HOME = '/home/tester';

describe('resolveStateHome (REFERENCE §1 precedence + platform matrix)', () => {
  it('honors the explicit setting override above all else', () => {
    const result = resolveStateHome({
      settingOverride: '/custom/state',
      env: { CLAUDE_AUTONOMOUS_STATE_HOME: '/env/state' },
      platform: 'linux',
      homedir: HOME
    });
    assert.equal(result, '/custom/state');
  });

  it('falls back to CLAUDE_AUTONOMOUS_STATE_HOME when no override', () => {
    const result = resolveStateHome({
      env: { CLAUDE_AUTONOMOUS_STATE_HOME: '/env/state' },
      platform: 'linux',
      homedir: HOME
    });
    assert.equal(result, '/env/state');
  });

  it('ignores a blank override / blank env var', () => {
    const result = resolveStateHome({
      settingOverride: '   ',
      env: { CLAUDE_AUTONOMOUS_STATE_HOME: '' },
      platform: 'linux',
      homedir: HOME
    });
    assert.equal(result, join(HOME, '.local', 'state', 'claude-autonomous'));
  });

  it('Linux default uses ~/.local/state (NOT .local/share)', () => {
    const result = resolveStateHome({ env: {}, platform: 'linux', homedir: HOME });
    assert.equal(result, join(HOME, '.local', 'state', 'claude-autonomous'));
  });

  it('Linux honors XDG_STATE_HOME when set', () => {
    const result = resolveStateHome({
      env: { XDG_STATE_HOME: '/xdg' },
      platform: 'linux',
      homedir: HOME
    });
    assert.equal(result, join('/xdg', 'claude-autonomous'));
  });

  it('macOS default uses Library/Application Support', () => {
    const result = resolveStateHome({ env: {}, platform: 'darwin', homedir: HOME });
    assert.equal(result, join(HOME, 'Library', 'Application Support', 'claude-autonomous'));
  });

  it('Windows uses LOCALAPPDATA when present', () => {
    const result = resolveStateHome({
      env: { LOCALAPPDATA: 'C:\\Users\\t\\AppData\\Local' },
      platform: 'win32',
      homedir: HOME
    });
    assert.equal(result, join('C:\\Users\\t\\AppData\\Local', 'claude-autonomous'));
  });

  it('Windows falls back to ~/AppData/Local without LOCALAPPDATA', () => {
    const result = resolveStateHome({ env: {}, platform: 'win32', homedir: HOME });
    assert.equal(result, join(HOME, 'AppData', 'Local', 'claude-autonomous'));
  });

  it('expands ~ in an override', () => {
    const result = resolveStateHome({
      settingOverride: '~/mystate',
      env: {},
      platform: 'linux',
      homedir: HOME
    });
    assert.equal(result, join(HOME, 'mystate'));
  });
});

describe('expandUser', () => {
  it('expands a bare tilde', () => {
    assert.equal(expandUser('~', HOME), HOME);
  });
  it('expands ~/path', () => {
    assert.equal(expandUser('~/a/b', HOME), join(HOME, 'a/b'));
  });
  it('leaves other paths unchanged', () => {
    assert.equal(expandUser('/abs/path', HOME), '/abs/path');
    assert.equal(expandUser('relative/path', HOME), 'relative/path');
  });
});

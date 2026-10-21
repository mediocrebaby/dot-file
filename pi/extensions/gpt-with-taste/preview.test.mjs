import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {registerHooks, stripTypeScriptTypes} from 'node:module';
import test from 'node:test';

import {createTasteExtension} from './runtime.mjs';
import {block, previewPrompt, SECTION} from './projection.mjs';

// Load the real viewer without requiring Pi's terminal packages in the test process.
const viewerURL = new URL('../pi-system-prompt/index.ts', import.meta.url).href;
const tuiURL = `data:text/javascript,${encodeURIComponent(`
  export const matchesKey = (input, key) => input === key;
  export const visibleWidth = text => Array.from(text).length;
  export const wrapTextWithAnsi = (text, width) => {
    if (!text) return [''];
    const result = [];
    for (let offset = 0; offset < text.length; offset += width) result.push(text.slice(offset, offset + width));
    return result;
  };
`)}`;
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL === viewerURL && specifier === '@mariozechner/pi-tui') {
      return {url: tuiURL, shortCircuit: true};
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === viewerURL) {
      return {format: 'module', shortCircuit: true,
        source: stripTypeScriptTypes(readFileSync(new URL(url), 'utf8'), {mode: 'transform'})};
    }
    return next(url, context);
  },
});
const {default: registerViewer} = await import(viewerURL);
hooks.deregister();

const manifest = JSON.parse(readFileSync(new URL('./texts.json', import.meta.url), 'utf8'));
const texts = Object.fromEntries(Object.entries(manifest).map(([key, file]) =>
  [key, readFileSync(new URL(file, import.meta.url), 'utf8').trim()]));
const tools = [{name: 'read', description: 'Read a file', parameters: {type: 'object'}, sourceInfo: {source: 'builtin'}}];

function setup(t, {taste = true, viewer = true, viewerFirst = false, role = 'main'} = {}) {
  const bus = new EventEmitter();
  const handlers = new Map();
  const commands = new Map();
  const state = {model: {provider: 'openai', id: 'gpt-5'}, branch: [], prompt: 'Host instructions', views: []};
  const pi = {
    events: {on: (name, fn) => { bus.on(name, fn); return () => bus.off(name, fn); }, emit: (name, data) => bus.emit(name, data)},
    on: (name, fn) => { handlers.set(name, [...(handlers.get(name) ?? []), fn]); },
    registerCommand: (name, command) => commands.set(name, command),
    appendEntry: (customType, data) => state.branch.push({type: 'custom', customType, data}),
    getActiveTools: () => ['read'],
    getAllTools: () => [...tools, {name: 'inactive', description: 'Not enabled', parameters: {}}],
  };
  const theme = {fg: (_color, text) => text, bold: text => text};
  const context = {
    get model() { return state.model; },
    sessionManager: {getBranch: () => state.branch},
    getSystemPrompt: () => state.prompt,
    waitForIdle: async () => {},
    hasUI: true,
    ui: {
      notify() {},
      async custom(factory) {
        let terminal = '';
        const write = t.mock.method(process.stdout, 'write', chunk => { terminal += chunk; return true; });
        let view;
        try {
          view = factory({height: 24}, theme, {}, () => {});
          const rendered = view.render(120);
          view.handleInput('c');
          const clipboard = terminal.match(/\x1b\]52;c;([^\x07]+)\x07/);
          assert.ok(clipboard, 'copy must use the existing viewer clipboard path');
          state.views.push({rendered, copied: Buffer.from(clipboard[1], 'base64').toString('utf8')});
        } finally {
          view?.dispose();
          write.mock.restore();
        }
      },
    },
  };
  if (viewer && viewerFirst) registerViewer(pi);
  if (taste) createTasteExtension({role})(pi);
  if (viewer && !viewerFirst) registerViewer(pi);
  return {
    pi, state, handlers, context,
    async preview() {
      await commands.get('system-prompt').handler('', context);
      return state.views.at(-1);
    },
    async taste(command) { await commands.get('taste').handler(command, context); },
  };
}

for (const viewerFirst of [false, true]) {
  test(`首次请求前展示并复制 taste，扩展加载顺序 viewerFirst=${viewerFirst}`, async t => {
    const app = setup(t, {viewerFirst});
    app.pi.events.emit('environment:prompt', 'Runtime Environment: test');
    app.pi.events.emit('today:date', 'Today: 2026-10-21');
    const view = await app.preview();
    assert.ok(view.rendered.some(line => line.includes('System Prompt Preview')));
    assert.ok(view.copied.startsWith('Today: 2026-10-21\n\nRuntime Environment: test\n\nHost instructions'));
    assert.ok(view.copied.includes(block(texts, 'main')));
    assert.ok(view.copied.includes('Tool Definitions (1 tools)'));
    assert.ok(view.copied.includes('name: read'));
    assert.ok(!view.copied.includes('name: inactive'));
    assert.equal(app.state.prompt, 'Host instructions', 'preview must not change the actual prompt');
    assert.deepEqual(app.state.branch, [], 'preview must not create session history');
  });
}

test('viewer 不依赖 taste，保持日期、环境、工具和复制功能', async t => {
  const app = setup(t, {taste: false});
  app.pi.events.emit('environment:prompt', 'Environment');
  app.pi.events.emit('today:date', 'Today');
  const {copied} = await app.preview();
  assert.ok(copied.startsWith('Today\n\nEnvironment\n\nHost instructions\n\n────────────────'));
  assert.ok(copied.includes('name: read'));
  assert.ok(!copied.includes('<gpt-with-taste>'));
});

test('通用预览入口允许其他扩展参与，不包含 taste 专用逻辑', async t => {
  const app = setup(t, {taste: false});
  app.pi.events.on('system-prompt:preview', preview => {
    assert.equal(preview.context, app.context);
    preview.prompt += '\n\nOther extension instructions';
  });
  const {copied} = await app.preview();
  assert.ok(copied.includes('Host instructions\n\nOther extension instructions'));
});

test('每次打开都读取当前会话的 taste 开关，steer off 不隐藏系统指令', async t => {
  const app = setup(t);
  assert.ok((await app.preview()).copied.includes(block(texts, 'main')));
  await app.taste('off');
  assert.ok(!(await app.preview()).copied.includes('<gpt-with-taste>'));
  await app.taste('on');
  await app.taste('steer off');
  const {copied} = await app.preview();
  assert.ok(copied.includes(block(texts, 'main')));
  assert.ok(!copied.includes('<gpt-with-taste-user-steer>'));
  await app.taste('off');
  await app.taste('reset');
  assert.ok((await app.preview()).copied.includes(block(texts, 'main')));
});

test('已注入内容只显示一次，关闭后从预览移除但不修改宿主提示词', async t => {
  const app = setup(t);
  const original = `Host instructions\n\n${block(texts, 'main')}`;
  app.state.prompt = original;
  const active = (await app.preview()).copied;
  assert.equal(active.split('<gpt-with-taste>').length - 1, 1);
  await app.taste('off');
  const inactive = (await app.preview()).copied;
  assert.ok(!inactive.includes('<gpt-with-taste>'));
  assert.ok(inactive.startsWith('Host instructions\n\n────────────────'));
  assert.equal(app.state.prompt, original);
});

test('旧块位于开头、中间或结尾时精确保留宿主文本与分隔符', () => {
  for (const newline of ['\n', '\r\n']) {
    const separator = newline.repeat(2);
    const previous = block(texts, 'sub').replaceAll('\n', newline);
    const host = `Host A${separator}Host B`;
    for (const prompt of [
      `${previous}${separator}${host}`,
      `Host A${separator}${previous}${separator}Host B`,
      `${host}${separator}${previous}`,
      `${previous}${separator}${previous}${separator}${host}`,
    ]) {
      assert.equal(previewPrompt(prompt, texts, {role: 'main', active: false}), host);
      const active = previewPrompt(prompt, texts, {role: 'main', active: true});
      assert.equal(active, `${host}\n\n${block(texts, 'main')}`);
      assert.equal(previewPrompt(active, texts, {role: 'main', active: true}), active);
    }
  }
});

test('切换或恢复会话分支时使用该分支的状态，不缓存其他会话的内容', async t => {
  const app = setup(t);
  await app.taste('off');
  const disabledBranch = app.state.branch;
  app.state.branch = [];
  assert.ok((await app.preview()).copied.includes(block(texts, 'main')));
  app.state.branch = disabledBranch;
  assert.ok(!(await app.preview()).copied.includes('<gpt-with-taste>'));
});

test('切换模型和 provider 后预览立即反映实际注入条件', async t => {
  const app = setup(t);
  app.state.prompt += `\n\n${block(texts, 'main')}`;
  for (const [provider, id, expected] of [
    ['anthropic', 'claude-sonnet', false],
    ['openai', 'o3', false],
    ['openai-codex', 'gpt-5', true],
    ['cliproxyapi', 'gpt-5', true],
  ]) {
    app.state.model = {provider, id};
    assert.equal((await app.preview()).copied.includes('<gpt-with-taste>'), expected, `${provider}/${id}`);
  }
  app.state.model = undefined;
  assert.ok(!(await app.preview()).copied.includes('<gpt-with-taste>'));
});

for (const role of ['main', 'sub', 'independent']) {
  test(`${role} 角色的预览、系统投影和 provider 兜底使用相同指令`, async t => {
    const app = setup(t, {role});
    const expected = block(texts, role);
    const {copied} = await app.preview();
    assert.ok(copied.includes(expected));
    const projected = app.handlers.get('context_with_system')[0]({messages: [
      {role: 'system', sections: {base: 'Host instructions'}},
      {role: 'user', content: 'Hello', timestamp: 1},
    ]}, app.context).messages;
    assert.equal(projected[0].sections[SECTION], expected);
    const payload = app.handlers.get('before_provider_request')[0]({payload: {
      model: 'gpt-5', instructions: 'Host instructions', input: [],
    }}, app.context);
    assert.equal(payload.instructions, `Host instructions\n\n${expected}`);
    assert.ok(!copied.includes('<gpt-with-taste-user-steer>'));
    assert.ok(!copied.includes('<gpt-with-taste-sub-steer>'));
  });
}

test('taste 无 viewer 时仍可独立注入，预览能力不是请求前置条件', t => {
  const app = setup(t, {viewer: false});
  const {messages} = app.handlers.get('context_with_system')[0]({messages: [
    {role: 'system', sections: {base: 'Host instructions'}},
  ]}, app.context);
  assert.equal(messages[0].sections[SECTION], block(texts, 'main'));
});

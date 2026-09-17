import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  getQoderCNDirectModel,
  getQoderCNFriendlyModelInfo,
  toQoderCNFriendlyModel,
} from "../cosy.ts";
import { staticCnModels, staticModels } from "../models.ts";

const pairs = [["glm-5.3", "gmodel"], ["kimi-k3", "kmodel_latest"]] as const;

test("CN friendly IDs round-trip to distinct request keys", () => {
  for (const [id, key] of pairs) {
    assert.equal(getQoderCNDirectModel(id), key);
    assert.equal(getQoderCNDirectModel(key), key);
    assert.equal(getQoderCNFriendlyModelInfo(key).id, id);
    assert.equal(toQoderCNFriendlyModel({ id: key, name: key }).id, id);
  }
  assert.equal(getQoderCNDirectModel("glm-5.1"), "gm51model");
  assert.equal(getQoderCNDirectModel("glm-5.2"), "gm51model");
  assert.equal(getQoderCNDirectModel("kimi-k2.6"), "kmodel");
  assert.equal(getQoderCNFriendlyModelInfo("gfmodel", "GLM-5.3-Flash").id, "gfmodel");
});

test("new static models are CN-only with image and thinking capabilities", () => {
  for (const [id, key] of pairs) {
    const model = staticCnModels.find(m => m.id === id);
    assert.ok(model);
    assert.equal(model.provider, "qoder-cn");
    assert.equal(model.contextWindow, 1000000);
    assert.equal(model.maxTokens, 32768);
    assert.equal(model.reasoning, true);
    assert.equal(model.supportsEffort, true);
    assert.deepEqual(model.input, ["text", "image"]);
    assert.ok(!staticModels.some(m => m.id === id || m.id === key));
  }
});

test("missing cache, existing raw-key cache and refreshed catalog work in an isolated home", () => {
  const home = mkdtempSync(join(tmpdir(), "qoder-cn-models-"));
  try {
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
      import assert from 'node:assert/strict';
      import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
      import { homedir } from 'node:os';
      import { join } from 'node:path';
      import { getCachedModels, getCachedModelConfig, updateQoderModelsCache } from ${JSON.stringify(new URL("../models.ts", import.meta.url).href)};
      import { getQoderCNDirectModel, toQoderCNFriendlyModel } from ${JSON.stringify(new URL("../cosy.ts", import.meta.url).href)};
      assert.equal(homedir(), process.env.QODER_TEST_HOME);
      const pairs = [['glm-5.3', 'gmodel'], ['kimi-k3', 'kmodel_latest']];
      for (const [id, key] of pairs) {
        assert.ok(getCachedModels('cn').some(m => m.id === id));
        const config = getCachedModelConfig(key, 'cn');
        assert.equal(config.key, key);
        assert.equal(config.is_reasoning, key === 'gmodel');
        assert.equal(config.is_vl, true);
        assert.deepEqual(Object.keys(config.thinking_config.enabled.efforts).sort(), ['high', 'low', 'max']);
        assert.deepEqual(getCachedModelConfig(id, 'cn'), config);
        assert.equal(getCachedModelConfig(key, 'global'), null);
      }
      const dir = join(homedir(), '.pi', 'agent');
      mkdirSync(dir, { recursive: true });
      const cache = join(dir, 'qoder-cn-models-cache.json');
      const entries = pairs.map(([id, key]) => ({
        key, enable: true, display_name: key === 'gmodel' ? 'GLM-5.3' : 'Kimi-K3',
        max_input_tokens: 180000, max_output_tokens: 16384,
        context_config: { '200K': { token_count: 200000 }, '1M': { token_count: 1000000 } },
        is_vl: true, is_reasoning: key === 'gmodel',
        thinking_config: { enabled: { efforts: { low: {}, high: {}, max: { is_default: true } } } }
      }));
      // Existing caches use raw backend IDs; registration must normalize them without a refresh.
      writeFileSync(cache, JSON.stringify({ updatedAt: Date.now(),
        models: entries.map(e => ({ id: e.key, name: e.display_name })),
        configs: Object.fromEntries(entries.map(e => [e.key, e])) }));
      assert.deepEqual(getCachedModels('cn').map(toQoderCNFriendlyModel).map(m => m.id), pairs.map(p => p[0]));
      for (const [id, key] of pairs) {
        assert.equal(getCachedModelConfig(getQoderCNDirectModel(id), 'cn').key, key);
      }
      // Only mocked HTTP and synthetic credentials; never touches the real account/cache.
      writeFileSync(join(dir, 'qoder-machine-id'), 'test-machine');
      let calls = 0;
      globalThis.fetch = async (url) => {
        calls++;
        assert.equal(url, 'https://gateway.qoder.com.cn/algo/api/v2/model/list');
        return new Response(JSON.stringify({ chat: entries }), { status: 200 });
      };
      await updateQoderModelsCache('test-token', 'test-user', '', '', 'cn');
      assert.equal(calls, 1);
      const saved = JSON.parse(readFileSync(cache, 'utf8'));
      for (const [id, key] of pairs) {
        const model = getCachedModels('cn').find(m => m.id === id);
        assert.ok(model);
        assert.equal(model.reasoning, true);
        assert.equal(model.supportsEffort, true);
        assert.equal(model.contextWindow, 1000000);
        assert.equal(model.maxTokens, 16384);
        assert.deepEqual(model.input, ['text', 'image']);
        assert.deepEqual(saved.configs[id], saved.configs[key]);
        assert.equal(getCachedModelConfig(id, 'cn').key, key);
      }
    `], {
      encoding: "utf8",
      env: { ...process.env, HOME: home, USERPROFILE: home, QODER_TEST_HOME: home },
      timeout: 30000,
    });
    assert.equal(result.status, 0, `${result.error || ""}\n${result.stdout}\n${result.stderr}`);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

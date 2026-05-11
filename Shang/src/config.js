import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const CONFIG_RELATIVE_PATH = path.join('Config', 'shang.json');

export function resolveHome(home = process.cwd()) {
  return path.resolve(home);
}

export function getConfigPath(home = process.cwd()) {
  return path.join(resolveHome(home), CONFIG_RELATIVE_PATH);
}

export function loadJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function normalizeConfig(rawConfig, home = process.cwd()) {
  const agentBlock = rawConfig.Agent ?? rawConfig.agent ?? {};
  const llmBlock = rawConfig.llm ?? rawConfig.Llm ?? rawConfig.Agent ?? {};
  const resolvedHome = resolveHome(agentBlock.home ?? rawConfig.home ?? home);
  const listen = agentBlock.listen ?? agentBlock.Listen ?? 'http://localhost:8787';

  return {
    agent: {
      name: agentBlock.name ?? agentBlock.Name ?? 'ShangAgent',
      home: resolvedHome,
      listen,
      endpoint: agentBlock.endpoint ?? agentBlock.Endpoint ?? `${listen.replace(/\/$/, '')}/agent/message`
    },
    llm: {
      baseUrl: llmBlock.baseUrl ?? llmBlock.BaseUrl ?? '',
      apiKey: llmBlock.apiKey ?? llmBlock.ApiKey ?? '',
      model: llmBlock.model ?? llmBlock.Model ?? ''
    }
  };
}

export function loadConfig(options = {}) {
  const home = resolveHome(options.home ?? process.cwd());
  const configPath = options.configPath ?? process.env.SHANG_CONFIG ?? getConfigPath(home);
  if (!existsSync(configPath)) {
    throw new Error(`Config not found: ${configPath}. Run: node src/cli.js init`);
  }

  return normalizeConfig(loadJson(configPath), home);
}

export function writeDefaultConfig(options = {}) {
  const home = resolveHome(options.home ?? process.cwd());
  const configPath = getConfigPath(home);
  const rawSource = options.from ? loadJson(path.resolve(options.from)) : {};
  const imported = normalizeConfig(rawSource, home);
  const listen = options.listen ?? imported.agent.listen;
  const name = options.name ?? imported.agent.name;
  const config = {
    agent: {
      name,
      home,
      listen,
      endpoint: `${listen.replace(/\/$/, '')}/agent/message`
    },
    llm: imported.llm
  };

  mkdirSync(path.dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return { config, configPath };
}

export function ensureShangDirs(home) {
  for (const segment of ['Raw', 'Library', 'Knowledge', 'Index', 'Agents', 'Runs', 'Config']) {
    mkdirSync(path.join(resolveHome(home), segment), { recursive: true });
  }
}

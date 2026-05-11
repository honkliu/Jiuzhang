#!/usr/bin/env node
import { existsSync } from 'node:fs';
import path from 'node:path';
import { ensureShangDirs, loadConfig, writeDefaultConfig } from './config.js';
import { hasLlmConfig } from './llm.js';
import { sendMessage } from './agent.js';
import { startAgentServer } from './server.js';
import { askKnowledge, categorizeKnowledge } from './knowledge.js';

const [command = 'help', ...args] = process.argv.slice(2);

try {
  if (command === 'init') {
    await initCommand(args);
  } else if (command === 'doctor') {
    await doctorCommand(args);
  } else if (command === 'serve') {
    await serveCommand(args);
  } else if (command === 'send') {
    await sendCommand(args);
  } else if (command === 'knowledge') {
    await knowledgeCommand(args);
  } else {
    help();
  }
} catch (error) {
  console.error(`Error: ${error?.message ?? error}`);
  process.exitCode = 1;
}

async function initCommand(args) {
  const options = parseOptions(args);
  const home = path.resolve(options.home ?? process.cwd());
  ensureShangDirs(home);
  const { configPath } = writeDefaultConfig({
    home,
    name: options.name,
    listen: options.listen,
    from: options.from
  });
  console.log(`Initialized Shang at ${home}`);
  console.log(`Config: ${configPath}`);
}

async function doctorCommand(args) {
  const options = parseOptions(args);
  const config = loadConfig({ home: options.home, configPath: options.config });
  const configPath = options.config ?? path.join(config.agent.home, 'Config', 'shang.json');
  console.log(`Agent: ${config.agent.name}`);
  console.log(`Home: ${config.agent.home}`);
  console.log(`Config: ${configPath}`);
  console.log(`Listen: ${config.agent.listen}`);
  console.log(`Endpoint: ${config.agent.endpoint}`);
  console.log(`LLM: ${hasLlmConfig(config) ? 'configured' : 'not configured'}`);
  console.log(`Raw dir: ${existsSync(path.join(config.agent.home, 'Raw')) ? 'ok' : 'missing'}`);
}

async function serveCommand(args) {
  const options = parseOptions(args);
  const config = loadConfig({ home: options.home, configPath: options.config });
  startAgentServer(config, { port: options.port, host: options.host, listen: options.listen });
}

async function sendCommand(args) {
  const options = parseOptions(args);
  const positional = options._;
  const address = positional[0];
  const text = positional.slice(1).join(' ');
  if (!address || !text) {
    throw new Error('Usage: node src/cli.js send <@agent-address> <message>');
  }

  const config = loadConfig({ home: options.home, configPath: options.config });
  const result = await sendMessage(config, address, text);
  console.log(JSON.stringify(result, null, 2));
}

async function knowledgeCommand(args) {
  const subcommand = args[0];
  const options = parseOptions(args.slice(1));
  const config = loadConfig({ home: options.home, configPath: options.config });

  if (subcommand === 'category') {
    const result = categorizeKnowledge(config, options);
    console.log(`Categorized ${result.documentCount} document(s).`);
    console.log(`Index: ${path.join(result.outputDir, 'index.md')}`);
    return;
  }

  if (subcommand === 'ask') {
    const question = options._.join(' ');
    if (!question) {
      throw new Error('Usage: node src/cli.js knowledge ask "question" [--home path] [--raw Raw]');
    }

    const result = await askKnowledge(config, question, options);
    console.log(`Skill: ${result.skill}`);
    console.log(result.answer);
    if (result.sources.length > 0) {
      console.log('\nSources:');
      for (const source of result.sources) {
        console.log(`- ${source.path} (score ${source.score})`);
      }
    }
    return;
  }

  throw new Error('Usage: node src/cli.js knowledge <category|ask> ...');
}

function parseOptions(args) {
  const options = { _: [] };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value.startsWith('--')) {
      options._.push(value);
      continue;
    }

    const key = value.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith('--')) {
      options[key] = true;
      continue;
    }

    options[key] = next;
    index += 1;
  }
  return options;
}

function help() {
  console.log(`Shang prototype\n\nCommands:\n  init [--name A1] [--home path] [--listen http://localhost:8787] [--from appsettings.json]\n  doctor [--home path] [--config path]\n  serve [--home path] [--config path] [--host localhost] [--port 8787]\n  send <@localhost://path|@https://host/path> <message> [--home path] [--config path]\n  knowledge category [--home path] [--raw Raw] [--output Knowledge/categories]\n  knowledge ask "question" [--home path] [--raw Raw] [--limit 3] [--skill knowledge-ask] [--llm false]\n`);
}

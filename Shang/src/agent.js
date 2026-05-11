import { existsSync } from 'node:fs';
import path from 'node:path';
import { parseAgentAddress, remoteMessageEndpoint } from './address.js';
import { getConfigPath, loadConfig } from './config.js';
import { completeWithLlm, hasLlmConfig } from './llm.js';
import { appendRunLog, createMessage } from './messages.js';

export async function handleIncomingMessage(config, message) {
  appendRunLog(config.agent.home, 'inbox.jsonl', message);

  const llmAnswer = await completeWithLlm(config, [
    {
      role: 'system',
      content: `You are ${config.agent.name}, a Shang agent. Reply clearly and briefly. You may talk to other Shang agents when addressed by URL, but this prototype handles one message at a time.`
    },
    {
      role: 'user',
      content: message.text
    }
  ]);

  const replyText = llmAnswer ?? `[${config.agent.name}] received: ${message.text}`;
  const reply = createMessage({
    from: config.agent.endpoint,
    to: message.from,
    text: replyText,
    correlationId: message.correlationId
  });

  appendRunLog(config.agent.home, 'outbox.jsonl', reply);
  return {
    ok: true,
    handledBy: config.agent.name,
    llm: hasLlmConfig(config) ? 'configured' : 'not-configured',
    reply
  };
}

export async function sendMessage(sourceConfig, addressValue, text) {
  const target = parseAgentAddress(addressValue);
  const message = createMessage({
    from: sourceConfig.agent.endpoint,
    to: addressValue,
    text
  });

  appendRunLog(sourceConfig.agent.home, 'outbox.jsonl', message);

  if (target.kind === 'local') {
    return sendLocalMessage(target.home, message);
  }

  return sendRemoteMessage(remoteMessageEndpoint(target.url), message);
}

async function sendLocalMessage(targetHome, message) {
  const configPath = getConfigPath(targetHome);
  if (!existsSync(configPath)) {
    throw new Error(`Target local agent has no config: ${configPath}`);
  }

  const targetConfig = loadConfig({ home: targetHome });
  if (targetConfig.agent.endpoint) {
    try {
      return await sendRemoteMessage(targetConfig.agent.endpoint, message);
    } catch (error) {
      if (!String(error?.message ?? error).includes('fetch failed')) {
        throw error;
      }
    }
  }

  return handleIncomingMessage(targetConfig, message);
}

async function sendRemoteMessage(endpoint, message) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(message)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Agent request failed ${response.status}: ${body}`);
  }

  return response.json();
}

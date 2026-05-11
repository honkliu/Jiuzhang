import path from 'node:path';

export function parseAgentAddress(value) {
  if (!value?.startsWith('@')) {
    throw new Error(`Agent address must start with @: ${value}`);
  }

  const address = value.slice(1);
  if (address.startsWith('localhost://')) {
    const localPath = address.slice('localhost://'.length);
    if (!localPath) {
      throw new Error('Local agent address must include a path, for example @localhost://home/A2');
    }

    return {
      kind: 'local',
      raw: value,
      home: path.resolve(localPath)
    };
  }

  if (address.startsWith('http://') || address.startsWith('https://')) {
    const url = new URL(address);
    return {
      kind: 'remote',
      raw: value,
      url: url.toString().replace(/\/$/, '')
    };
  }

  throw new Error(`Unsupported agent address: ${value}`);
}

export function remoteMessageEndpoint(remoteUrl) {
  return `${remoteUrl.replace(/\/$/, '')}/agent/message`;
}

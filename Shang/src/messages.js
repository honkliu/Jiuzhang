import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

export function createMessage({ from, to, text, correlationId }) {
  return {
    id: crypto.randomUUID(),
    correlationId: correlationId ?? crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    from,
    to,
    text
  };
}

export function appendRunLog(home, fileName, record) {
  const runsDir = path.join(home, 'Runs');
  mkdirSync(runsDir, { recursive: true });
  appendFileSync(path.join(runsDir, fileName), `${JSON.stringify(record)}\n`, 'utf8');
}

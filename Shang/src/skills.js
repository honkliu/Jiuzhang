import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export function loadSkill(config, skillName) {
  const skillDir = path.join(config.agent.home, 'Agents', 'skills', skillName);
  const skillPath = path.join(skillDir, 'SKILL.md');
  const promptPath = path.join(skillDir, 'prompt.md');

  if (!existsSync(skillPath)) {
    throw new Error(`Skill not found: ${skillPath}`);
  }

  if (!existsSync(promptPath)) {
    throw new Error(`Skill prompt not found: ${promptPath}`);
  }

  return {
    name: skillName,
    instructions: readFileSync(skillPath, 'utf8'),
    prompt: readFileSync(promptPath, 'utf8')
  };
}

export function renderSkillPrompt(template, variables) {
  return template.replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (match, key) => variables[key] ?? match);
}

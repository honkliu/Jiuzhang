import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { completeWithLlm, hasLlmConfig } from './llm.js';
import { loadSkill, renderSkillPrompt } from './skills.js';

const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.markdown', '.json', '.csv', '.html', '.htm', '.xml', '.js', '.ts', '.jsx', '.tsx', '.py', '.cs', '.css']);

const CATEGORY_RULES = [
  {
    id: 'code',
    title: 'Code And Engineering',
    keywords: ['function', 'class', 'interface', 'api', 'server', 'client', 'typescript', 'javascript', 'python', 'csharp', 'database', 'endpoint']
  },
  {
    id: 'product',
    title: 'Product And Planning',
    keywords: ['prd', 'requirement', 'roadmap', 'milestone', 'feature', 'user story', 'design', 'prototype', 'architecture']
  },
  {
    id: 'research',
    title: 'Research And References',
    keywords: ['paper', 'study', 'reference', 'source', 'citation', 'benchmark', 'experiment', 'analysis', 'survey']
  },
  {
    id: 'personal',
    title: 'Personal And Admin',
    keywords: ['family', 'travel', 'invoice', 'receipt', 'insurance', 'license', 'registration', 'appointment', 'address']
  },
  {
    id: 'writing',
    title: 'Writing And Notes',
    keywords: ['draft', 'essay', 'note', 'journal', 'summary', 'outline', 'chapter', 'story', 'article']
  }
];

export function categorizeKnowledge(config, options = {}) {
  const rawDir = path.resolve(config.agent.home, options.raw ?? 'Raw');
  const outputDir = path.resolve(config.agent.home, options.output ?? path.join('Knowledge', 'categories'));
  mkdirSync(outputDir, { recursive: true });

  const files = existsSync(rawDir) ? listFiles(rawDir) : [];
  const records = files.map(filePath => categorizeFile(rawDir, filePath));
  const grouped = groupByCategory(records);
  const generatedAt = new Date().toISOString();
  const index = {
    generatedAt,
    rawDir,
    outputDir,
    documentCount: records.length,
    categories: grouped.map(group => ({
      id: group.id,
      title: group.title,
      count: group.documents.length,
      path: `${group.id}.md`
    }))
  };

  writeFileSync(path.join(outputDir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  writeFileSync(path.join(outputDir, 'index.md'), renderIndex(index), 'utf8');

  for (const group of grouped) {
    writeFileSync(path.join(outputDir, `${group.id}.md`), renderCategory(group, generatedAt), 'utf8');
  }

  return index;
}

export async function askKnowledge(config, question, options = {}) {
  const rawDir = path.resolve(config.agent.home, options.raw ?? 'Raw');
  const limit = Number(options.limit ?? 3);
  const skill = loadSkill(config, options.skill ?? 'knowledge-ask');
  const files = existsSync(rawDir) ? listFiles(rawDir) : [];
  const queryTerms = tokenize(question);
  const matches = files
    .map(filePath => scoreFile(rawDir, filePath, queryTerms))
    .filter(match => match.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);

  if (matches.length === 0) {
    return {
      question,
      skill: skill.name,
      answer: 'I could not find a matching readable document in Raw/. Run `knowledge category` after adding text, markdown, code, json, csv, or html files.',
      sources: []
    };
  }

  if (hasLlmConfig(config) && options.llm !== 'false') {
    return {
      question,
      skill: skill.name,
      answer: await answerWithSkill(config, skill, question, matches),
      sources: matches.map(match => ({
        path: match.path,
        score: match.score,
        snippet: match.snippet
      }))
    };
  }

  return {
    question,
    skill: skill.name,
    answer: buildLocalAnswer(question, matches),
    sources: matches.map(match => ({
      path: match.path,
      score: match.score,
      snippet: match.snippet
    }))
  };
}

async function answerWithSkill(config, skill, question, matches) {
  const sources = matches.map((match, index) => {
    return `SOURCE ${index + 1}: ${match.path}\n${match.snippet}`;
  }).join('\n\n');
  const prompt = renderSkillPrompt(skill.prompt, {
    agentName: config.agent.name,
    date: new Date().toISOString(),
    question,
    sources
  });

  return await completeWithLlm(config, [
    { role: 'system', content: skill.instructions },
    { role: 'user', content: prompt }
  ]);
}

function listFiles(rootDir) {
  const results = [];
  const entries = readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFiles(fullPath));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

function categorizeFile(rawDir, filePath) {
  const relativePath = path.relative(rawDir, filePath).replaceAll('\\', '/');
  const extension = path.extname(filePath).toLowerCase();
  const stats = statSync(filePath);
  const readableText = TEXT_EXTENSIONS.has(extension) ? readFileSync(filePath, 'utf8').slice(0, 20000) : '';
  const searchableText = `${relativePath}\n${readableText}`.toLowerCase();
  const scored = CATEGORY_RULES.map(rule => ({
    rule,
    score: rule.keywords.reduce((total, keyword) => total + countOccurrences(searchableText, keyword), 0)
  })).sort((left, right) => right.score - left.score);
  const winner = scored[0]?.score > 0 ? scored[0].rule : { id: 'uncategorized', title: 'Uncategorized' };

  return {
    path: relativePath,
    extension: extension || '(none)',
    size: stats.size,
    sha256: hashFile(filePath),
    categoryId: winner.id,
    categoryTitle: winner.title,
    summary: summarizeText(readableText, relativePath)
  };
}

function scoreFile(rawDir, filePath, queryTerms) {
  const relativePath = path.relative(rawDir, filePath).replaceAll('\\', '/');
  const extension = path.extname(filePath).toLowerCase();
  if (!TEXT_EXTENSIONS.has(extension)) {
    return { path: relativePath, score: 0, snippet: '' };
  }

  const text = readFileSync(filePath, 'utf8').slice(0, 50000);
  const searchableText = `${relativePath}\n${text}`.toLowerCase();
  const score = queryTerms.reduce((total, term) => total + countOccurrences(searchableText, term), 0);
  return {
    path: relativePath,
    score,
    snippet: bestSnippet(text, queryTerms) || summarizeText(text, relativePath)
  };
}

function groupByCategory(records) {
  const knownGroups = new Map(CATEGORY_RULES.map(rule => [rule.id, { id: rule.id, title: rule.title, documents: [] }]));
  knownGroups.set('uncategorized', { id: 'uncategorized', title: 'Uncategorized', documents: [] });

  for (const record of records) {
    knownGroups.get(record.categoryId).documents.push(record);
  }

  return [...knownGroups.values()].filter(group => group.documents.length > 0);
}

function countOccurrences(text, keyword) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (text.match(new RegExp(`\\b${escaped}\\b`, 'g')) ?? []).length;
}

function tokenize(text) {
  const stopWords = new Set(['a', 'an', 'and', 'are', 'about', 'for', 'how', 'is', 'it', 'of', 'on', 'or', 'the', 'this', 'to', 'what', 'with']);
  return [...new Set(text.toLowerCase().match(/[a-z0-9][a-z0-9_-]*/g) ?? [])]
    .filter(term => term.length > 1 && !stopWords.has(term));
}

function bestSnippet(text, queryTerms) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  const lower = normalized.toLowerCase();
  const firstHit = queryTerms
    .map(term => lower.indexOf(term))
    .filter(index => index >= 0)
    .sort((left, right) => left - right)[0] ?? 0;
  const start = Math.max(0, firstHit - 120);
  return normalized.slice(start, start + 360);
}

function buildLocalAnswer(question, matches) {
  const lead = `Based on ${matches.length === 1 ? 'the matching document' : 'the top matching documents'} in Raw/, this looks related to: ${matches.map(match => match.path).join(', ')}.`;
  const details = matches.map(match => `- ${match.path}: ${match.snippet}`).join('\n');
  return `${lead}\n\n${details}\n\nQuestion: ${question}`;
}

function hashFile(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function summarizeText(text, fallback) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return `Binary or unsupported text extraction: ${fallback}`;
  }
  return normalized.slice(0, 220);
}

function renderIndex(index) {
  const lines = [
    '# Knowledge Categories',
    '',
    `Generated: ${index.generatedAt}`,
    `Documents: ${index.documentCount}`,
    '',
    '| Category | Documents | File |',
    '| --- | ---: | --- |'
  ];

  for (const category of index.categories) {
    lines.push(`| ${category.title} | ${category.count} | ${category.path} |`);
  }

  return `${lines.join('\n')}\n`;
}

function renderCategory(group, generatedAt) {
  const lines = [
    `# ${group.title}`,
    '',
    `Generated: ${generatedAt}`,
    `Documents: ${group.documents.length}`,
    ''
  ];

  for (const document of group.documents) {
    lines.push(`## ${document.path}`);
    lines.push('');
    lines.push(`- Size: ${document.size}`);
    lines.push(`- Type: ${document.extension}`);
    lines.push(`- SHA256: ${document.sha256}`);
    lines.push(`- Summary: ${document.summary}`);
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

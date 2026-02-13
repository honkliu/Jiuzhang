#!/usr/bin/env node
import fs from 'fs';
import os from 'os';
import path from 'path';
import readline from 'readline';
import { Command } from 'commander';
import axios from 'axios';
import chalk from 'chalk';
import * as signalR from '@microsoft/signalr';
import WebSocket from 'ws';

const WA_USER_ID = 'user_ai_wa';
const DEFAULT_BASE_URL = 'http://localhost:5001/api';
const CONFIG_PATH = path.join(os.homedir(), '.bbtalk.json');
const HISTORY_LIMIT = 50;
const HELP_MIN_LINES = 2;
const HELP_MAX_LINES = 10;
const HELP_BODY_LINES = 9;
const HELP_GAP = 2;

const program = new Command();
program.name('bbtalk').description('KanKan CLI chat client').version('0.6.0');

const readConfig = () => {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

const writeConfig = (next) => {
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
};

const getBaseUrl = (cfg, override) => {
  return override || process.env.BBTALK_BASE_URL || cfg.baseUrl || DEFAULT_BASE_URL;
};

const getHubUrl = (cfg) => {
  const baseUrl = getBaseUrl(cfg);
  const root = baseUrl.replace(/\/api\/?$/, '');
  return `${root}/hub/chat`;
};

const getToken = (cfg) => {
  return process.env.BBTALK_TOKEN || cfg.token || '';
};

const createApi = (cfg) => {
  const baseURL = getBaseUrl(cfg);
  const token = getToken(cfg);
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return axios.create({ baseURL, headers });
};

const ensureAuth = (cfg) => {
  const token = getToken(cfg);
  if (!token) {
    console.error(chalk.red('Not logged in. Run: bbtalk login <email> <password>'));
    process.exit(1);
  }
};

const formatInboundMessage = (msg, meId) => {
  if (msg.senderId === meId) return null;
  const name = msg.senderId === WA_USER_ID ? 'Wa' : msg.senderName || msg.senderId;
  const text = msg.text || '';
  return { name, text };
};

const loadChats = async (state) => {
  const res = await state.api.get('/chat');
  state.chats = res.data || [];
};

const loadUsers = async (state) => {
  const res = await state.api.get('/contact');
  state.users = res.data || [];
};

const loadRequests = async (state) => {
  const res = await state.api.get('/contact/requests');
  state.pendingRequests = res.data || [];
};

const loadMessages = async (state, chatId) => {
  const res = await state.api.get(`/chat/${chatId}/messages?limit=50`);
  state.messages[chatId] = res.data || [];
};

const findUserByToken = async (state, token) => {
  const query = String(token || '').trim();
  if (!query) return null;
  const direct = state.users.find(
    (u) =>
      u.id === query ||
      u.displayName?.toLowerCase() === query.toLowerCase() ||
      u.handle?.toLowerCase() === query.toLowerCase() ||
      u.email?.split('@')[0]?.toLowerCase() === query.toLowerCase()
  );
  if (direct) return direct;

  if (query.length >= 2) {
    const res = await state.api.get(`/contact/search?q=${encodeURIComponent(query)}`);
    const results = res.data || [];
    return results[0] || null;
  }
  return null;
};

const wideCharRegex = /[\u1100-\u115F\u2329\u232A\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE10-\uFE19\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/;
let emojiRegex = null;
try {
  emojiRegex = /\p{Extended_Pictographic}/u;
} catch {
  emojiRegex = null;
}

const charDisplayWidth = (ch) => {
  if (!ch) return 0;
  if (ch === '\t') return 4;
  if (ch < ' ') return 0;
  if (emojiRegex && emojiRegex.test(ch)) return 2;
  if (wideCharRegex.test(ch)) return 2;
  return 1;
};

const stringDisplayWidth = (value) => {
  let width = 0;
  for (const ch of String(value || '')) {
    width += charDisplayWidth(ch);
  }
  return width;
};

const splitByWidth = (text, maxWidth) => {
  const lines = [];
  let current = '';
  let width = 0;

  for (const ch of String(text || '')) {
    const w = charDisplayWidth(ch);
    if (width + w > maxWidth && current.length > 0) {
      lines.push(current);
      current = ch;
      width = w;
      continue;
    }
    current += ch;
    width += w;
  }

  if (current.length > 0) {
    lines.push(current);
  }

  return lines.length > 0 ? lines : [''];
};

const wrapText = (text, maxWidth) => {
  const lines = [];
  const rawLines = String(text || '').split('\n');

  for (const raw of rawLines) {
    if (stringDisplayWidth(raw) <= maxWidth) {
      lines.push(raw);
      continue;
    }

    let remaining = raw;
    while (stringDisplayWidth(remaining) > maxWidth) {
      let breakPoint = remaining.lastIndexOf(' ', maxWidth);
      if (breakPoint <= 0) {
        const [first, ...rest] = splitByWidth(remaining, maxWidth);
        lines.push(first);
        remaining = rest.join('');
      } else {
        const candidate = remaining.slice(0, breakPoint);
        if (stringDisplayWidth(candidate) > maxWidth) {
          const [first, ...rest] = splitByWidth(remaining, maxWidth);
          lines.push(first);
          remaining = rest.join('');
        } else {
          lines.push(candidate);
          remaining = remaining.slice(breakPoint).trimStart();
        }
      }
    }

    if (remaining) {
      lines.push(remaining);
    }
  }

  return lines;
};

const getTerminalWidth = () => {
  return process.stdout.columns || 80;
};

const printSeparator = () => {
  const width = getTerminalWidth();
  console.log(chalk.gray('─'.repeat(width)));
};

const normalizeHelpContent = (lines) => {
  if (lines.length === 0) return [''];
  return lines[lines.length - 1] === '' ? lines : [...lines, ''];
};

const truncateToWidth = (text, width) => {
  if (width <= 0) return '';
  const raw = String(text || '');
  if (stringDisplayWidth(raw) <= width) return raw;
  if (width <= 3) return '.'.repeat(width);
  let out = '';
  let w = 0;
  for (const ch of raw) {
    const chWidth = charDisplayWidth(ch);
    if (w + chWidth > width - 3) break;
    out += ch;
    w += chWidth;
  }
  return `${out}...`;
};

const padToWidth = (text, width, alignRight = false) => {
  const trimmed = truncateToWidth(text, width);
  const w = stringDisplayWidth(trimmed);
  const pad = Math.max(0, width - w);
  if (pad === 0) return trimmed;
  const padStr = ' '.repeat(pad);
  return alignRight ? `${padStr}${trimmed}` : `${trimmed}${padStr}`;
};

const buildHelpRenderLines = (state) => {
  const minLines = Math.max(HELP_MIN_LINES, state.helpVisibleLines || HELP_MIN_LINES);
  let content = state.helpContent || [];

  if (content.length === 0) {
    content = ['  ? for shortcuts'];
  }

  let lines = state.helpMode === 'slash' ? [...content] : normalizeHelpContent(content);
  if (lines.length > minLines) {
    lines = lines.slice(0, minLines);
  }
  while (lines.length < minLines) {
    lines.push('');
  }
  return lines;
};

const getHelpLines = (state) => {
  return Math.max(HELP_MIN_LINES, state.helpVisibleLines || HELP_MIN_LINES);
};

const getInputLineCount = (state, width) => {
  return wrapInputText(state.inputBuffer || '', width).length;
};

const wrapInputText = (text, width) => {
  const maxWidth = Math.max(1, width - 2);
  const lines = [];
  const rawLines = String(text || '').split('\n');

  rawLines.forEach((line) => {
    if (line.length === 0) {
      lines.push('');
      return;
    }
    const wrapped = splitByWidth(line, maxWidth);
    wrapped.forEach((entry) => lines.push(entry));
  });

  return lines.length > 0 ? lines : [''];
};

const setHelpContent = (state, lines, options = {}) => {
  const { expand = false, preserveSize = false, maxLines = HELP_MAX_LINES, normalize = true } = options;
  state.helpContent = normalize ? normalizeHelpContent(lines) : lines;

  if (expand) {
    state.helpExpanded = true;
    const desired = Math.min(maxLines, state.helpContent.length);
    if (!preserveSize || state.helpVisibleLines == null) {
      state.helpVisibleLines = Math.max(desired, HELP_MIN_LINES);
    } else if (state.helpVisibleLines < desired) {
      state.helpVisibleLines = desired;
    }
  } else if (!state.helpExpanded) {
    state.helpVisibleLines = HELP_MIN_LINES;
  }

  state.lastLayoutKey = null;
  redrawInputArea(state);
};

const hideHelpArea = (state) => {
  state.helpContent = [];
  state.helpExpanded = false;
  state.helpVisibleLines = HELP_MIN_LINES;
  state.helpMode = 'none';
  state.helpShrinkEnabled = false;
  state.helpForceShrink = false;
  state.lastLayoutKey = null;
  redrawInputArea(state);
};

const showHelpArea = (state, lines, options = {}) => {
  setHelpContent(state, lines, options);
};

const getInputAreaTotalLines = (state, width) => {
  const helpLines = getHelpLines(state);
  const inputLines = getInputLineCount(state, width);
  return 2 + inputLines + helpLines; // top separator + input lines + bottom separator + help
};

const getContentHeight = (state) => {
  const rows = process.stdout.rows || 24;
  return Math.max(1, rows - getInputAreaTotalLines(state, getTerminalWidth()));
};

const maybeShrinkHelpForNewLine = (state) => {
  if (!state.helpExpanded) return false;
  if (!state.helpShrinkEnabled) return false;
  if (state.helpVisibleLines <= HELP_MIN_LINES) return false;
  const contentHeight = getContentHeight(state);
  const wasContentFull = state.contentLineCount >= contentHeight;
  if (!state.helpForceShrink && !wasContentFull) return false;
  const prevInputStartRow = state.lastInputStartRow;
  const prevInputAreaLines = state.lastInputAreaLines;
  state.helpVisibleLines -= 1;
  if (state.helpVisibleLines <= HELP_MIN_LINES) {
    state.helpForceShrink = false;
  }
  state.lastLayoutKey = null;
  if (prevInputStartRow != null && prevInputAreaLines != null) {
    const rows = process.stdout.rows || 24;
    const newTotalLines = getInputAreaTotalLines(state, getTerminalWidth());
    const newInputStartRow = rows - newTotalLines + 1;
    if (newInputStartRow > prevInputStartRow) {
      for (let row = prevInputStartRow; row < newInputStartRow; row += 1) {
        if (row > 0 && row <= rows) {
          process.stdout.write(`\x1b[${row};1H`);
          process.stdout.write('\x1b[2K');
        }
      }
    }
  }
  return true;
};

const prepareContentLine = (state, options = {}) => {
  const { allowShrink = true } = options;
  const shrunk = allowShrink ? maybeShrinkHelpForNewLine(state) : false;
  setupScrollRegion(state);
  const totalLines = getInputAreaTotalLines(state, getTerminalWidth());
  const scrollBottom = process.stdout.rows - totalLines;
  process.stdout.write(`\x1b[${scrollBottom};1H`);
  process.stdout.write('\n');
  state.contentLineCount += 1;
  const visibleHeight = getContentHeight(state);
  if (state.contentLineCount > visibleHeight) {
    state.contentLineCount = visibleHeight;
  }
  return shrunk;
};

const writeContentLine = (state, line, options = {}) => {
  const { redraw = true, allowShrink = true } = options;
  const shrunk = prepareContentLine(state, { allowShrink });
  if (line) {
    process.stdout.write(line);
  }
  if (!redraw && shrunk) {
    redrawInputArea(state);
  }
  if (redraw) {
    redrawInputArea(state);
  }
};

const printContentLines = (state, lines, options = {}) => {
  const { allowShrink = true } = options;
  lines.forEach((line) => writeContentLine(state, line, { redraw: false, allowShrink }));
  redrawInputArea(state);
};

const setupScrollRegion = (state) => {
  // Calculate the scrolling region (everything except input area)
  const width = getTerminalWidth();
  const totalLines = getInputAreaTotalLines(state, width);
  const scrollBottom = process.stdout.rows - totalLines;

  // Set scrolling region: \x1b[top;bottomr
  process.stdout.write(`\x1b[1;${scrollBottom}r`);
};

const resetScrollRegion = () => {
  // Reset scrolling region to full screen
  process.stdout.write('\x1b[r');
};

const redrawInputArea = (state) => {
  const width = getTerminalWidth();
  const inputText = state.inputBuffer || '';
  const wrappedLines = wrapInputText(inputText, width);
  const inputLines = wrappedLines.length;

  // Calculate how many lines we need for the input area
  const helpLines = getHelpLines(state);
  const totalLines = 2 + inputLines + helpLines; // top separator + input lines + bottom separator + help
  const rows = process.stdout.rows || 24;
  const helpRenderLines = buildHelpRenderLines(state);
  const helpKey = helpRenderLines.join('\n');
  const layoutKey = `${width}|${helpLines}|${inputLines}|${state.helpMode}|${helpKey}`;
  const layoutChanged =
    state.lastInputAreaLines !== totalLines ||
    state.lastRows !== rows ||
    state.lastLayoutKey !== layoutKey;
  const prevInputStartRow = state.lastInputStartRow;
  const prevInputAreaLines = state.lastInputAreaLines;

  if (layoutChanged) {
    setupScrollRegion(state);
  }

  // Save cursor, move to input area, and redraw
  const inputStartRow = process.stdout.rows - totalLines + 1;

  // Hide cursor while redrawing to prevent visible jumps
  process.stdout.write('\x1b[?25l');

  const prompt = chalk.cyan('> ');

  if (layoutChanged) {
    // Clear the entire input area lines to avoid leftover artifacts
    for (let i = 0; i < totalLines; i += 1) {
      process.stdout.write(`\x1b[${inputStartRow + i};1H`);
      process.stdout.write('\x1b[2K');
    }

    // Move to the input area start
    process.stdout.write(`\x1b[${inputStartRow};1H`);

    // Draw top separator
    process.stdout.write(chalk.gray('─'.repeat(width)) + '\n');

    // Draw input lines
    wrappedLines.forEach((line, index) => {
      const prefix = index === 0 ? prompt : '  ';
      process.stdout.write(prefix + line);
      process.stdout.write('\x1b[K');
      process.stdout.write('\n');
    });

    // Draw bottom separator
    process.stdout.write(chalk.gray('─'.repeat(width)) + '\n');

    // Draw help area
    helpRenderLines.forEach((line) => {
      process.stdout.write(chalk.gray(line) + '\n');
    });
    state.lastInputStartRow = inputStartRow;
    state.lastInputAreaLines = totalLines;
    state.lastRows = rows;
    state.lastLayoutKey = layoutKey;
  } else {
    // Only redraw input lines when layout is unchanged
    wrappedLines.forEach((line, index) => {
      const prefix = index === 0 ? prompt : '  ';
      process.stdout.write(`\x1b[${inputStartRow + 1 + index};1H`);
      process.stdout.write('\x1b[2K');
      process.stdout.write(prefix + line);
      process.stdout.write('\x1b[K');
    });
  }

  // Move cursor back to input position
  const lastLine = wrappedLines[wrappedLines.length - 1] || '';
  const cursorRow = inputStartRow + wrappedLines.length;
  const cursorCol = Math.min(width, 3 + stringDisplayWidth(lastLine));
  process.stdout.write(`\x1b[${cursorRow};${cursorCol}H`);

  // Show cursor after redraw
  process.stdout.write('\x1b[?25h');
};

const printMessage = (state, role, text, options = {}) => {
  const { suppressPrefix = false, omitLeadingBlank = false } = options;
  const width = getTerminalWidth() - 4; // Leave margin
  const prefix = role === 'user' ? chalk.cyan('>') : chalk.cyan('✦');
  const lines = wrapText(text, width);
  const output = [];

  if (!omitLeadingBlank) {
    output.push('');
  }

  lines.forEach((line, idx) => {
    if (idx === 0) {
      if (suppressPrefix) {
        output.push(`    ${line}`);
      } else {
        output.push(`  ${prefix} ${line}`);
      }
    } else {
      output.push(`    ${line}`);
    }
  });

  printContentLines(state, output, { allowShrink: role !== 'user' });
};

const printSystem = (state, text) => {
  printContentLines(state, ['', chalk.gray(`  ${text}`)], { allowShrink: false });
};

const printError = (state, text) => {
  printContentLines(state, ['', chalk.red(`  ✗ ${text}`)], { allowShrink: false });
};

const printSuccess = (state, text) => {
  printContentLines(state, ['', chalk.green(`  ✓ ${text}`)], { allowShrink: false });
};

const showHelp = (state) => {
  state.helpMode = 'help';
  state.helpShrinkEnabled = false;
  state.helpForceShrink = false;
  const lines = [
    '  Chat Commands:',
    '    /cl              List all chats',
    '    /cj <n>          Join chat by number',
    '    /cq              Quit current chat',
    '    /cd              Clear/delete current chat',
    '    /cn              Show current chat name',
    '',
    '  User Commands:',
    '    /ul              List users',
    '    /ua <n>          Add user by number',
    '    /c <n>           Start a chat with user',
    '    /ur              List pending friend requests',
    '    /urc [n]         Accept request (number or all)',
    '    /urd [n]         Decline request (number or all)',
    '',
    '  Other Commands:',
    '    /help            Show this help',
    '    /quit            Exit application',
    '',
  ];
  showHelpArea(state, lines, { expand: true, preserveSize: state.helpExpanded });
};

const COMMAND_HINTS = [
  { cmd: '/cl', desc: 'List all chats' },
  { cmd: '/cj <n>', desc: 'Join chat by number' },
  { cmd: '/cn', desc: 'Show current chat name' },
  { cmd: '/cq', desc: 'Quit current chat' },
  { cmd: '/cd', desc: 'Clear/delete current chat' },
  { cmd: '/ul', desc: 'List users' },
  { cmd: '/ua <n>', desc: 'Add user by number' },
  { cmd: '/ur', desc: 'List friend requests' },
  { cmd: '/help', desc: 'Show help' },
];

const formatChatEntry = (chat, idx) => {
  const label = chat.chatType === 'group' ? '[GROUP]' : '[DM]';
  const name = chat.name || '(no name)';
  return `${idx + 1}. ${label} ${name}`.trimEnd();
};

const formatUserEntry = (user, idx) => {
  const status = user.isOnline ? '●' : '○';
  const name = user.displayName || user.handle || user.email || user.id;
  const handle = user.handle ? `@${user.handle}` : '';
  return `${idx + 1}. ${status} ${name} ${handle}`.trimEnd();
};

const computeHelpColumns = (width) => {
  const minChat = 24;
  const minUser = 24;
  const minCmd = 20;
  const available = width - HELP_GAP * 2;
  const minTotal = minChat + minUser + minCmd;

  if (available >= minTotal) {
    const chatWidth = Math.floor(available * 0.46);
    const userWidth = Math.floor(available * 0.34);
    const cmdWidth = Math.max(minCmd, available - chatWidth - userWidth);
    return { columns: 3, widths: [chatWidth, userWidth, cmdWidth] };
  }

  const availableTwo = width - HELP_GAP;
  const chatWidth = Math.max(minChat, Math.floor(availableTwo * 0.55));
  const userWidth = Math.max(10, availableTwo - chatWidth);
  return { columns: 2, widths: [chatWidth, userWidth] };
};

const buildSlashHelpLines = (state) => {
  const width = getTerminalWidth();
  const chats = state.chats || [];
  const users = state.users || [];
  const chatLines = chats.map(formatChatEntry);
  const userLines = users.map(formatUserEntry);
  const cmdLines = COMMAND_HINTS.map((c) => `${c.cmd.padEnd(8)} ${c.desc}`);

  const bodyCount = Math.min(
    HELP_BODY_LINES,
    Math.max(chatLines.length, userLines.length, cmdLines.length)
  );

  const { columns, widths } = computeHelpColumns(width);
  const gap = ' '.repeat(HELP_GAP);
  const lines = [];

  for (let i = 0; i < bodyCount; i += 1) {
    const left = chatLines[i] || '';
    const middle = userLines[i] || '';
    const right = cmdLines[i] || '';

    if (columns === 3) {
      const line =
        padToWidth(left, widths[0]) +
        gap +
        padToWidth(middle, widths[1]) +
        gap +
        padToWidth(right, widths[2]);
      lines.push(line);
    } else {
      const rightCombined = [middle, right].filter(Boolean).join('  ');
      const line = padToWidth(left, widths[0]) + gap + padToWidth(rightCombined, widths[1]);
      lines.push(line);
    }
  }

  const showArrow = chatLines.length > HELP_BODY_LINES || userLines.length > HELP_BODY_LINES;
  if (showArrow) {
    const leftArrow = chatLines.length > HELP_BODY_LINES ? `▼(1/${chatLines.length})` : '';
    const middleArrow = userLines.length > HELP_BODY_LINES ? `▼(1/${userLines.length})` : '';
    const rightArrow = cmdLines.length > HELP_BODY_LINES ? `▼(1/${cmdLines.length})` : '';

    if (columns === 3) {
      lines.push(
        padToWidth(leftArrow, widths[0], true) +
          gap +
          padToWidth(middleArrow, widths[1], true) +
          gap +
          padToWidth(rightArrow, widths[2], true)
      );
    } else {
      const rightCombined = [middleArrow, rightArrow].filter(Boolean).join(' ');
      lines.push(padToWidth(leftArrow, widths[0], true) + gap + padToWidth(rightCombined, widths[1], true));
    }
  }

  return lines;
};

const showSlashHelp = async (state) => {
  state.helpMode = 'slash';
  state.helpShrinkEnabled = false;
  state.helpForceShrink = false;
  const requestId = (state.slashHelpRequestId || 0) + 1;
  state.slashHelpRequestId = requestId;

  showHelpArea(state, ['  Loading chats/users...'], { expand: true, preserveSize: state.helpExpanded, normalize: false });

  try {
    await Promise.all([loadChats(state), loadUsers(state)]);
    state.lastChatList = state.chats;
    state.lastUserList = state.users;
  } catch (err) {
    const msg = err?.response?.data?.message || err.message || String(err);
    showHelpArea(state, [`  Failed to load lists: ${msg}`], { expand: true, preserveSize: true, normalize: false });
    return;
  }

  if (state.slashHelpRequestId !== requestId) return;
  if (state.inputBuffer !== '/') return;

  const lines = buildSlashHelpLines(state);
  state.helpExpanded = true;
  state.helpVisibleLines = Math.max(HELP_MIN_LINES, Math.min(HELP_MAX_LINES, lines.length));
  showHelpArea(state, lines, { expand: true, preserveSize: false, normalize: false });
};

const showCommandSuggestions = (state, prefix) => {
  state.helpMode = 'suggestions';
  state.helpShrinkEnabled = false;
  state.helpForceShrink = false;
  const matches = getMatchingCommands(prefix);

  if (matches.length === 0) {
    hideHelpArea(state);
    return;
  }

  const lines = [
    '  Command suggestions:',
    ...matches.map((m) => `    ${m.cmd.padEnd(15)} ${m.desc}`),
    '',
  ];

  showHelpArea(state, lines, { expand: true, preserveSize: state.helpExpanded });
};

const showCommandOutput = (state, lines) => {
  state.helpMode = 'output';
  state.helpShrinkEnabled = false;
  state.helpForceShrink = false;
  showHelpArea(state, [...lines, ''], { expand: true, preserveSize: state.helpExpanded });
};

const normalizeNameToken = (value) => String(value || '').trim();

const resolveRequestTargets = (state, token) => {
  const trimmed = String(token || '').trim().toLowerCase();
  if (!trimmed || trimmed === 'all') {
    return state.pendingRequests;
  }
  const index = Number.parseInt(trimmed, 10);
  if (!Number.isNaN(index) && index >= 1 && index <= state.pendingRequests.length) {
    return [state.pendingRequests[index - 1]];
  }
  return [];
};

const getMatchingCommands = (prefix) => {
  const allCommands = [
    { cmd: '/cl', desc: 'List all chats' },
    { cmd: '/cj', desc: 'Join chat by number' },
    { cmd: '/cq', desc: 'Quit current chat' },
    { cmd: '/cd', desc: 'Clear/delete current chat' },
    { cmd: '/cn', desc: 'Show current chat name' },
    { cmd: '/c', desc: 'Start a chat with user' },
    { cmd: '/ul', desc: 'List users' },
    { cmd: '/ua', desc: 'Add user by number' },
    { cmd: '/ur', desc: 'List pending friend requests' },
    { cmd: '/urc', desc: 'Accept request' },
    { cmd: '/urd', desc: 'Decline request' },
    { cmd: '/help', desc: 'Show this help' },
    { cmd: '/quit', desc: 'Exit application' },
  ];

  const trimmed = prefix.toLowerCase();
  if (trimmed === '/') return [];

  return allCommands.filter((c) => c.cmd.startsWith(trimmed));
};

const updateCommandMode = async (state) => {
  const isCommand = state.inputBuffer.startsWith('/');

  // Show full help when typing just "/"
  if (state.inputBuffer === '/') {
    await showSlashHelp(state);
    return true;
  }

  // Show command suggestions when typing a command
  if (isCommand && state.inputBuffer.length > 1) {
    showCommandSuggestions(state, state.inputBuffer);
    return true;
  }

  // Enable gradual shrink when user starts typing normal text
  if (!isCommand && (state.helpExpanded || state.helpContent.length > 0)) {
    state.helpShrinkEnabled = true;
    state.helpForceShrink = true;
  }

  return false;
};

const formatIndexedList = (items, formatter) => {
  return items.slice(0, 10).map((item, idx) => `  ${idx + 1}. ${formatter(item)}`);
};

const getIndexedItem = (items, token) => {
  const idx = Number.parseInt(String(token || '').trim(), 10);
  if (Number.isNaN(idx) || idx < 1 || idx > items.length) return null;
  return items[idx - 1];
};

const joinChatRealtime = async (state, chatId) => {
  if (!state.connection) return;
  try {
    await state.connection.invoke('JoinChat', chatId);
  } catch {
    // ignore
  }
};

const leaveChatRealtime = async (state, chatId) => {
  if (!state.connection) return;
  try {
    await state.connection.invoke('LeaveChat', chatId);
  } catch {
    // ignore
  }
};

const attachRealtime = async (state) => {
  const hubUrl = getHubUrl(state.cfg);
  const connection = new signalR.HubConnectionBuilder()
    .withUrl(hubUrl, {
      accessTokenFactory: () => getToken(state.cfg),
      transport: signalR.HttpTransportType.WebSockets,
      skipNegotiation: true,
      WebSocket,
    })
    .withAutomaticReconnect()
    .configureLogging(signalR.LogLevel.Error)
    .build();

  connection.on('ReceiveMessage', (message) => {
    if (!state.messages[message.chatId]) {
      state.messages[message.chatId] = [];
    }
    const exists = state.messages[message.chatId].some((m) => m.id === message.id);
    if (!exists) {
      state.messages[message.chatId].push(message);
    }
    if (state.currentChat?.id === message.chatId) {
      if (state.helpExpanded) {
        state.helpShrinkEnabled = true;
      }
      const formatted = formatInboundMessage(message, state.meId);
      if (formatted) {
        // Check if text already includes the name prefix to avoid duplication
        const text = formatted.text.startsWith(`${formatted.name}: `)
          ? formatted.text
          : `${formatted.name}: ${formatted.text}`;
        printMessage(state, 'assistant', text);
      }
    }
  });

  connection.on('AgentMessageStart', (message) => {
    state.streamingMessage = {
      chatId: message.chatId,
      id: message.id,
      text: '',
    };
    if (state.helpExpanded) {
      state.helpShrinkEnabled = true;
    }
  });

  connection.on('AgentMessageChunk', (chatId, messageId, chunk) => {
    if (!state.streamingMessage || state.streamingMessage.id !== messageId) return;
    state.streamingMessage.text += chunk;
  });

  connection.on('AgentMessageComplete', (chatId, messageId) => {
    if (!state.streamingMessage || state.streamingMessage.id !== messageId) return;
    const { text } = state.streamingMessage;
    state.streamingMessage = null;
    if (state.currentChat?.id === chatId) {
      printMessage(state, 'assistant', text || '');
    }
  });

  connection.on('MessageDelivered', () => {});
  connection.on('MessageRead', () => {});
  connection.on('ChatUpdated', () => {});
  connection.on('ParticipantsAdded', () => {});
  connection.on('ParticipantRemoved', () => {});

  await connection.start();
  state.connection = connection;
};

const selectChatByIndex = async (state, idx) => {
  if (!idx || idx < 1 || idx > state.chats.length) {
    printError(state, 'Invalid chat number.');
    redrawInputArea(state);
    return;
  }
  const chat = state.chats[idx - 1];
  state.currentChat = chat;

  console.clear();
  state.contentLineCount = 0;
  state.lastLayoutKey = null;
  printSuccess(state, `Joined: ${chat.name}`);

  await loadMessages(state, chat.id);
  const messages = state.messages[chat.id] || [];
  messages.slice(-HISTORY_LIMIT).forEach((m) => {
    if (m.senderId === state.meId) {
      printMessage(state, 'user', m.text || '');
    } else {
      const formatted = formatInboundMessage(m, state.meId);
      if (formatted) {
        // Check if text already includes the name prefix to avoid duplication
        const text = formatted.text.startsWith(`${formatted.name}: `)
          ? formatted.text
          : `${formatted.name}: ${formatted.text}`;
        printMessage(state, 'assistant', text);
      }
    }
  });

  await joinChatRealtime(state, chat.id);
  setupScrollRegion(state);
  redrawInputArea(state);
};

const handleCommand = async (state, line) => {
  const [cmd, ...rest] = line.split(' ');
  const arg = rest.join(' ').trim();

  try {
    switch (cmd) {
      case '/cl':
        await loadChats(state);
        state.lastChatList = state.chats.slice(0, 10);
        showCommandOutput(state, [
          '  Available Chats:',
          ...formatIndexedList(state.lastChatList, (chat) => {
            const label = chat.chatType === 'group' ? '[GROUP]' : '[DM]';
            return `${label} ${chat.name}`;
          }),
          '  Use /cj <n> to join a chat',
        ]);
        break;

      case '/cj':
        if (state.lastChatList.length === 0) {
          showCommandOutput(state, ['  Run /cl first to list chats.']);
          break;
        }
        const targetChat = getIndexedItem(state.lastChatList, arg);
        if (!targetChat) {
          showCommandOutput(state, ['  Invalid chat number.']);
          break;
        }
        await loadChats(state);
        const chatIndex = state.chats.findIndex((chat) => chat.id === targetChat.id);
        if (chatIndex >= 0) {
          await selectChatByIndex(state, chatIndex + 1);
          return;
        }
        showCommandOutput(state, ['  Chat not found.']);
        return;

      case '/ul':
        await loadUsers(state);
        state.lastUserList = state.users.slice(0, 10);
        showCommandOutput(state, [
          '  Users:',
          ...formatIndexedList(state.lastUserList, (user) => {
            const status = user.isOnline ? '●' : '○';
            const name = user.displayName || user.handle || user.email || user.id;
            const handle = user.handle ? `@${user.handle}` : '';
            return `${status} ${name} ${handle}`.trimEnd();
          }),
          '  Use /ua <user> to send a friend request',
        ]);
        break;

      case '/ua':
        if (!arg) {
          showCommandOutput(state, ['  Usage: /ua <n>']);
          break;
        }
        if (state.lastUserList.length === 0) {
          showCommandOutput(state, ['  Run /ul first to list users.']);
          break;
        }
        const user = getIndexedItem(state.lastUserList, arg);
        if (!user) {
          showCommandOutput(state, ['  Invalid user number.']);
          break;
        }
        await state.api.post('/contact/requests', { userId: user.id });
        showCommandOutput(state, [`  Friend request sent to ${user.displayName || user.handle || user.id}`]);
        break;

      case '/c':
        if (!arg) {
          showCommandOutput(state, ['  Usage: /c <n>']);
          break;
        }
        if (state.lastUserList.length === 0) {
          showCommandOutput(state, ['  Run /ul first to list users.']);
          break;
        }
        const chatUser = getIndexedItem(state.lastUserList, arg);
        if (!chatUser) {
          showCommandOutput(state, ['  Invalid user number.']);
          break;
        }
        const chatRes = await state.api.post('/chat', {
          chatType: 'direct',
          participantIds: [chatUser.id],
        });
        await loadChats(state);
        const createdIndex = state.chats.findIndex((chat) => chat.id === chatRes.data?.id);
        if (createdIndex >= 0) {
          await selectChatByIndex(state, createdIndex + 1);
          return;
        }
        showCommandOutput(state, ['  Chat created. Run /cl to see it.']);
        break;

      case '/ur':
        await loadRequests(state);
        if (state.pendingRequests.length === 0) {
          showCommandOutput(state, ['  Friend Requests:', '  (none)']);
        } else {
          showCommandOutput(state, [
            '  Friend Requests:',
            ...state.pendingRequests.map((req, idx) => {
              const from = req.fromUser?.displayName || req.fromUser?.handle || req.fromUserId;
              return `  ${idx + 1}. ${from}`;
            }),
            '  Use /urc [n] to accept or /urd [n] to decline',
          ]);
        }
        break;

      case '/urc':
        await loadRequests(state);
        const acceptTargets = resolveRequestTargets(state, arg);
        if (acceptTargets.length === 0) {
          showCommandOutput(state, ['  No matching requests.']);
          break;
        }
        for (const req of acceptTargets) {
          await state.api.post(`/contact/requests/${req.fromUserId}/accept`);
        }
        showCommandOutput(state, ['  Friend request(s) accepted']);
        break;

      case '/urd':
        await loadRequests(state);
        const rejectTargets = resolveRequestTargets(state, arg);
        if (rejectTargets.length === 0) {
          showCommandOutput(state, ['  No matching requests.']);
          break;
        }
        for (const req of rejectTargets) {
          await state.api.post(`/contact/requests/${req.fromUserId}/reject`);
        }
        showCommandOutput(state, ['  Friend request(s) declined']);
        break;

      case '/cq':
        if (state.currentChat) {
          await leaveChatRealtime(state, state.currentChat.id);
          showCommandOutput(state, [`  Left chat: ${state.currentChat.name}`]);
          state.currentChat = null;
        } else {
          showCommandOutput(state, ['  No active chat.']);
        }
        break;

      case '/cd':
        if (!state.currentChat) {
          showCommandOutput(state, ['  No active chat.']);
        } else {
          await state.api.post(`/chat/${state.currentChat.id}/clear`, {});
          showCommandOutput(state, [`  Chat cleared: ${state.currentChat.name}`]);
          state.currentChat = null;
        }
        break;

      case '/cn':
        if (!state.currentChat) {
          showCommandOutput(state, ['  No active chat.']);
        } else {
          showCommandOutput(state, [`  Current chat: ${state.currentChat.name}`]);
        }
        break;

      case '/help':
        showHelp(state);
        return;

      case '/quit':
        if (state.currentChat) {
          await leaveChatRealtime(state, state.currentChat.id);
        }
        if (state.connection) {
          await state.connection.stop();
        }
        console.clear();
        console.log(chalk.gray('Goodbye!'));
        process.exit(0);

      default:
        showCommandOutput(state, [`  Unknown command: ${cmd}`, '  Type /help for available commands.']);
    }

    redrawInputArea(state);
  } catch (err) {
    const msg = err?.response?.data?.message || err.message;
    showCommandOutput(state, [`  Error: ${msg}`]);
    redrawInputArea(state);
  }
};

const startInteractive = async () => {
  const cfg = readConfig();
  ensureAuth(cfg);
  const api = createApi(cfg);

  console.clear();
  console.log(chalk.cyan('╔═══════════════════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan('║                  BBTalk - KanKan Chat Client                      ║'));
  console.log(chalk.cyan('╚═══════════════════════════════════════════════════════════════════╝'));
  console.log();
  console.log(chalk.gray('Connecting to server...'));

  const state = {
    cfg,
    api,
    meId: cfg.userId,
    meName: cfg.userName || cfg.userId,
    chats: [],
    users: [],
    pendingRequests: [],
    messages: {},
    currentChat: null,
    connection: null,
    streamingMessage: null,
    inputBuffer: '',
    helpContent: [],  // Simplified: just content lines or empty array
    helpExpanded: false,
    helpVisibleLines: HELP_MIN_LINES,
    helpMode: 'none',
    helpShrinkEnabled: false,
    helpForceShrink: false,
    slashHelpRequestId: 0,
    lastChatList: [],
    lastUserList: [],
    lastInputAreaLines: null,
    lastInputStartRow: null,
    lastRows: null,
    lastLayoutKey: null,
    contentLineCount: 0,
    lastVisibleHeight: null,
  };

  try {
    await loadChats(state);
    await loadRequests(state);
    await attachRealtime(state);

    console.log(chalk.green('✓ Connected successfully!'));
    console.log();

    const waChat = state.chats.find(
      (c) => c.chatType === 'direct' && (c.participants || []).some((p) => p.userId === WA_USER_ID)
    );

    if (waChat) {
      await selectChatByIndex(state, state.chats.indexOf(waChat) + 1);
    } else if (state.chats.length > 0) {
      await selectChatByIndex(state, 1);
    } else {
      printSystem(state, 'No chats available. Use /cl to list and /cj <n> to join.');
      printSystem(state, 'Type /help for available commands.');
    }
  } catch (err) {
    const msg = err?.message || String(err);
    printError(state, `Connection error: ${msg}`);
    printSystem(state, 'You can still use commands, but real-time updates are unavailable.');
  }

  // Setup raw mode for character-by-character input
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  readline.emitKeypressEvents(process.stdin);

  // Setup scroll region and draw initial input area
  setupScrollRegion(state);
  redrawInputArea(state);

  process.stdin.on('keypress', async (str, key) => {
    if (!key) return;

    // Handle Ctrl+C
    if (key.ctrl && key.name === 'c') {
      if (state.currentChat) {
        await leaveChatRealtime(state, state.currentChat.id);
      }
      if (state.connection) {
        await state.connection.stop();
      }
      console.clear();
      console.log(chalk.gray('Goodbye!'));
      process.exit(0);
    }

    // Handle Enter
    if (key.name === 'return' || key.name === 'enter') {
      const text = state.inputBuffer.trim();
      state.inputBuffer = '';
      state.commandMode = false;

      if (text === '/') {
        state.inputBuffer = '/';
        await showSlashHelp(state);
        return;
      }

      if (state.helpExpanded || state.helpContent.length > 0) {
        state.helpShrinkEnabled = true;
      }

      if (!text) {
        redrawInputArea(state);
        return;
      }

      if (text.startsWith('/')) {
        await handleCommand(state, text);
        return;
      }

      if (!state.currentChat) {
        printError(state, 'No active chat. Use /cl to list chats and /cj <n> to join.');
        redrawInputArea(state);
        return;
      }

      // Print user message
      printMessage(state, 'user', text);

      // Send message
      try {
        await api.post(`/chat/${state.currentChat.id}/messages`, {
          messageType: 'text',
          text,
        });
      } catch (err) {
        const msg = err?.response?.data?.message || err.message;
        printError(state, `Failed to send: ${msg}`);
      }

      return;
    }

    // Handle Backspace
    if (key.name === 'backspace') {
      if (state.inputBuffer.length > 0) {
        state.inputBuffer = state.inputBuffer.slice(0, -1);
        const redrew = await updateCommandMode(state);
        if (!redrew) {
          redrawInputArea(state);
        }
      }
      return;
    }

    // Handle Escape
    if (key.name === 'escape') {
      state.inputBuffer = '';
      state.commandMode = false;
      if (state.helpExpanded || state.helpContent.length > 0) {
        hideHelpArea(state);
      } else {
        redrawInputArea(state);
      }
      return;
    }

    // Handle regular character input
    if (str && !key.ctrl && !key.meta) {
      state.inputBuffer += str;
      const redrew = await updateCommandMode(state);
      if (!redrew) {
        redrawInputArea(state);
      }
    }
  });

  // Handle terminal resize
  process.stdout.on('resize', () => {
    redrawInputArea(state);
  });
};

program
  .command('login')
  .description('Login and store token')
  .argument('<email>')
  .argument('<password>')
  .option('--base-url <url>', 'API base URL (default http://localhost:5001/api)')
  .action(async (email, password, options) => {
    const cfg = readConfig();
    const api = axios.create({ baseURL: getBaseUrl(cfg, options.baseUrl) });
    try {
      const res = await api.post('/auth/login', { email, password });
      const accessToken = res.data?.accessToken;
      const user = res.data?.user;
      if (!accessToken || !user?.id) {
        console.error(chalk.red('Login succeeded but missing token/user in response.'));
        process.exit(1);
      }
      const next = {
        ...cfg,
        baseUrl: getBaseUrl(cfg, options.baseUrl),
        token: accessToken,
        userId: user.id,
        userName: user.displayName || user.email || user.id,
      };
      writeConfig(next);
      console.log(chalk.green('✓ Login successful!'));
      console.log(chalk.gray(`  User: ${next.userName}`));
      console.log(chalk.gray(`  Server: ${next.baseUrl}`));
      console.log('');
      console.log(chalk.cyan('Run "bbtalk" to start chatting.'));
    } catch (err) {
      const msg = err?.response?.data?.message || err.message;
      console.error(chalk.red(`✗ Login failed: ${msg}`));
      process.exit(1);
    }
  });

program
  .command('start')
  .description('Start interactive mode')
  .action(async () => {
    await startInteractive();
  });

program
  .action(async () => {
    await startInteractive();
  });

program.parseAsync(process.argv);

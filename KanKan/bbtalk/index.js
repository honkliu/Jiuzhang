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

const buildHelpRenderLines = (state) => {
  const minLines = 2;
  const content = state.helpContent || [];

  // If no help content, show hint
  if (content.length === 0) {
    return ['  ? for shortcuts', ''];
  }

  // Show help content, ensuring at least minLines
  if (content.length < minLines) {
    return content.concat(Array(minLines - content.length).fill(''));
  }

  return content;
};

const getHelpLines = (state) => {
  return buildHelpRenderLines(state).length;
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

// Simplified help area management - only two real states: showing or hidden
const hideHelpArea = (state) => {
  state.helpContent = [];
  state.helpMinLines = 2;
  state.lastLayoutKey = null;
  redrawInputArea(state);
};

const showHelpArea = (state, lines) => {
  state.helpContent = lines;
  state.helpMinLines = Math.max(2, lines.length);
  state.lastLayoutKey = null;
  redrawInputArea(state);
};

const getInputAreaTotalLines = (state, width) => {
  const helpLines = getHelpLines(state);
  const inputLines = getInputLineCount(state, width);
  return 2 + inputLines + helpLines; // top separator + input lines + bottom separator + help
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

  if (layoutChanged) {
    setupScrollRegion(state);
    state.lastInputAreaLines = totalLines;
    state.lastRows = rows;
    state.lastLayoutKey = layoutKey;
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

const printMessage = (state, role, text) => {
  const width = getTerminalWidth() - 4; // Leave margin
  const prefix = role === 'user' ? chalk.cyan('>') : chalk.cyan('✦');
  const lines = wrapText(text, width);

  setupScrollRegion(state);
  const totalLines = getInputAreaTotalLines(state, getTerminalWidth());
  const scrollBottom = process.stdout.rows - totalLines;

  // Move to bottom of scroll region
  process.stdout.write(`\x1b[${scrollBottom};1H`);

  // Print blank line and message - will scroll content up
  process.stdout.write('\n');
  lines.forEach((line, idx) => {
    if (idx === 0) {
      console.log(`  ${prefix} ${line}`);
    } else {
      console.log(`    ${line}`);
    }
  });

  // Redraw input area after printing
  redrawInputArea(state);
};

const printSystem = (state, text) => {
  setupScrollRegion(state);
  const totalLines = getInputAreaTotalLines(state, getTerminalWidth());
  const scrollBottom = process.stdout.rows - totalLines;

  process.stdout.write(`\x1b[${scrollBottom};1H`);
  console.log();
  console.log(chalk.gray(`  ${text}`));
  redrawInputArea(state);
};

const printError = (state, text) => {
  setupScrollRegion(state);
  const totalLines = getInputAreaTotalLines(state, getTerminalWidth());
  const scrollBottom = process.stdout.rows - totalLines;

  process.stdout.write(`\x1b[${scrollBottom};1H`);
  console.log();
  console.log(chalk.red(`  ✗ ${text}`));
  redrawInputArea(state);
};

const printSuccess = (state, text) => {
  setupScrollRegion(state);
  const totalLines = getInputAreaTotalLines(state, getTerminalWidth());
  const scrollBottom = process.stdout.rows - totalLines;

  process.stdout.write(`\x1b[${scrollBottom};1H`);
  console.log();
  console.log(chalk.green(`  ✓ ${text}`));
  redrawInputArea(state);
};

const showHelp = (state) => {
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
  showHelpArea(state, lines);
};

const showCommandSuggestions = (state, prefix) => {
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

  showHelpArea(state, lines);
};

const showCommandOutput = (state, lines) => {
  showHelpArea(state, [...lines, '']);
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

const updateCommandMode = (state) => {
  const isCommand = state.inputBuffer.startsWith('/');

  // Show full help when typing just "/"
  if (state.inputBuffer === '/') {
    showHelp(state);
    return true;
  }

  // Show command suggestions when typing a command
  if (isCommand && state.inputBuffer.length > 1) {
    showCommandSuggestions(state, state.inputBuffer);
    return true;
  }

  // Hide help when user stops typing commands or starts typing regular text
  if (!isCommand && state.helpContent.length > 0) {
    hideHelpArea(state);
    return true;
  }

  return false;
};

const formatIndexedList = (items, formatter) => {
  return items.slice(0, 10).map((item, idx) => `  ${idx}. ${formatter(item)}`);
};

const getIndexedItem = (items, token) => {
  const idx = Number.parseInt(String(token || '').trim(), 10);
  if (Number.isNaN(idx) || idx < 0 || idx >= items.length) return null;
  return items[idx];
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
      started: false,
      atLineStart: false,
      lineLen: 0,
    };
    // Hide help area when streaming begins
    hideHelpArea(state);
  });

  connection.on('AgentMessageChunk', (chatId, messageId, chunk) => {
    if (!state.streamingMessage || state.streamingMessage.id !== messageId) return;
    state.streamingMessage.text += chunk;
    if (state.currentChat?.id === chatId) {
      if (!state.streamingMessage.started) {
        // Setup scroll region and position at bottom of scrollable area
        setupScrollRegion(state);

        const totalLines = getInputAreaTotalLines(state, getTerminalWidth());
        const scrollBottom = process.stdout.rows - totalLines;

        // Move to the bottom of scrollable area
        process.stdout.write(`\x1b[${scrollBottom};1H`);

        // Print blank line and prefix - this will scroll content up
        process.stdout.write('\n');
        process.stdout.write(chalk.cyan('  ✦ '));
        state.streamingMessage.started = true;
        state.streamingMessage.atLineStart = false;
        state.streamingMessage.lineLen = 0;
      }
      const maxLineWidth = Math.max(1, getTerminalWidth() - 4);
      const text = String(chunk);

      for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];

        // Handle Windows line endings: skip \r
        if (ch === '\r') {
          continue;
        }

        // Handle newlines - respect all newlines from OpenAI
        if (ch === '\n') {
          process.stdout.write('\n');
          state.streamingMessage.atLineStart = true;
          state.streamingMessage.lineLen = 0;
          continue;
        }

        if (state.streamingMessage.atLineStart) {
          process.stdout.write('    ');
          state.streamingMessage.atLineStart = false;
        }

        const chWidth = charDisplayWidth(ch);
        if (state.streamingMessage.lineLen + chWidth > maxLineWidth) {
          process.stdout.write('\n');
          process.stdout.write('    ');
          state.streamingMessage.lineLen = 0;
        }

        process.stdout.write(ch);
        state.streamingMessage.lineLen += chWidth;
      }
    }
  });

  connection.on('AgentMessageComplete', (chatId, messageId) => {
    if (!state.streamingMessage || state.streamingMessage.id !== messageId) return;
    state.streamingMessage = null;
    if (state.currentChat?.id === chatId) {
      // End the line
      process.stdout.write('\n');

      // Reset scroll region and redraw input
      resetScrollRegion();
      setupScrollRegion(state);
      redrawInputArea(state);
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
    helpMinLines: 2,
    lastChatList: [],
    lastUserList: [],
    lastInputAreaLines: null,
    lastRows: null,
    lastLayoutKey: null,
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
        showHelp(state);
        return;
      }

      if (state.showingHelp) {
        hideHelp(state);
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
        const redrew = updateCommandMode(state);
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
      if (state.showingHelp) {
        hideHelp(state);
      } else {
        redrawInputArea(state);
      }
      return;
    }

    // Handle regular character input
    if (str && !key.ctrl && !key.meta) {
      state.inputBuffer += str;
      const redrew = updateCommandMode(state);
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

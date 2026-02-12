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

const wrapText = (text, maxWidth) => {
  const lines = [];
  const rawLines = text.split('\n');

  for (const line of rawLines) {
    if (line.length <= maxWidth) {
      lines.push(line);
      continue;
    }

    let remaining = line;
    while (remaining.length > maxWidth) {
      let breakPoint = remaining.lastIndexOf(' ', maxWidth);
      if (breakPoint === -1) breakPoint = maxWidth;

      lines.push(remaining.slice(0, breakPoint));
      remaining = remaining.slice(breakPoint).trimStart();
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

const getHelpLines = (state) => {
  if (state.showingHelp) {
    return state.helpContent.length || 1;
  }
  return 2; // Hint line + empty line for spacing
};

const getInputLineCount = (state, width) => {
  const maxWidth = Math.max(1, width - 2);
  const text = state.inputBuffer || '';
  const rawLines = text.split('\n');
  let count = 0;

  rawLines.forEach((line) => {
    if (!line) {
      count += 1;
      return;
    }
    count += Math.max(1, Math.ceil(line.length / maxWidth));
  });

  return Math.max(1, count);
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
    let remaining = line;
    while (remaining.length > maxWidth) {
      lines.push(remaining.slice(0, maxWidth));
      remaining = remaining.slice(maxWidth);
    }
    lines.push(remaining);
  });

  return lines.length > 0 ? lines : [''];
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
  const helpKey = state.showingHelp ? state.helpContent.join('\n') : '';
  const layoutKey = `${width}|${helpLines}|${inputLines}|${state.showingHelp ? 1 : 0}|${helpKey}`;
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
    if (state.showingHelp) {
      state.helpContent.forEach((line) => {
        process.stdout.write(chalk.gray(line) + '\n');
      });
    } else {
      process.stdout.write(chalk.gray('  ? for shortcuts') + '\n');
      process.stdout.write('\n');
    }
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
  const cursorCol = Math.min(width, 3 + lastLine.length);
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
  state.helpContent = [
    '  Chat Commands:',
    '    /cl              List all chats',
    '    /cj <n>          Join chat by number',
    '    /cq              Quit current chat',
    '    /cd              Clear/delete current chat',
    '    /cn              Show current chat name',
    '',
    '  Other Commands:',
    '    /help            Show this help',
    '    /quit            Exit application',
    '', // Empty last line
  ];
  state.showingHelp = true;
  redrawInputArea(state);
};

const hideHelp = (state) => {
  state.showingHelp = false;
  state.helpContent = [];
  redrawInputArea(state);
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
        printMessage(state, 'assistant', `${formatted.name}: ${formatted.text}`);
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
        state.streamingMessage.lineLen = 0;
      }
      const maxLineWidth = Math.max(1, getTerminalWidth() - 4);
      const text = String(chunk);

      for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];

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

        if (state.streamingMessage.lineLen >= maxLineWidth) {
          process.stdout.write('\n');
          process.stdout.write('    ');
          state.streamingMessage.lineLen = 0;
        }

        process.stdout.write(ch);
        state.streamingMessage.lineLen += 1;
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
  printSuccess(state, `Joined: ${chat.name}`);

  await loadMessages(state, chat.id);
  const messages = state.messages[chat.id] || [];
  messages.slice(-HISTORY_LIMIT).forEach((m) => {
    if (m.senderId === state.meId) {
      printMessage(state, 'user', m.text || '');
    } else {
      const formatted = formatInboundMessage(m, state.meId);
      if (formatted) {
        printMessage(state, 'assistant', `${formatted.name}: ${formatted.text}`);
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
        console.log();
        console.log(chalk.cyan.bold('Available Chats:'));
        console.log();
        state.chats.forEach((chat, idx) => {
          const label = chat.chatType === 'group' ? chalk.magenta('[GROUP]') : chalk.blue('[DM]');
          console.log(chalk.gray(`  ${idx + 1}. ${label} ${chat.name}`));
        });
        printSystem(state, 'Use /cj <number> to join a chat');
        break;

      case '/cj':
        await loadChats(state);
        await selectChatByIndex(state, Number(arg));
        return;

      case '/cq':
        if (state.currentChat) {
          await leaveChatRealtime(state, state.currentChat.id);
          printSuccess(state, `Left chat: ${state.currentChat.name}`);
          state.currentChat = null;
        } else {
          printError(state, 'No active chat.');
        }
        break;

      case '/cd':
        if (!state.currentChat) {
          printError(state, 'No active chat.');
        } else {
          await state.api.post(`/chat/${state.currentChat.id}/clear`, {});
          printSuccess(state, `Chat cleared: ${state.currentChat.name}`);
          state.currentChat = null;
        }
        break;

      case '/cn':
        if (!state.currentChat) {
          printError(state, 'No active chat.');
        } else {
          printSystem(state, `Current chat: ${state.currentChat.name}`);
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
        printError(state, `Unknown command: ${cmd}`);
        printSystem(state, 'Type /help for available commands.');
    }

    redrawInputArea(state);
  } catch (err) {
    const msg = err?.response?.data?.message || err.message;
    printError(state, `Error: ${msg}`);
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
    showingHelp: false,
    helpContent: [],
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
        if (state.showingHelp && state.inputBuffer !== '/') {
          hideHelp(state);
        } else {
          redrawInputArea(state);
        }
      }
      return;
    }

    // Handle Escape
    if (key.name === 'escape') {
      state.inputBuffer = '';
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

      if (state.inputBuffer === '/') {
        showHelp(state);
      } else if (state.showingHelp && state.inputBuffer !== '/') {
        hideHelp(state);
      } else {
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

# BBTalk - KanKan CLI Chat Client

A polished command-line chat client for the KanKan messaging system, inspired by Claude's interface design.

## Features

✨ **Modern Terminal UI**
- Full-screen blessed-based interface with proper cursor management
- Scrollable message history with scrollbar
- Status bar showing current chat and user info
- Clean input box with border highlighting
- Proper keyboard navigation (arrow keys, page up/down)

🎨 **Beautiful Display**
- Color-coded messages (cyan for other users, white for you)
- Formatted help screen with organized command groups
- Real-time streaming message support
- Visual indicators for online/offline status
- Professional box-drawing characters

⌨️ **Intuitive Controls**
- **Enter**: Send message
- **Ctrl+C/Escape**: Quit application
- **Ctrl+U**: Clear input line
- **Up/Down**: Scroll message history
- **PageUp/PageDown**: Fast scroll through messages
- **/** prefix: Run commands

## Setup

```bash
cd KanKan/bbtalk
npm install
```

## Login

```bash
node index.js login <email> <password> --base-url http://localhost:5001/api
# Example:
node index.js login alice@example.com 12345678 --base-url http://localhost:5001/api
```

## Start interactive mode

```bash
node index.js
# or
npm start
```

## Commands

### Chat Commands
- `/cl` - List all chats (DMs + groups)
- `/cj <n>` - Join chat by number (from /cl)
- `/cq` - Quit current chat
- `/cd` - Clear/delete current chat
- `/cn` - Show current chat name
- `/join <#name>` - Join a group by name
- `/leave <#name>` - Leave a group by name

### User Commands
- `/ul` - List all users/contacts
- `/ua <user>` - Add user (send friend request)
- `/ur` - List pending friend requests
- `/urc [n]` - Accept request (number or all)
- `/urd [n]` - Decline request (number or all)

### Other Commands
- `/help` - Show help message (formatted like Claude)
- `/quit` - Exit the application

## Config

Configuration is stored at `~/.bbtalk.json`:

```json
{
  "baseUrl": "http://localhost:5001/api",
  "token": "your-access-token",
  "userId": "your-user-id",
  "userName": "Your Display Name"
}
```

You can override base URL with:

```bash
BBTALK_BASE_URL=http://localhost:5001/api node index.js
```

## Technical Details

### Architecture
- **blessed**: Terminal UI framework for rich interface elements
- **SignalR**: Real-time WebSocket communication
- **axios**: HTTP API client
- **chalk**: Terminal color support
- **commander**: CLI argument parsing

### Key Improvements Over Previous Version
1. **Fixed cursor positioning** - Uses blessed's built-in cursor management instead of raw ANSI escapes
2. **Better input handling** - Native textbox component with proper editing support
3. **Scrollable history** - Can scroll through unlimited message history with keyboard
4. **Professional help screen** - Formatted like Claude with organized sections and color coding
5. **Status bar** - Always visible context about current state (chat name, user, shortcuts)
6. **Real-time streaming** - Properly handles token-by-token message streaming with live updates
7. **Keyboard shortcuts** - Full set of intuitive controls (Ctrl+U, PageUp/Down, etc.)
8. **Error handling** - Graceful error display with color coding and helpful messages
9. **Auto-scrolling** - Always scrolls to bottom when new messages arrive
10. **Message persistence** - Maintains message history during session

### UI Layout

```
┌─────────────────────────────────────────────┐
│  Message History (scrollable)               │
│  ✦ Wa: Hello!                               │
│  > Your message here                        │
│  ...                                        │
│                                             │
│                                             │
└─────────────────────────────────────────────┘
 Chat: Room Name | User: Alice | Commands: /
┌─────────────────────────────────────────────┐
│ > Your input here...                        │
└─────────────────────────────────────────────┘
```

## Requirements

- Node.js 14+ (for ES modules support)
- KanKan server running on localhost:5001 or configured URL

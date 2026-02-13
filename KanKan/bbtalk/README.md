# BBTalk - KanKan CLI Chat Client

A polished command-line chat client for the KanKan messaging system, inspired by Claude's interface design.

## Features

✨ **Modern Terminal UI**
- Full-screen ANSI interface with cursor and scroll-region management
- Scrollable message history (content area excludes input/help)
- Clean input box with separators and wrapped input lines
- Inline help/command suggestion area below the input

🎨 **Beautiful Display**
- Color-coded messages (cyan for other users, white for you)
- Formatted help screen with organized command groups
- Real-time streaming message support
- Visual indicators for online/offline status
- Professional box-drawing characters

⌨️ **Intuitive Controls**
- **Enter**: Send message
- **Ctrl+C**: Quit application
- **Escape**: Clear input and hide help
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
- **ANSI escape codes**: Terminal UI layout (scroll region, cursor movement)
- **SignalR**: Real-time WebSocket communication
- **axios**: HTTP API client
- **chalk**: Terminal color support
- **commander**: CLI argument parsing

### Key Behaviors
1. **Scroll region** - Content area scrolls independently from the input/help area
2. **Wrapped input** - Input text wraps across multiple lines with a fixed prompt prefix
3. **Help/commands** - Typing `/` shows help; typing `/x` shows suggestions
4. **Streaming output** - Agent responses stream inline and preserve newlines
5. **Color cues** - User messages use `>`, assistant messages use `✦`
6. **History load** - Joins a chat and prints the latest history on entry

### UI Layout

```
<scrolling content area>
  ✦ Wa: Hello!
  > Your message here
  ...
──────────────────────────────────────────────
> input wraps across multiple lines...
──────────────────────────────────────────────
  ? for shortcuts
```

## Requirements

- Node.js 14+ (for ES modules support)
- KanKan server running on localhost:5001 or configured URL

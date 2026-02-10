# KanKan Chat – Detailed Design (Wa, Avatars, Clear Chat, Rename)

## Scope
This document describes the **chat-domain behavioral rules** and their **server + client implementations** for:

- The built-in AI agent user (**Wa**) and how it participates in chats.
- Direct-vs-group classification and **avatar/name rendering**.
- Per-user **Clear Chat** ("delete history for me") semantics.
- **Group rename** permissions and API contract.

Non-goals:
- Message encryption, key management.
- Full admin/role management beyond `adminIds`.

---

## Glossary
- **Wa**: The AI agent user. Canonical user id: `user_ai_wa`.
- **Real participant**: A participant whose `userId != user_ai_wa`.
- **Other real participants**: Real participants excluding the current user.
- **Real group chat**: A chat that has **at least 2 other real participants** (i.e. `otherRealCount >= 2`).
  - This intentionally classifies `Me + Bob + Wa` as **direct** (only 1 other real participant).

---

## Domain Rules

### 1) Wa can appear anywhere but is not counted
Wa may be present in `chat.participants` for any chat (direct or group), but must be excluded from:

- Participant counts shown to users (e.g. "members").
- Direct-vs-group classification.
- Group/composite avatar member lists.
- Online badges and “currently active participants” UI.

Wa is allowed to be the *only* other party in a direct chat.

**Client single source of truth:** `client/src/utils/chatParticipants.ts`
- `WA_USER_ID = 'user_ai_wa'`
- `getRealParticipants(...)`
- `getOtherRealParticipants(chat, myUserId)`
- `isRealGroupChat(chat, myUserId)`

**Server alignment:** Wa-safe constants and chat DTO display mapping are centralized in `server/Domain/Chat/ChatDomain.cs` and consumed by `server/Controllers/ChatController.cs` and `server/Hubs/ChatHub.cs`.

---

### 2) Direct vs Group classification (UI-facing)
The UI must not rely solely on `chat.chatType` for rendering decisions because historical data or conversion flows can temporarily create ambiguous participant sets.

**Definition used by UI:**

- Direct-style chat if `otherRealParticipants.length <= 1`
- Group-style chat if `otherRealParticipants.length >= 2`

This ensures:
- `Me + Wa` → direct
- `Me + Bob` → direct
- `Me + Bob + Wa` → direct
- `Me + Bob + Carol` → group
- `Me + Bob + Carol + Wa` → group

---

## Avatar + Name Rendering Rules

### 3) Direct chat avatar
Direct chats must render a **single avatar** (never composite):

Pick a single “display participant” for the chat header/list row:

1. Prefer the first **other real participant** (non-Wa, not me).
2. Else prefer **Wa** if present.
3. Else fallback to any other participant (defensive).

**Client helper:** `getDirectDisplayParticipant(chat, myUserId)`.

### 4) Group chat avatar (composite)
Group chats render a composite avatar consisting of up to **9 real participants** (excluding Wa):

- Input to composite: `realParticipants.filter(p => p.userId !== myUserId)` or include self depending on UX; current UI uses the real participant list (excluding Wa) and relies on the `GroupAvatar` grid rules.
- Maximum 9 tiles.
- If fewer participants than grid tiles, render blanks for remaining cells.

**Rendering component:** `client/src/components/Shared/GroupAvatar.tsx`
- `members.slice(0, 9)`
- Grid shape based on member count: 2×1, 2×2, or 3×3.

---

## “Clear Chat” (Per-User Delete Semantics)

### 5) Behavior
"Delete chat" in the UI is implemented as **clear history for the current user**:

- Clears the visible message history for that user only.
- Hides the chat from that user’s chat list immediately.
- The chat reappears if new messages arrive later.
- Only messages **after** the clear time are visible.

This is **not** a destructive delete of the chat or messages for other participants.

### 6) Data model
`ChatParticipant` stores per-user clear state:

- `isHidden: bool` – whether the chat is hidden for that participant.
- `clearedAt: DateTime?` – cutoff timestamp; messages at/before are omitted for that user.

Source of truth: `server/Models/Entities/Chat.cs`.

### 7) API
- `POST /api/chat/{chatId}/clear`
  - Auth required
  - Sets `participants[me].isHidden = true`
  - Sets `participants[me].clearedAt = nowUtc`

- `GET /api/chat/{chatId}/messages`
  - If `participants[me].clearedAt` is set, filter to `message.timestamp > clearedAt`.

Implementation notes:
- `ChatController.ClearChat(...)` delegates to `IChatRepository.ClearChatForUserAsync(...)`.
- MongoDB implementation patches participant fields; in-memory implementation updates the in-memory entity.

### 8) Re-appearance on new messages
When a new message is sent, the server un-hides any participants that were hidden so the chat reappears (existing behavior in send-message flows). This keeps “clear” semantics aligned with “chat comes back only when new messages arrive”.

---

## Group Rename + Admin Rules

### 9) Permissions
Group rename is **admin-only**:

- A user is an admin if their `userId` is included in `chat.adminIds`.
- Group id remains internal; multiple groups may share the same display name.

### 10) API
- `PUT /api/chat/{chatId}`
  - Request body: `{ "groupName"?: string, "groupAvatar"?: string }`
  - Server validates:
    - Chat exists and caller is a participant
    - If updating `groupName` / group settings: caller must be in `adminIds`

### 11) DTO mapping requirement (critical)
The client determines admin UX (e.g., showing the rename pencil) from `chat.adminIds`.

Therefore `adminIds` must be included consistently in:
- REST chat list + chat detail responses (`ChatController.MapToChatDto`)
- SignalR-driven updates (`ChatHub.MapToChatDto`)

This prevents cases where:
- A newly created group works server-side but the creator cannot rename because `adminIds` was omitted in the DTO.

---

## Client Implementation Map

Key files that implement these rules:

- `client/src/utils/chatParticipants.ts`
  - Centralizes Wa and “real participant” rules.

- `client/src/components/Chat/ChatSidebar.tsx`
  - Chat list rendering:
    - Direct: single avatar via `getDirectDisplayParticipant`
    - Group: `GroupAvatar` fed with **real participants only**
    - Participant line and online badge exclude Wa
    - “Delete/Clear” triggers `chatService.clearChat(chat.id)`

- `client/src/components/Chat/ChatWindow.tsx`
  - Header avatar/name based on `isRealGroupChat`
  - Member count excludes Wa
  - Rename UI displayed only when `chat.adminIds.includes(myUserId)`

- `client/src/services/chat.service.ts`
  - Adds `updateChat(...)` and `clearChat(...)` endpoints

---

## Edge Cases / Expectations
- A chat can contain Wa plus any set of users; UI must remain stable even if `chat.chatType` is inconsistent with participants.
- Group avatar never includes Wa even if Wa appears in the participant list.
- Clearing a chat does not delete messages globally; it only affects the clearing participant’s visibility.
- If a user opens a hidden chat explicitly, the server may unhide it (separate from clear).

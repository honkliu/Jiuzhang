# User Help

## Register And Sign In

Registration has two steps.

Registration flow:

- On the sign-in page, open registration, enter your email, and continue.
- The system prepares a registration verification code for that email and notifies admins.
- Ask an admin for the code. Admins can see pending registration codes on the verification page.
- Return to registration and enter the code, display name, password, and confirmation password.
- Display name must be at least 2 characters. Password must be at least 8 characters, and both password fields must match.
- After the account is created, you are signed in automatically and taken to Chats.

Notes:

- Your email is your account name; the same email cannot be registered twice.
- If the email is wrong, use Change Email to return to the first step.
- If the code is invalid or expired, ask an admin to refresh or provide a new code.

## Chat

Use **Chats** to talk with people or groups. You can send text, images, voice messages, and quick AI-assisted content.

Chat commands:

- `/h` shows chat command help.
- `/w` lists chat members.
- `/wa` lists active members.
- `/b <text>` sends bold text.
- `/i <text>` sends italic text.
- `/r <text>` sends red text.
- `/p [prompt]` creates an image; in groups use `/p @name [prompt]` or `/p @name @name [prompt]` to choose people.
- `/a @name` adds someone to the current chat.
- `@name` mentions one person.
- `@@` calls River.

Examples:

- `@@ summarize this plan`
- `/p @Amy @Ben wearing formal wedding clothes` creates a photo with mentioned people.

2D immersive chat basics:

- Open a one-on-one chat.
- Click the 2D button on the right side of the chat title bar.
- The left and right sides show the other person's latest messages and your latest messages.
- Click the 2D button again to return to the regular chat list.

## bbtalk

bbtalk is the command-line chat tool. It is useful when you want to chat from a terminal, read long answers, or view Markdown and formula output cleanly.

bbtalk basics:

- For first-time setup, go to `KanKan/bbtalk` and run `npm install`.
- Log in with `node index.js login <email> <password> --base-url <api-base-url>`.
- Start it with `npm start` or `node index.js`.
- Type a message and press Enter to send; press `Ctrl+C` to quit.

bbtalk chat commands:

- `/cl` lists chats.
- `/cj <number>` enters a chat from the `/cl` list.
- `/cq` leaves the current chat.
- `/cd` clears/deletes the current chat history.
- `/cn` shows the current chat name.

bbtalk contact commands:

- `/ul` lists users.
- `/ua <number>` sends a friend request to a user from the `/ul` list.
- `/c <number>` starts a one-on-one chat with a user from the `/ul` list.
- `/ur` lists pending friend requests.
- `/urc [number]` accepts one request; omit the number to accept all.
- `/urd [number]` declines one request; omit the number to decline all.

bbtalk other commands:

- `/du <number>` deletes a user from the `/ul` list; admin only.
- `/help` shows help.
- `/quit` exits the program.

## Image Beautification

Open an image to enter the lightbox. From there you can zoom, browse source images, view generated edits, and create new edits with prompts.

Basic flow:

- Open a photo from chat, Pa, receipts, gallery, or family pages.
- Type what you want, then click edit.
- Use the prompt library button for ready-made ideas.
- Use the tune button for quick style or expression choices.
- Select another image as reference when you want two-image composition.

Examples:

- `change the background to a quiet Chinese garden`
- `make this portrait look like a formal ID photo`
- `remove the people in the background`

## Notes

Use **Notes** for longer writing: meeting notes, drafts, family records, study notes, or anything that needs structure.

What to know:

- Use the notebook selector to switch between notebooks.
- Sections are the colored tabs at the top.
- Pages are switched with the page arrows and page number.
- Double-click a section name to rename it.
- Use import/export for backup or moving notes.

Example:

- Create `Project A`, add sections `Ideas`, `Meetings`, `Decisions`.

## Family Tree

Use **Family Tree** to browse people, relationships, generations, and family notebook pages. Click a person to view details, photos, notes, spouses, parents, and children.

Common actions:

- Add parents, spouses, and children from the person panel.
- Use brief notes for short labels, not long stories.
- Put longer stories in the family notebook.
- Use linked persons to connect the same person across different trees.

Adoption and lineage:

- `出继` marks that a child leaves the biological branch to inherit another branch.
- The system also creates the matching `继子` relation under the adoptive parent.
- Choose the adoptive uncle or branch carefully before saving.

Examples:

- Link a person in `Shaol Main Tree` to the matching person in `Shaol Branch Tree`.
- Mark a second son as `出继` when he inherits an uncle's branch.

## Receipts

Use **Receipts** to keep receipt photos and extracted records. Upload a photo, review the result, then correct fields if needed.

Tips:

- Batch upload is good after a trip or hospital visit.
- The image collection view is for browsing receipt photos visually.
- OCR is a draft; always check totals, dates, and hospital names.

Example:

- Upload several medical receipts, then correct the date and total before searching later.

## Pa

**Pa** is a lightweight sharing space. Post quick updates or images when a full chat or note feels too heavy.

Example:

- Share one travel photo with a short caption.

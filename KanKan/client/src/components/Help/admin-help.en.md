# Admin Help

## Chat

Admins manage users and keep domain groups healthy. Default domain groups are created from email domains, so use consistent user email domains.

Admin checks:

- Confirm user email domains before expecting default groups to work.
- River is a system user and should be initialized by the server startup path.
- If a database was cleaned, restart the server so startup initialization runs.

Chat commands:

- `/h` shows chat command help.
- `/w` lists chat members.
- `/wa` lists active members.
- `/b <text>`, `/i <text>`, and `/r <text>` send bold, italic, and red text.
- `/p [prompt]` creates an image; in groups use `@name` to choose people.
- `/a @name` adds someone to the current chat.
- `@name` mentions one person; `@@` calls River.

2D immersive chat admin basics:

- The entry point is the 2D button on the right side of a one-on-one chat title bar.
- Users still send normal direct-chat messages; the view only presents recent content in two sides.
- If a user cannot see the 2D button, first confirm the current chat is a one-on-one chat.
- If the view renders incorrectly, check the direct-chat message data and browser console errors first.

Example:

- A user with `amy@shaol.com` belongs to the `shaol.com` default group.

## bbtalk

bbtalk is for people who want terminal chat. It is also useful for checking Wa's long answers, Markdown, tables, and formula rendering.

bbtalk admin basics:

- The install folder is `KanKan/bbtalk`; run `npm install` the first time.
- Log in with `node index.js login <email> <password> --base-url <api-base-url>`.
- Start with `npm start` or `node index.js`.
- If it cannot connect, check the API base URL, login token, KanKan server, and SignalR connection.

bbtalk commands:

- Chat: `/cl` lists chats, `/cj <number>` enters a chat, `/cq` leaves the current chat, `/cd` clears/deletes current chat history, `/cn` shows the current chat name.
- Contacts: `/ul` lists users, `/ua <number>` sends a friend request, `/c <number>` starts a one-on-one chat, `/ur` lists requests, `/urc [number]` accepts, `/urd [number]` declines.
- Admin: `/du <number>` deletes a user from the `/ul` list.
- Other: `/help` shows help, `/quit` exits the program.

## Image Beautification

Image beautification is a major workflow. It depends on image upload, prompt composition, generation jobs, and saved generated results.

What admins should know:

- Users can generate from chat images, Pa images, family images, receipt images, and gallery images.
- Prompt library entries should stay short and reusable.
- Generated results are shown under the same source image, so users can compare original and edits.
- If generation feels slow, check the image generation service before changing UI code.

Example:

- A good prompt is `formal portrait, clean background`; a weak prompt is `make it better`.

## Notes

Use notebooks for shared knowledge that should outlive a chat. Keep page names short and split large topics into sections.

Management:

- Use settings to manage who can view or edit a notebook.
- Export important notebooks before large cleanup work.
- Import can restore or move a notebook archive.
- Encourage one topic per notebook; avoid one giant notebook for everything.

Example:

- Create sections such as `Projects`, `Family Records`, and `Decisions`.

## Family Tree

Admins create, import, and manage family trees for enabled domains. Start with one clean tree, then add people, relationships, and optional notebook pages.

Setup:

- Enable the domain before users expect to see the family tree menu.
- Create or import the tree, then verify root person, surname, and generation.
- Manage visibility for users or domains when a tree crosses family branches.

Relationships:

- Parents, spouses, and children drive the visible tree structure.
- `出继` should be used only when the lineage meaning is clear.
- Linked persons connect the same person across separate trees; they do not merge the trees.

Examples:

- Create a tree for `shaol.com`, import the root person, then add parents, spouses, and children.
- Link a branch-tree ancestor back to the same ancestor in the main tree.

## Receipts

Admins usually help with cleanup: duplicate photos, wrong dates, or extraction mistakes. The goal is searchable records, not perfect OCR.

Review checklist:

- Check date, total amount, vendor or hospital name.
- Keep original photos when possible; they are the audit trail.
- Use the photo collection view for visual cleanup.

Example:

- After batch extraction, spot-check totals and dates before trusting reports.

## Pa

Pa needs little administration. Keep it friendly and remove only content that clearly does not belong.

Admin tip:

- If a post should become long-term knowledge, move the idea into Notes instead of leaving it only in Pa.

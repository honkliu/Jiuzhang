# Admin Configuration

This admin help only covers configuration. For everyday use of chat, notes, family trees, receipts, Pa, and other features, use the user help.

## Access Config

Open **Config** from the top navigation. Saved changes take effect immediately; the API does not need a restart.

Configuration rules:

- Add a row to enable that rule.
- Delete a row to remove that rule.
- Click **Save** in the current configuration block after editing.
- Click **Refresh** first when you need to reload the server state.

## kankan@kankan

`kankan@kankan` is the root admin and can maintain global access configuration.

Sections:

- **Domain visibility**: enter a source domain and a visible domain. Users from the source domain can see family trees from the visible domain.
- **Family tree domains**: enter email domains that can use family tree features, such as `shaol.com`.
- **Admin users**: enter system admin emails. An admin can naturally manage the enabled family-tree domain that matches their own email domain.
- **Family tree managers**: enter a user email and a managed domain. That user can create, import, and edit family trees in that domain.

Checks:

- Use **Domain visibility preview** to confirm cross-domain visibility rules.
- A family tree manager can be a normal user; they do not need to be in the admin list.
- Yellow rows or brown email text mean the config references a user that does not exist yet.

## Regular Admins

Regular admins can only maintain family tree managers for domains they already manage.

How to configure:

- Add the user email and managed domain in **Family tree managers**.
- The managed domain must already be editable by the current admin.
- After saving, check **Who can create and view each family tree** for domain state and tree counts.
- Check **Effective user permissions** to confirm each user's final editable domains.

## Common Setup Flow

When opening a new family-tree domain:

1. Sign in as `kankan@kankan` and add the domain under **Family tree domains**.
2. If cross-domain viewing is needed, add a **Domain visibility** rule.
3. Add the responsible **Admin user** or **Family tree manager**.
4. Save, refresh, and review the preview tables.

When granting a normal user family-tree management:

1. Add the user's email under **Family tree managers**.
2. Enter the domain they should manage.
3. Save and verify their effective editable domains.

## Troubleshooting

- User cannot see the family tree entry: confirm their email domain is in **Family tree domains**.
- User cannot create or edit a tree: confirm they are covered by **Admin users** or **Family tree managers** for that domain.
- Cross-domain trees are not visible: check **Domain visibility** and **Domain visibility preview**.
- Saved state looks wrong: click **Refresh** and confirm what the server returned.

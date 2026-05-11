# Shang Prototype

Shang is a local-first personal knowledge and agent runtime prototype. This first version focuses on two foundations:

- reading LLM settings directly from config files, including KanKan-style `Agent` config blocks
- letting installed agents talk to each other through address syntax such as `@localhost://home/A2` or `@https://come.com/home/A2`

## Quick Start

```powershell
cd Shang
node src/cli.js init --name A1 --listen http://localhost:8787
node src/cli.js doctor
node src/cli.js serve
```

In a second Shang install, initialize another agent:

```powershell
node src/cli.js init --name A2 --listen http://localhost:8788
```

Then A1 can send to A2 either through a local install address:

```powershell
node src/cli.js send @localhost://C:/path/to/A2 "hello from A1"
```

or through a deployed URL:

```powershell
node src/cli.js send @https://come.com/home/A2 "hello from A1"
```

## Config

The default config lives at `Config/shang.json`. Shang can also read a KanKan-style appsettings file if it contains an `Agent` block:

```json
{
  "Agent": {
    "BaseUrl": "https://example.com/v1",
    "ApiKey": "...",
    "Model": "..."
  }
}
```

Use `--from <path>` during init to import that shape into Shang's config.

## Address Model

`@localhost://path/to/agent` resolves to a local install directory. Shang reads that install's `Config/shang.json`; if the target has an `agent.endpoint`, it sends HTTP to the target server. If there is no endpoint, it handles the message directly in that local directory and records inbox/outbox logs under `Runs/`.

`@https://host/path/to/agent` resolves to `https://host/path/to/agent/agent/message` and sends an HTTP request.

## Knowledge Category

Put files under `Raw/`, then run:

```powershell
node src/cli.js knowledge category
```

The first prototype uses local rules, so it works even before LLM config is filled in. It writes generated category pages to `Knowledge/categories/`:

```text
Knowledge/categories/index.md
Knowledge/categories/index.json
Knowledge/categories/code.md
Knowledge/categories/product.md
Knowledge/categories/research.md
Knowledge/categories/personal.md
Knowledge/categories/writing.md
Knowledge/categories/uncategorized.md
```

Useful options:

```powershell
node src/cli.js knowledge category --raw Raw
node src/cli.js knowledge category --output Knowledge/categories
node src/cli.js knowledge category --home C:/path/to/Shang
```

This command is intentionally incremental-ready: each categorized document records its relative path, size, type, and SHA256 hash. The next step is to compare those hashes before reprocessing content.

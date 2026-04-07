# Claude Dashboard

A lightweight floating overlay window for monitoring multiple [Claude Code](https://claude.ai/code) terminal sessions simultaneously.

![screenshot placeholder](https://img.shields.io/badge/platform-Windows-blue)

## Features

- **Floating overlay** — frameless, transparent, always on top
- **Auto-detects sessions** — reads Claude Code's JSONL files directly, no configuration needed
- **Smart status detection** — distinguishes between Claude actively working vs. waiting for input
- **Click-through mode** — pin button makes the window non-blocking (only the button stays clickable)
- **Remembers position & size** — restored automatically on next launch
- **Auto-start on boot** — optional Windows startup entry

## Status indicators

| Color | Meaning |
|-------|---------|
| 🟢 进行中 | Claude is actively processing your request |
| 🟡 等待输入 | Claude finished, waiting for your next message |

Sessions idle for more than 5 minutes are hidden automatically.

## Requirements

- Windows 10/11
- [Node.js](https://nodejs.org/) 18+
- [Claude Code](https://claude.ai/code) CLI

## Installation

```bash
git clone https://github.com/YOUR_USERNAME/claude-dashboard
cd claude-dashboard
npm install
```

## Usage

**Start the dashboard:**
```bash
npm start
```

Or double-click `launch.vbs` for a silent start (no console window).

**Set up auto-start on boot:**
```powershell
$startup = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup"
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut("$startup\Claude Dashboard.lnk")
$shortcut.TargetPath = "$PWD\launch.vbs"
$shortcut.WorkingDirectory = $PWD
$shortcut.Save()
```

## Controls

| Control | Action |
|---------|--------|
| Drag title bar | Move window |
| Drag bottom-right corner | Resize |
| ⊙ button | Toggle click-through mode |
| — button | Minimize |
| ✕ button | Close |

## How it works

Claude Code writes conversation history to JSONL files at `~/.claude/projects/`. This dashboard polls those files every 3 seconds and determines session status using two signals:

1. **File mtime** — if the file was modified within the last 5 minutes, the session is active
2. **Last entry type** — if the last recorded entry is a `user` message (Claude hasn't responded yet), the session is shown as actively working even if mtime hasn't changed recently (e.g. during long inference)

Activity detection logic is inspired by [Kanban Code](https://github.com/langwatch/kanban-code).

## Optional: browser access

The included HTTP server (`node index.js`) serves the dashboard at `http://localhost:3031` if you prefer a browser view.

## License

MIT

// Claude Code Session Dashboard
// Activity detection logic borrowed from Kanban Code (github.com/langwatch/kanban-code)
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 3031;
const LIVE_FILE = path.join(os.homedir(), '.claude-dashboard', 'live.json');

function getLiveSessions() {
  try { return JSON.parse(fs.readFileSync(LIVE_FILE, 'utf8')); }
  catch { return null; } // null = live.json doesn't exist yet → fall back to mtime
}

// --- Path resolution (mirrors Kanban Code's resolve_all_claude_dirs) ---
function getClaudeDirs() {
  const dirs = [];
  const home = os.homedir();

  // 1. Native Windows / Linux / macOS: ~/.claude/projects
  const native = path.join(home, '.claude', 'projects');
  if (fs.existsSync(native)) dirs.push(native);

  // 2. Claude Desktop app: %APPDATA%\Claude\projects
  if (process.env.APPDATA) {
    const desktop = path.join(process.env.APPDATA, 'Claude', 'projects');
    if (fs.existsSync(desktop)) dirs.push(desktop);
  }

  return dirs;
}

// --- Activity detection (mirrors Kanban Code's ActivityTracker) ---
const prevMtimes = new Map();

function detectActivity(filePath) {
  try {
    const mtime = fs.statSync(filePath).mtimeMs;
    const elapsed = Date.now() - mtime;

    if (elapsed > 86400000) return 'stale';      // > 24h
    if (elapsed > 300000)   return 'ended';      // > 5min

    const prev = prevMtimes.get(filePath);
    prevMtimes.set(filePath, mtime);

    if (prev === undefined)    return elapsed < 10000 ? 'activelyWorking' : 'needsAttention';
    if (mtime !== prev)        return 'activelyWorking';
    return 'needsAttention';
  } catch {
    return 'stale';
  }
}

// --- JSONL parsing ---
function readTail(filePath, n = 60) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return content.trim().split('\n').filter(l => l.trim()).slice(-n);
  } catch { return []; }
}

function extractText(message) {
  if (!message) return '';
  if (typeof message === 'string') return message.slice(0, 80);
  const c = message.content;
  if (typeof c === 'string') return c.slice(0, 80);
  if (Array.isArray(c)) {
    const t = c.find(p => p && p.type === 'text');
    return t ? (t.text || '').slice(0, 80) : '';
  }
  return '';
}

function parseSession(filePath, liveSessions) {
  const mtimeActivity = detectActivity(filePath);
  if (mtimeActivity === 'stale') return null;

  const lines = readTail(filePath);
  let cwd = '', sessionId = '', slug = '', lastMsg = '', isInteractive = false, lastType = '';

  for (const line of lines) {
    try {
      const e = JSON.parse(line);
      if (e.cwd)       cwd = e.cwd;
      if (e.sessionId) sessionId = e.sessionId;
      if (e.slug)      slug = e.slug;
      if (e.entrypoint === 'cli') isInteractive = true;
      if (e.type)      lastType = e.type;
      if (e.type === 'user') {
        const txt = extractText(e.message);
        if (txt && !txt.includes('local-command-caveat')) lastMsg = txt;
      }
    } catch {}
  }

  if (!sessionId || !isInteractive) return null;

  const stat = fs.statSync(filePath);
  const ageMs = Date.now() - stat.mtimeMs;

  let activity;
  if (liveSessions !== null && sessionId in liveSessions) {
    // Confirmed open via hook → show, use lastType for status
    activity = (lastType === 'user') ? 'activelyWorking' : 'needsAttention';
  } else {
    // Not in live.json → fall back to mtime
    const ACTIVE_THRESHOLD = 30 * 60 * 1000; // 30 min
    if (lastType === 'user' && ageMs < ACTIVE_THRESHOLD) {
      // Last entry is user message AND file is recent → Claude still processing
      activity = 'activelyWorking';
    } else {
      activity = mtimeActivity;
      if (activity === 'ended') return null;
    }
  }

  return { filePath, sessionId, cwd, slug, lastMsg, activity, ageMs };
}

function getSessions() {
  const liveSessions = getLiveSessions(); // null = fallback to mtime
  const all = [];
  for (const dir of getClaudeDirs()) {
    try {
      for (const proj of fs.readdirSync(dir)) {
        const projDir = path.join(dir, proj);
        try {
          for (const f of fs.readdirSync(projDir)) {
            if (!f.endsWith('.jsonl')) continue;
            const s = parseSession(path.join(projDir, f), liveSessions);
            if (s) all.push(s);
          }
        } catch {}
      }
    } catch {}
  }

  // Sort by recency
  all.sort((a, b) => a.ageMs - b.ageMs);

  // Active sessions: show all regardless of cwd
  // Ended sessions: dedup by cwd (keep most recent per cwd)
  const active = all.filter(s => s.activity !== 'ended');
  const ended  = [];
  const seenCwd = new Set();
  for (const s of all.filter(s => s.activity === 'ended')) {
    if (!seenCwd.has(s.cwd)) { seenCwd.add(s.cwd); ended.push(s); }
  }
  return [...active, ...ended];
}

function formatAge(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60)  return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

// --- HTML renderer ---
function renderHTML(sessions) {
  const active  = sessions.filter(s => s.activity === 'activelyWorking');
  const waiting = sessions.filter(s => s.activity === 'needsAttention');
  const ended   = sessions.filter(s => s.activity === 'ended');

  const card = (s) => {
    const name = s.cwd.replace(/\\/g, '/').split('/').pop() || s.cwd;
    const colors = {
      activelyWorking: { border: '#22c55e', bg: '#0b1a0d', dot: '#22c55e', label: '● 进行中' },
      needsAttention:  { border: '#f59e0b', bg: '#1a140a', dot: '#f59e0b', label: '● 等待输入' },
      ended:           { border: '#3b82f6', bg: '#0d1220', dot: '#3b82f6', label: '● 已完成' },
    };
    const c = colors[s.activity] || colors.ended;
    return `
    <div class="card" style="border-left-color:${c.border};background:${c.bg}">
      <div class="row1">
        <span class="badge" style="color:${c.dot}">${c.label}</span>
        <span class="age">${formatAge(s.ageMs)}</span>
      </div>
      <div class="cwd" title="${s.cwd}">${s.cwd}</div>
      ${s.lastMsg ? `<div class="msg">${s.lastMsg.replace(/</g,'&lt;')}</div>` : ''}
    </div>`;
  };

  const section = (title, items) => items.length === 0 ? '' : `
    <div class="section-label">${title} · ${items.length}</div>
    ${items.map(card).join('')}`;

  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<title>Claude Sessions</title>
<meta http-equiv="refresh" content="3">
<style>
  *{box-sizing:border-box;margin:0;padding:0;-webkit-app-region:drag}
  body{background:#0c0c0c;color:#d4d4d4;font-family:'Segoe UI',system-ui,sans-serif;
       padding:12px;user-select:none;overflow-x:hidden}
  .header{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
  .title{font-size:11px;font-weight:600;color:#555;letter-spacing:.5px}
  .clock{font-size:10px;color:#333}
  .section-label{font-size:9px;text-transform:uppercase;letter-spacing:1.5px;
                  color:#333;margin:12px 0 6px}
  .section-label:first-of-type{margin-top:0}
  .card{border-left:2px solid #333;border-radius:4px;padding:9px 10px;
        margin-bottom:6px;-webkit-app-region:no-drag}
  .row1{display:flex;justify-content:space-between;margin-bottom:5px}
  .badge{font-size:10px;font-weight:600}
  .age{font-size:10px;color:#383838}
  .cwd{font-size:11px;color:#777;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
       margin-bottom:3px}
  .msg{font-size:10px;color:#444;white-space:nowrap;overflow:hidden;
       text-overflow:ellipsis;font-style:italic}
  .empty{font-size:12px;color:#2a2a2a;text-align:center;padding:24px 0}
</style>
</head>
<body>
<div class="header">
  <span class="title">CLAUDE CODE</span>
  <span class="clock">${new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span>
</div>
${section('进行中', active)}
${section('等待输入', waiting)}
${section('已结束', ended)}
${sessions.length === 0 ? '<div class="empty">无活跃 session</div>' : ''}
</body>
</html>`;
}

// --- Server (only when run directly) ---
if (require.main === module) {
  const server = http.createServer((req, res) => {
    if (req.url === '/api') {
      res.writeHead(200, {'Content-Type':'application/json'});
      res.end(JSON.stringify(getSessions(), null, 2));
      return;
    }
    res.writeHead(200, {'Content-Type':'text/html;charset=utf-8'});
    res.end(renderHTML(getSessions()));
  });
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`http://localhost:${PORT}`);
  });
}

module.exports = { getSessions };

#!/usr/bin/env bash
LIVE_FILE="${HOME}/.claude-dashboard/live.json"
mkdir -p "$(dirname "$LIVE_FILE")"

input=$(cat)

session_id=$(echo "$input" | grep -o '"session_id":"[^"]*"' | head -1 | cut -d'"' -f4)
[ -z "$session_id" ] && session_id=$(echo "$input" | grep -o '"sessionId":"[^"]*"' | head -1 | cut -d'"' -f4)
hook_event=$(echo "$input" | grep -o '"hook_event_name":"[^"]*"' | head -1 | cut -d'"' -f4)

[ -z "$session_id" ] && exit 0
[ -f "$LIVE_FILE" ] || echo '{}' > "$LIVE_FILE"

export SESSION_ID="$session_id"
export LIVE_FILE

if [ "$hook_event" = "SessionStart" ]; then
    node -e "
    const fs = require('fs'), f = process.env.LIVE_FILE;
    let d = {}; try { d = JSON.parse(fs.readFileSync(f,'utf8')); } catch {}
    d[process.env.SESSION_ID] = { startedAt: new Date().toISOString() };
    fs.writeFileSync(f, JSON.stringify(d));
    " 2>/dev/null

elif [ "$hook_event" = "SessionEnd" ]; then
    node -e "
    const fs = require('fs'), f = process.env.LIVE_FILE;
    let d = {}; try { d = JSON.parse(fs.readFileSync(f,'utf8')); } catch {}
    delete d[process.env.SESSION_ID];
    fs.writeFileSync(f, JSON.stringify(d));
    " 2>/dev/null
fi

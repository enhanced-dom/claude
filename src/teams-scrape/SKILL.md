---
name: teams-scrape
description: Use when extracting Microsoft Teams chat messages - navigates Teams, captures clipboard, parses to JSON, and persists with deterministic new message detection
argument-hint: "<target-name>"
user-invocable: true
version: 2.0.0
---

# Teams Chat Scraper

Extract chat messages from Microsoft Teams desktop app using `macos-automator` MCP tools and persist with deterministic new message detection.

## When to Use

Invoke this skill when you need to:
- Extract chat history from a Teams DM or channel
- Capture meeting chat content
- Get structured JSON from Teams messages
- Parse reactions, replies, and attachments
- **Track new messages** since last scrape (deterministic by message ID)

## Prerequisites

1. **Microsoft Teams desktop app** must be running
2. **Accessibility permissions** granted to the terminal/Claude Code
3. **macos-automator MCP** available (provides `execute_script` tool)

## Architecture

This skill uses a **two-phase approach**:

1. **Swift scroll tool** (`scroll-teams.swift`) + **AppleScript capture** (via macos-automator MCP) — navigates to the chat, scrolls to load older messages, captures clipboard
2. **TypeScript CLI** — parses clipboard, deduplicates by ID, persists atomically

The CLI handles parsing/storage/diffing; the Swift tool + AppleScript handle UI automation.

## Scroll Tool (`scroll-teams.swift`)

Located at `.claude/skills/teams-scrape/scroll-teams.swift`. Must be compiled once:

```bash
swiftc .claude/skills/teams-scrape/scroll-teams.swift -o /tmp/scroll-teams
```

**Usage:** `./scroll-teams "<chat-name>" <scroll-count>`

| scroll-count | Approximate reach back from today |
|---|---|
| 20 | ~1–2 months |
| 150 | ~6–8 months |
| 220 | ~10–12 months |
| 400 | ~18–24 months |

The tool:
1. Brings Teams to front via AX API (re-activates every 25 events so focus can't drift)
2. Navigates to `<chat-name>` via Cmd+G
3. Clicks at (1420, 450) to anchor focus in the message area
4. Posts `<scroll-count>` upward mouse-wheel events, pausing 3 s every 25 to let Teams lazy-load

> **Note:** Teams has a bounded message buffer (~80–90 KB of text). Scrolling far up causes recent messages to drop off the bottom. To capture a full long chat history, run multiple passes at different scroll depths and merge — the CLI deduplicates by stable message ID.

## Persistence & New Message Detection

Scrape results are saved to `~/.config/teams-scrape/` for tracking changes between runs.

### Storage Location

```
~/.config/teams-scrape/
├── ben-laughlin.json      # Kebab-case filename from target name
├── jay-pancholi.json
└── engineering-standup.json
```

### File Schema

```typescript
interface IStoredChat {
  target: string;           // Original target name
  targetSlug: string;       // Kebab-case filename
  lastScrapedAt: string;    // ISO 8601 timestamp of last scrape
  messageCount: number;     // Total messages stored
  messages: ITeamsMessage[]; // All captured messages (sorted by timestamp)
}

interface ITeamsMessage {
  id: string;               // Stable hash ID for deduplication
  author: string;
  timestamp: string;        // ISO 8601
  content: string;
  replyTo?: { author: string; preview: string };
  reactions?: { emoji: string; count: number; name: string }[];
  attachments?: { type: "gif" | "image" | "file" | "url" | "loop"; name?: string; url?: string }[];
  mentions?: string[];
  edited?: boolean;
}
```

### Deterministic New Message Detection

The CLI uses **stable message IDs** (hash of author + timestamp + content prefix) to detect truly new messages:

1. Parse clipboard into `ITeamsMessage[]` with stable IDs
2. Load existing stored chat (if any)
3. Compare by message ID to find truly new messages
4. Merge (append new only, preserve existing)
5. Save atomically with file locking

This ensures running the same scrape twice reports "0 new messages" - the detection is **deterministic**.

## CLI Usage

The `teams-scrape` CLI provides three commands:

```bash
# Process clipboard (main command)
pbpaste | node --experimental-strip-types .claude/skills/teams-scrape/cli.ts process "Ben Laughlin"

# Load existing history (read-only)
node --experimental-strip-types .claude/skills/teams-scrape/cli.ts load "Ben Laughlin"

# List all stored chats
node --experimental-strip-types .claude/skills/teams-scrape/cli.ts list
```

### CLI Output (process command)

```json
{
  "target": "Ben Laughlin",
  "capturedAt": "2026-01-20T10:00:00.000Z",
  "isNewScrape": false,
  "totalMessages": 31,
  "newMessages": [
    {
      "id": "abc123def456",
      "author": "Ben Laughlin",
      "timestamp": "2026-01-20T09:15:00.000Z",
      "content": "Hey, did you see the PR?"
    }
  ],
  "storagePath": "/Users/nathan/.config/teams-scrape/ben-laughlin.json"
}
```

## Workflow

### Step 1: Compile the scroll tool (once)

```bash
swiftc .claude/skills/teams-scrape/scroll-teams.swift -o /tmp/scroll-teams
```

### Step 2: Scroll to load messages, then capture

Run the Swift tool via `macos-automator` (auto-approved, no dialog interruptions).
Choose `<scroll-count>` based on how far back you need to go (see table above).

**MCP call:**
```json
{
  "tool": "mcp__macos_automator__execute_script",
  "arguments": {
    "script_content": "do shell script \"/tmp/scroll-teams 'Jay Pancholi' 150\"",
    "timeout_seconds": 300
  }
}
```

After the scroll completes, capture the clipboard:

```json
{
  "tool": "mcp__macos_automator__execute_script",
  "arguments": {
    "script_content": "tell application \"System Events\"\n  set frontmost of process \"MSTeams\" to true\nend tell\ndelay 0.3\ntell application \"System Events\"\n  tell process \"MSTeams\"\n    key code 53\n    delay 0.3\n    keystroke \"a\" using command down\n    delay 0.8\n    keystroke \"c\" using command down\n    delay 1.0\n  end tell\nend tell\ndo shell script \"pbpaste | wc -c\"",
    "timeout_seconds": 10
  }
}
```

> **Always** call `set frontmost of process "MSTeams" to true` before any keystroke/capture so that focus is on Teams, not the Claude chat.

### Step 3: Parse the Clipboard Content

Parse the raw text into structured JSON. See format documentation below.

---

## Teams Clipboard Format

Teams uses a specific text format when copying chat content. For detailed parsing patterns, see [FORMAT.md](FORMAT.md).

**Key patterns:**
- Messages: `AuthorName\nDD/MM/YYYY H:MM am/pm\nContent`
- Replies: `Begin Reference...End Reference` blocks
- Reactions: `emoji\nN emoji-name reactions.`
- Attachments: `(GIF Image)`, `(Image)`, `has an attachment:`, `Url Preview for`, `Loop Component`
- Mentions: Inline names or `Everyone`
- Edited: `Edited.` suffix

---

## Output Schema

Return parsed messages as JSON:

```typescript
interface ITeamsMessage {
  author: string;
  timestamp: string;          // ISO 8601 format
  content: string;
  replyTo?: {
    author: string;
    preview: string;
  };
  reactions?: {
    emoji: string;
    count: number;
    name: string;
  }[];
  attachments?: {
    type: "gif" | "image" | "file" | "url" | "loop";
    name?: string;
    url?: string;
  }[];
  mentions?: string[];
  edited?: boolean;
}

interface ITeamsChat {
  target: string;             // Channel or person name
  capturedAt: string;         // ISO 8601 timestamp
  messageCount: number;
  messages: ITeamsMessage[];
}
```

**Example output:**

```json
{
  "target": "Jay Pancholi",
  "capturedAt": "2025-01-20T14:30:00.000Z",
  "messageCount": 2,
  "messages": [
    {
      "author": "Jay Pancholi",
      "timestamp": "2025-01-15T14:34:00.000Z",
      "content": "Hey Nathan, just checking in on the project status.\nLet me know when you have a moment.",
      "reactions": [
        { "emoji": "👍", "count": 1, "name": "like" }
      ]
    },
    {
      "author": "Nathan Vale",
      "timestamp": "2025-01-15T14:45:00.000Z",
      "content": "All good! I'll have the update ready by EOD.",
      "replyTo": {
        "author": "Jay Pancholi",
        "preview": "Hey Nathan, just checking in on the project status."
      }
    }
  ]
}
```

---

## Error Handling

### Teams Not Running

If Teams is not running, the AppleScript will fail. Check first:

```applescript
tell application "System Events"
    set isRunning to (name of processes) contains "Microsoft Teams"
end tell
return isRunning
```

### Target Not Found

If Cmd+G search doesn't find the target:
- The script will timeout waiting for navigation
- Suggest verifying the exact name/channel exists
- Consider partial matches or typos

### Accessibility Permissions

If keystrokes don't work:
- Check System Preferences → Security & Privacy → Privacy → Accessibility
- Ensure terminal app has permission granted

### Empty Clipboard

If clipboard is empty after capture:
- Teams window may not have focus
- Chat area may not be selected
- Try the Escape → Cmd+A → Cmd+C sequence again

---

## Complete Example

**User request:** "Scrape my chat with Jay Pancholi from Teams"

**Workflow:**

1. Compile the scroll tool (if not already built)
2. Run scroll tool via macos-automator — navigates to chat and scrolls up to load history
3. Capture clipboard via macos-automator (always activate Teams first)
4. Pipe clipboard to CLI for parsing and persistence

**Step 1: Compile**

```bash
swiftc .claude/skills/teams-scrape/scroll-teams.swift -o /tmp/scroll-teams
```

**Step 2: Scroll (MCP call)**

```json
{
  "tool": "mcp__macos_automator__execute_script",
  "arguments": {
    "script_content": "do shell script \"/tmp/scroll-teams 'Jay Pancholi' 150\"",
    "timeout_seconds": 300
  }
}
```

**Step 3: Capture (MCP call)**

```json
{
  "tool": "mcp__macos_automator__execute_script",
  "arguments": {
    "script_content": "tell application \"System Events\"\n  set frontmost of process \"MSTeams\" to true\nend tell\ndelay 0.3\ntell application \"System Events\"\n  tell process \"MSTeams\"\n    key code 53\n    delay 0.3\n    keystroke \"a\" using command down\n    delay 0.8\n    keystroke \"c\" using command down\n    delay 1.0\n  end tell\nend tell",
    "timeout_seconds": 10
  }
}
```

**Step 4: Process with CLI**

```bash
pbpaste | node --experimental-strip-types .claude/skills/teams-scrape/cli.ts process "Jay Pancholi"
```

**Expected output:**

```json
{
  "target": "Jay Pancholi",
  "capturedAt": "2026-01-20T14:30:00.000Z",
  "isNewScrape": false,
  "totalMessages": 45,
  "newMessages": [
    {
      "id": "a1b2c3d4e5f6",
      "author": "Jay Pancholi",
      "timestamp": "2026-01-20T14:25:00.000Z",
      "content": "The PR is ready for review"
    }
  ],
  "storagePath": "/Users/nathan/.config/teams-scrape/jay-pancholi.json"
}
```

---

## Tips

- **Increase delays** if Teams is slow to respond (especially on first navigation)
- **Verify target name** matches exactly what appears in Teams search
- **AU date format**: The parser handles DD/MM/YYYY H:MM am/pm automatically
- **Deterministic detection**: Same scrape twice = 0 new messages (deduplication by ID)
- **Atomic writes**: CLI uses file locking for concurrent safety
- **Filename convention**: Target names are auto-converted to kebab-case
- **Logs**: Check `~/.claude/logs/teams-scrape.jsonl` for debugging

## Observability

- **Logs**: JSONL format at `~/.claude/logs/teams-scrape.jsonl`
- **Correlation IDs**: Each CLI invocation gets a unique correlation ID for tracing
- **Timing**: All operations are logged with duration in milliseconds
- **Error categorization**: Errors are classified as transient/permanent/configuration

#!/usr/bin/env node
// teams-scrape CLI
// Usage: pbpaste | node --experimental-strip-types plugins/teams-scrape/src/cli.ts process "Target Name"
//        node --experimental-strip-types plugins/teams-scrape/src/cli.ts load "Target Name"
//        node --experimental-strip-types plugins/teams-scrape/src/cli.ts list

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

// ─────────────────────────────── Types ───────────────────────────────

interface ITeamsMessage {
  id: string
  author: string
  timestamp: string
  content: string
  replyTo?: { author: string; preview: string }
  reactions?: { emoji: string; count: number; name: string }[]
  attachments?: { type: 'gif' | 'image' | 'file' | 'url' | 'loop'; name?: string; url?: string }[]
  mentions?: string[]
  edited?: boolean
}

interface IStoredChat {
  target: string
  targetSlug: string
  lastScrapedAt: string
  messageCount: number
  messages: ITeamsMessage[]
}

interface IProcessResult {
  target: string
  capturedAt: string
  isNewScrape: boolean
  totalMessages: number
  newMessages: ITeamsMessage[]
  storagePath: string
}

// ─────────────────────────────── Config ───────────────────────────────

const STORAGE_DIR = process.env.TEAMS_SCRAPE_DIR ?? join(homedir(), '.config', 'teams-scrape')

// ─────────────────────────────── Utils ───────────────────────────────

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function generateId(author: string, timestamp: string, content: string): string {
  return createHash('sha256')
    .update(`${author}|${timestamp}|${content.slice(0, 50)}`)
    .digest('hex')
    .slice(0, 12)
}

// ─────────────────────────────── Parser ───────────────────────────────

// DD/MM HH:MM or DD/MM H:MM am/pm  (no year — current year assumed)
const RX_SHORT_TS = /^\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}(?:\s*(?:am|pm))?$/i
// DD/MM/YYYY HH:MM or DD/MM/YYYY H:MM am/pm
const RX_FULL_TS = /^\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}(?:\s*(?:am|pm))?$/i
const RX_REACTION = /^(\d+)\s+(\w+)\s+reactions?\.$/i
// Sidebar preview lines: truncated ("... by Author") or short ("msg by Author")
const RX_SIDEBAR = / by [A-Z]/

const UI_CHROME = new Set([
  'Has context menu',
  'Chat',
  'Message List',
  'Shared',
  'Private',
  'Muted',
  'Draft',
  'See more',
  'Community',
  'Temporarily shown',
  'Badged chats',
  'Badged chat',
  'Teams and channels',
  'Meet now',
  'Personal at mention',
  'Everyone at mention',
  'Important',
  'Urgent',
  'Last message',
  'Group chat',
  'Meeting chat',
  'Unread',
  'Loop Component',
  'CommunityTemporarily shown',
])

function isChrome(line: string): boolean {
  const t = line.trim()
  return (
    UI_CHROME.has(t) ||
    t.startsWith('Unread') ||
    t.startsWith('Channel') ||
    t.startsWith('Has pinned') ||
    t.startsWith("You can't send") ||
    t.startsWith('You cannot send') ||
    t.includes('is out of office and may not respond')
  )
}

function parseTs(line: string): string | null {
  const t = line.trim()
  const m = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s+(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/i)
  if (!m) return null
  const [, day, month, year, hh, mm, ampm] = m
  if (!day || !month || !hh || !mm) return null
  let h = parseInt(hh)
  if (ampm?.toLowerCase() === 'pm' && h < 12) h += 12
  if (ampm?.toLowerCase() === 'am' && h === 12) h = 0
  const y = year ? parseInt(year) : new Date().getFullYear()
  return new Date(y, parseInt(month) - 1, parseInt(day), h, parseInt(mm)).toISOString()
}

function parseContent(lines: string[]): {
  content: string
  reactions: { emoji: string; count: number; name: string }[]
  attachments: { type: 'gif' | 'image' | 'file' | 'url' | 'loop'; name?: string; url?: string }[]
  edited: boolean
  mentions: string[]
} {
  const reactions: { emoji: string; count: number; name: string }[] = []
  const attachments: { type: 'gif' | 'image' | 'file' | 'url' | 'loop'; name?: string; url?: string }[] = []
  let edited = false
  const contentLines: string[] = []
  let pendingEmoji: string | null = null

  for (const line of lines) {
    const t = line.trim()

    if (!t) {
      pendingEmoji = null
      contentLines.push('')
      continue
    }

    // Skip sidebar preview lines and UI chrome
    if (RX_SIDEBAR.test(t) || t.startsWith('Begin quote,') || t.startsWith('Begin Reference')) {
      pendingEmoji = null
      continue
    }
    if (isChrome(t)) {
      pendingEmoji = null
      continue
    }

    // Reaction count line
    const rxm = RX_REACTION.exec(t)
    if (rxm?.[1] && rxm[2]) {
      reactions.push({ emoji: pendingEmoji ?? '👍', count: parseInt(rxm[1]), name: rxm[2].toLowerCase() })
      pendingEmoji = null
      continue
    }

    // File attachment
    const fa = /^has an attachment:\s*(.+)$/i.exec(t)
    if (fa?.[1]) {
      attachments.push({ type: 'file', name: fa[1].trim() })
      pendingEmoji = null
      continue
    }

    // URL preview
    const ua = /^Url Preview for\s+(.+)$/i.exec(t)
    if (ua?.[1]) {
      attachments.push({ type: 'url', url: ua[1].trim() })
      pendingEmoji = null
      continue
    }

    // Image / GIF
    if (/^\(GIF Image\)$/i.test(t)) {
      attachments.push({ type: 'gif' })
      pendingEmoji = null
      continue
    }
    if (/^\(Image\)$/i.test(t) || t === 'image') {
      attachments.push({ type: 'image' })
      pendingEmoji = null
      continue
    }

    // Edited flag
    if (t === 'Edited.') {
      edited = true
      pendingEmoji = null
      continue
    }

    // Standalone emoji (signals an upcoming reaction count line)
    if (t.length <= 4 && !/[a-zA-Z0-9]/.test(t) && /\S/.test(t)) {
      pendingEmoji = t
      continue
    }

    pendingEmoji = null
    contentLines.push(line)
  }

  const content = contentLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  const mentions: string[] = content.includes('Everyone') ? ['Everyone'] : []
  return { content, reactions, attachments, edited, mentions }
}

// Heuristic: does a string look like a person's name rather than message content?
// Used to detect Format 3 (FULL_TS\nAuthor) boundaries for old messages.
function looksLikeName(s: string): boolean {
  if (!s || s.length > 60) return false
  if (!/^[A-Z]/.test(s)) return false // names start with capital
  if (/[?!,]/.test(s)) return false // message content typically has these
  if (/https?:\/\//.test(s)) return false
  if (!s.includes(' ')) return false // at least first + last name
  return true
}

function parseTeamsClipboard(raw: string): ITeamsMessage[] {
  const lines = raw.split('\n').map((l) => l.trimEnd())

  // Three boundary formats Teams uses:
  // F1: lines[i]=author,   lines[i+1]=SHORT_TS  — current-year messages (any user)
  // F2: lines[i]=author,   lines[i+1]=FULL_TS   — prev-year messages, non-current-user
  // F3: lines[i]=FULL_TS,  lines[i+1]=author    — prev-year messages, current user (reversed header)
  type IBdry = { index: number; authorLine: number; tsLine: number }
  const bdList: IBdry[] = []

  for (let i = 0; i < lines.length - 1; i++) {
    const lineAt = lines[i]
    const nextLineAt = lines[i + 1]
    if (lineAt === undefined || nextLineAt === undefined) continue
    const t = lineAt.trim()
    const next = nextLineAt.trim()

    // ── Format 1: Author + SHORT_TS ──────────────────────────────────────
    if (RX_SHORT_TS.test(next)) {
      if (!t) continue
      if (RX_SHORT_TS.test(t) || RX_FULL_TS.test(t)) continue
      if (RX_REACTION.test(t)) continue
      if (isChrome(t)) continue
      if (RX_SIDEBAR.test(t) || t.startsWith('Begin quote,') || t.startsWith('Begin Reference')) continue
      if (i > 0) {
        const prevShort = lines[i - 1]
        if (prevShort !== undefined && RX_FULL_TS.test(prevShort.trim())) continue
      }
      bdList.push({ index: i, authorLine: i, tsLine: i + 1 })
      continue
    }

    // ── Format 2: Author + FULL_TS ───────────────────────────────────────
    // Distinguished from in-body quote blocks (which have the same Author\nFULL_TS
    // pattern) by requiring a non-empty prev line — quote blocks always follow an
    // empty line in old-format messages.
    if (RX_FULL_TS.test(next)) {
      if (!t) continue
      if (RX_SHORT_TS.test(t) || RX_FULL_TS.test(t)) continue
      if (RX_REACTION.test(t)) continue
      if (isChrome(t)) continue
      if (RX_SIDEBAR.test(t) || t.startsWith('Begin quote,') || t.startsWith('Begin Reference')) continue
      if (i === 0) continue
      const prevLine = lines[i - 1]
      if (prevLine === undefined) continue
      const prev = prevLine.trim()
      // Empty/timestamp prev → inside a message body (quote block), not a top-level boundary
      if (!prev || RX_SHORT_TS.test(prev) || RX_FULL_TS.test(prev)) continue
      if (isChrome(prev)) continue
      bdList.push({ index: i, authorLine: i, tsLine: i + 1 })
      continue
    }

    // ── Format 3: FULL_TS + Author (reversed header for current user, prev year) ─
    // ── Format 4: SHORT_TS + Author (reversed header for current user, curr year) ─
    // Both require the sidebar preview immediately before the timestamp line to
    // distinguish them from timestamps that appear inside message bodies/quote blocks.
    if (RX_FULL_TS.test(t) || RX_SHORT_TS.test(t)) {
      if (!looksLikeName(next)) continue
      if (RX_REACTION.test(next)) continue
      if (isChrome(next)) continue
      if (RX_SIDEBAR.test(next) || next.startsWith('Begin quote,') || next.startsWith('Begin Reference')) continue
      if (i === 0) continue
      const prevTsLine = lines[i - 1]
      if (prevTsLine === undefined) continue
      const prevTs = prevTsLine.trim()
      // Sidebar must immediately precede the timestamp (strict guard vs. in-body timestamps)
      if (!RX_SIDEBAR.test(prevTs) && !prevTs.startsWith('Begin quote,')) continue
      bdList.push({ index: i, authorLine: i + 1, tsLine: i })
      continue
    }
  }

  // Sort by position (each format's loop may interleave) and deduplicate
  bdList.sort((a, b) => a.index - b.index)
  const boundaries = bdList.filter((b, i) => {
    if (i === 0) return true
    const prevBoundary = bdList[i - 1]
    return prevBoundary === undefined || b.index !== prevBoundary.index
  })

  const messages: ITeamsMessage[] = []

  for (let b = 0; b < boundaries.length; b++) {
    const boundary = boundaries[b]
    if (!boundary) continue
    const { authorLine, tsLine } = boundary
    const nextBoundary = boundaries[b + 1]
    const end = nextBoundary ? nextBoundary.index : lines.length

    const authorLineAt = lines[authorLine]
    const tsLineAt = lines[tsLine]
    if (authorLineAt === undefined || tsLineAt === undefined) continue
    const author = authorLineAt.trim()
    const ts = parseTs(tsLineAt)
    if (!ts || !author) continue

    // Body starts after whichever of author/ts lines comes last
    const body = lines.slice(Math.max(authorLine, tsLine) + 1, end)

    // Quote detection: skip leading empty lines then look for QuotedAuthor + FULL_TS
    let qOff = 0
    while (qOff < body.length && !body[qOff]?.trim()) qOff++

    let replyTo: { author: string; preview: string } | undefined
    let contentStart = qOff

    const qaLine = body[qOff]
    const qtsLine = body[qOff + 1]
    if (qOff + 1 < body.length && qaLine !== undefined && qtsLine !== undefined) {
      const qa = qaLine.trim()
      const qts = qtsLine.trim()
      if (RX_FULL_TS.test(qts) && qa && !RX_SHORT_TS.test(qa) && !RX_FULL_TS.test(qa) && !isChrome(qa) && !qa.startsWith('Begin')) {
        const preview = body.slice(qOff + 2).find((l) => l.trim()) ?? ''
        replyTo = { author: qa, preview: preview.trim().slice(0, 200) }
        contentStart = qOff + 2
      }
    }

    const { content, reactions, attachments, edited, mentions } = parseContent(body.slice(contentStart))
    if (!content && !attachments.length) continue

    const id = generateId(author, ts, content)
    const msg: ITeamsMessage = { id, author, timestamp: ts, content }
    if (replyTo) msg.replyTo = replyTo
    if (reactions.length) msg.reactions = reactions
    if (attachments.length) msg.attachments = attachments
    if (edited) msg.edited = true
    if (mentions.length) msg.mentions = [...new Set(mentions)]

    messages.push(msg)
  }

  return messages
}

// ─────────────────────────────── Storage ───────────────────────────────

function loadChat(slug: string): IStoredChat | null {
  const p = join(STORAGE_DIR, `${slug}.json`)
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as IStoredChat
  } catch {
    return null
  }
}

function saveChat(chat: IStoredChat): void {
  mkdirSync(STORAGE_DIR, { recursive: true })
  writeFileSync(join(STORAGE_DIR, `${chat.targetSlug}.json`), JSON.stringify(chat, null, 2), 'utf8')
}

// ─────────────────────────────── Commands ───────────────────────────────

function cmdProcess(target: string, input: string): void {
  const slug = toSlug(target)
  const parsed = parseTeamsClipboard(input)
  const stored = loadChat(slug)
  const existing = stored?.messages ?? []

  const existingIds = new Set(existing.map((m) => m.id))
  const newMessages = parsed.filter((m) => !existingIds.has(m.id))
  const merged = [...existing, ...newMessages].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

  const chat: IStoredChat = {
    target,
    targetSlug: slug,
    lastScrapedAt: new Date().toISOString(),
    messageCount: merged.length,
    messages: merged,
  }
  saveChat(chat)

  const result: IProcessResult = {
    target,
    capturedAt: chat.lastScrapedAt,
    isNewScrape: !stored,
    totalMessages: merged.length,
    newMessages,
    storagePath: join(STORAGE_DIR, `${slug}.json`),
  }
  console.log(JSON.stringify(result, null, 2))
}

function cmdLoad(target: string): void {
  const chat = loadChat(toSlug(target))
  if (!chat) {
    console.error(JSON.stringify({ error: `No stored chat for "${target}"` }))
    process.exit(1)
  }
  console.log(JSON.stringify(chat, null, 2))
}

function cmdList(): void {
  if (!existsSync(STORAGE_DIR)) {
    console.log('[]')
    return
  }
  const items = readdirSync(STORAGE_DIR)
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => {
      try {
        const c = JSON.parse(readFileSync(join(STORAGE_DIR, f), 'utf8')) as IStoredChat
        return [{ target: c.target, targetSlug: c.targetSlug, messageCount: c.messageCount, lastScrapedAt: c.lastScrapedAt }]
      } catch {
        return []
      }
    })
  console.log(JSON.stringify(items, null, 2))
}

// ─────────────────────────────── Main ───────────────────────────────

const [, , cmd, ...rest] = process.argv
const target = rest.join(' ')

switch (cmd) {
  case 'process':
    if (!target) {
      console.error('Usage: cli.ts process "Target Name"')
      process.exit(1)
    }
    cmdProcess(target, readFileSync(0, 'utf8'))
    break
  case 'load':
    if (!target) {
      console.error('Usage: cli.ts load "Target Name"')
      process.exit(1)
    }
    cmdLoad(target)
    break
  case 'list':
    cmdList()
    break
  default:
    console.error('Commands: process <target>, load <target>, list')
    process.exit(1)
}

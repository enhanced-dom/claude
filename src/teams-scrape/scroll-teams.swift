// scroll-teams.swift — scroll a Teams chat to load older messages
// Usage: scroll-teams <chat-name> <scroll-count>
//   chat-name    Name to search for via Cmd+G (e.g. "Les PMs")
//   scroll-count Number of scroll-up events (e.g. 150). Each 25 events pauses
//                3 s so Teams can lazy-load older messages.
//
// Build:  swiftc scroll-teams.swift -o scroll-teams
// Run:    ./scroll-teams "Les PMs" 220

import Cocoa
import ApplicationServices

// ── Args ──────────────────────────────────────────────────────────────────────

guard CommandLine.arguments.count == 3,
      let scrollCount = Int(CommandLine.arguments[2]), scrollCount > 0
else {
    fputs("Usage: scroll-teams <chat-name> <scroll-count>\n", stderr)
    exit(1)
}

let chatName    = CommandLine.arguments[1]
let scrollPos   = CGPoint(x: 1420, y: 450)

// ── Find MSTeams process ──────────────────────────────────────────────────────

let apps = NSWorkspace.shared.runningApplications
guard let teams = apps.first(where: {
    $0.localizedName == "Microsoft Teams" || $0.bundleIdentifier?.contains("teams") == true
}) else {
    fputs("MSTeams is not running\n", stderr)
    exit(1)
}

let teamsAX = AXUIElementCreateApplication(teams.processIdentifier)

// ── Helpers ───────────────────────────────────────────────────────────────────

func isTeamsFront() -> Bool {
    NSWorkspace.shared.frontmostApplication?.processIdentifier == teams.processIdentifier
}

func bringTeamsFront() {
    AXUIElementSetAttributeValue(teamsAX, kAXFrontmostAttribute as CFString, kCFBooleanTrue)
    let mv = CGEvent(mouseEventSource: nil, mouseType: .mouseMoved,
                     mouseCursorPosition: scrollPos, mouseButton: .left)!
    mv.post(tap: .cghidEventTap)
    Thread.sleep(forTimeInterval: 0.2)
}

func ensureTeamsFront(at i: Int) {
    guard !isTeamsFront() else { return }
    fputs("  [scroll \(i)] Teams lost focus — re-activating\n", stderr)
    bringTeamsFront()
    Thread.sleep(forTimeInterval: 0.5)
}

func typeString(_ s: String) {
    for ch in s.unicodeScalars {
        guard let src = CGEventSource(stateID: .hidSystemState) else { continue }
        if let dn = CGEvent(keyboardEventSource: src, virtualKey: 0, keyDown: true),
           let up = CGEvent(keyboardEventSource: src, virtualKey: 0, keyDown: false) {
            var scalar = UniChar(ch.value & 0xFFFF)
            dn.keyboardSetUnicodeString(stringLength: 1, unicodeString: &scalar)
            up.keyboardSetUnicodeString(stringLength: 1, unicodeString: &scalar)
            dn.post(tap: .cghidEventTap)
            up.post(tap: .cghidEventTap)
        }
    }
}

func pressKey(_ keyCode: CGKeyCode, modifiers: CGEventFlags = []) {
    guard let src = CGEventSource(stateID: .hidSystemState),
          let dn  = CGEvent(keyboardEventSource: src, virtualKey: keyCode, keyDown: true),
          let up  = CGEvent(keyboardEventSource: src, virtualKey: keyCode, keyDown: false)
    else { return }
    dn.flags = modifiers
    dn.post(tap: .cghidEventTap)
    up.post(tap: .cghidEventTap)
}

// ── Step 1: Navigate to the target chat via Cmd+G ────────────────────────────

bringTeamsFront()
Thread.sleep(forTimeInterval: 0.5)

pressKey(5, modifiers: .maskCommand)   // Cmd+G  (key 5 = 'g')
Thread.sleep(forTimeInterval: 1.0)
typeString(chatName)
Thread.sleep(forTimeInterval: 1.5)
pressKey(36)                            // Return
Thread.sleep(forTimeInterval: 3.0)

// ── Step 2: Click in message area to anchor focus ─────────────────────────────

bringTeamsFront()
Thread.sleep(forTimeInterval: 0.2)
let dn = CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown,
                 mouseCursorPosition: scrollPos, mouseButton: .left)!
let up = CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp,
                 mouseCursorPosition: scrollPos, mouseButton: .left)!
dn.post(tap: .cghidEventTap); Thread.sleep(forTimeInterval: 0.1)
up.post(tap: .cghidEventTap); Thread.sleep(forTimeInterval: 0.5)

// ── Step 3: Global Escape listener — press Escape to stop ────────────────────

var shouldStop = false

let eventMask = CGEventMask(1 << CGEventType.keyDown.rawValue)
if let tap = CGEvent.tapCreate(
    tap: .cgSessionEventTap, place: .headInsertEventTap, options: .listenOnly,
    eventsOfInterest: eventMask,
    callback: { _, _, event, _ in
        if event.getIntegerValueField(.keyboardEventKeycode) == 53 {  // Escape
            shouldStop = true
        }
        return Unmanaged.passRetained(event)
    }, userInfo: nil
) {
    let src = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
    CFRunLoopAddSource(CFRunLoopGetMain(), src, .commonModes)
    CGEvent.tapEnable(tap: tap, enable: true)
    fputs("press Escape at any time to stop\n", stderr)
} else {
    fputs("warning: could not create event tap (grant Accessibility permission for Escape key support)\n", stderr)
}

// ── Step 4: Scroll up — check Teams is frontmost before every event ───────────

var scrolled = 0
for i in 0..<scrollCount {
    RunLoop.main.run(until: Date())   // drain run loop so the event tap can fire

    if shouldStop {
        fputs("stopped at scroll \(i) (Escape pressed)\n", stderr)
        break
    }

    if i % 25 == 0 {
        bringTeamsFront()
        Thread.sleep(forTimeInterval: 3.0)
    } else {
        ensureTeamsFront(at: i)
    }

    let ev = CGEvent(scrollWheelEvent2Source: nil, units: .line,
                     wheelCount: 1, wheel1: 8, wheel2: 0, wheel3: 0)!
    ev.post(tap: .cghidEventTap)
    Thread.sleep(forTimeInterval: 0.05)
    scrolled += 1
}

print("done: scrolled \(scrolled) times in \"\(chatName)\"")

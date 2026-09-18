---
name: BMad Chat UI
description: Local web chat app for talking to BMad AI personas, one room per project. Developer-terminal coded — phosphor-CRT heritage — but built for chat-app friendliness, not terminal starkness.
colors:
  surface-base: '#F4F6F4'
  surface-raised: '#FFFFFF'
  text-primary: '#14201A'
  text-muted: '#5C6B62'
  primary: '#1F7A4D'
  primary-foreground: '#FFFFFF'
  accent: '#0F8F5C'
  border: '#D6DED8'
  tool-card-bg: '#EEF6F0'
  tool-card-border: '#BFE0C9'
  surface-base-dark: '#0C1210'
  surface-raised-dark: '#121B17'
  text-primary-dark: '#D9F2E4'
  text-muted-dark: '#7FA08E'
  primary-dark: '#34D399'
  primary-foreground-dark: '#04120B'
  accent-dark: '#4ADE80'
  border-dark: '#1F2E27'
  tool-card-bg-dark: '#0F1C16'
  tool-card-border-dark: '#22402F'
typography:
  body:
    fontFamily: 'Inter, system-ui, sans-serif'
    fontSize: 15px
    fontWeight: '400'
    lineHeight: '1.5'
  meta:
    fontFamily: 'Inter, system-ui, sans-serif'
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.4'
  display-sm:
    fontFamily: 'Inter, system-ui, sans-serif'
    fontSize: 15px
    fontWeight: '600'
    lineHeight: '1.3'
  mono:
    fontFamily: "'JetBrains Mono', ui-monospace, 'SFMono-Regular', monospace"
    fontSize: 13px
    fontWeight: '400'
    lineHeight: '1.5'
rounded:
  sm: 6px
  md: 10px
  lg: 14px
  full: 9999px
spacing:
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '5': 24px
  '6': 32px
components:
  project-rail-icon:
    size: 40px
    radius: '{rounded.md}'
    activeIndicator: '{colors.accent}'
  message-bubble:
    background: '{colors.surface-raised}'
    radius: '{rounded.md}'
    padding: '{spacing.3} {spacing.4}'
    font: '{typography.body}'
  tool-card:
    background: '{colors.tool-card-bg}'
    border: '1px solid {colors.tool-card-border}'
    radius: '{rounded.sm}'
    font: '{typography.mono}'
    padding: '{spacing.2} {spacing.3}'
  status-dot-working:
    color: '{colors.accent}'
    size: 8px
  status-dot-idle:
    color: '{colors.text-muted}'
    size: 8px
  button-primary:
    background: '{colors.primary}'
    foreground: '{colors.primary-foreground}'
    radius: '{rounded.sm}'
  button-stop:
    background: 'transparent'
    border: '1px solid {colors.border}'
    foreground: '{colors.text-primary}'
    radius: '{rounded.sm}'
  system-message:
    foreground: '{colors.text-muted}'
    font: '{typography.meta}'
---

## Brand & Style

BMad Chat UI wears its origin openly: a real Claude Code CLI process runs underneath every conversation, and the visual language says so without turning the whole app into a terminal emulator. Phosphor-green accents, a mono type for anything that's literally a tool call or system event, generous chat-bubble spacing everywhere else. The posture is "a developer's chat app," not "a chat skin bolted onto xterm" — Slack-familiar layout, terminal-flavored detailing.

## Colors

- **Surface (`#F4F6F4` light / `#0C1210` dark)** is the app canvas — a cool, slightly desaturated ground so the green accents read as signal, not decoration.
- **Primary (`#1F7A4D` light / `#34D399` dark)** marks personas, active state, and primary actions — persona avatars, the active project-rail icon, primary buttons.
- **Accent (`#0F8F5C` light / `#4ADE80` dark)** is reserved for "something is happening" — the working-status dot, streaming-response indicators. Never used for static decoration.
- **Tool-card surface (`#EEF6F0` light / `#0F1C16` dark)** sets tool-call and subagent cards apart from ordinary chat bubbles at a glance, without needing an icon to say "this is different."
- **Border (`#D6DED8` light / `#1F2E27` dark)** is the only divider weight in the system — hairline, never a heavier rule.

Avoid: red/amber status colors for anything other than an actual error or a stopped/failed turn — the palette otherwise stays in the green family so a red status reads unambiguously as "something needs you."

## Typography

Three roles cover the whole surface: `body` for chat content and persona messages, `meta` for timestamps/presence/system copy, `mono` for anything that is literally a tool call, file path, or command — this is the one place terminal heritage shows up directly in type. `display-sm` covers persona names in thread headers; nothing larger is needed — this app has no marketing surface.

## Layout & Spacing

Scale: 4 / 8 / 12 / 16 / 24 / 32px. Three-column desktop-width layout: project rail (fixed, icon-only) · persona/channel list (fixed sidebar) · active thread (fluid). Message bubbles use `{spacing.3}`/`{spacing.4}` padding; the largest gap (`{spacing.6}`) separates the composer from the last message so sending never feels cramped.

## Elevation & Depth

No drop shadows. Tool cards and system messages differentiate by fill color and a hairline border, not elevation — this keeps a long-running thread with many tool calls from turning into a stack of floating panels.

## Shapes

`{rounded.sm}` (6px) for tool cards, buttons, and inputs. `{rounded.md}` (10px) for message bubbles and the project-rail icons. `{rounded.full}` reserved for presence/status dots only. Nothing else goes fully rounded — the terminal heritage reads better with square-ish edges than with pill shapes.

## Components

- **Project-rail icon** — 40px square, `{rounded.md}`. Active project gets an `{colors.accent}` left-edge indicator, matching Slack's workspace-switcher active state.
- **Message bubble** — `{colors.surface-raised}`, `{rounded.md}`, persona avatar + name in `{typography.display-sm}` above the bubble.
- **Tool card** — collapsible, `{colors.tool-card-bg}` fill, `{typography.mono}` for the summary line (e.g. `Editing src/api/auth.ts`), chevron to expand full detail. Nests inside the thread at the point the tool call happened, not floated elsewhere.
- **Status dot** — 8px, `{colors.accent}` while a persona is actively working, `{colors.text-muted}` when idle.
- **Stop button** — outline style (`button-stop`), appears only while a turn is running; disappears once the persona finishes or is stopped.
- **System message** — `{typography.meta}`, `{colors.text-muted}`, no bubble/card chrome — reads as ambient status (routing, sync), not as a chat participant.

## Do's and Don'ts

| Do | Don't |
|---|---|
| Use `{typography.mono}` only for genuine tool-call/system content | Set persona chat copy in mono — personas talk like people, not terminals |
| Differentiate tool cards by fill + hairline border | Add drop shadows or elevation to signal hierarchy |
| Keep the accent green reserved for "in progress" | Reuse accent green as a generic decorative color |
| One status dot color for working, one (muted) for idle | Invent a traffic-light system beyond working/idle/stopped |
| Square-ish corners (`sm`/`md`) everywhere except status dots | Use pill-shaped buttons or fully rounded cards |

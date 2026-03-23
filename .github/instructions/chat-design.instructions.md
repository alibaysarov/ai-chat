---
description: "Use when designing chat pages, conversation layouts, sidebars, message lists, prompt composers, empty states, and chat-specific UI in apps/client. Inspired by proven product patterns seen in ChatGPT and Claude: calm surfaces, persistent composer, strong reading flow, clear streaming states, and low-friction navigation."
applyTo: "apps/client/**"
---

# Chat UI Design Guidelines

## Design Direction

- Take cues from product qualities commonly seen in ChatGPT and Claude, but do not clone their UI literally.
- Prefer a calm, focused workspace: low-noise chrome, generous spacing, strong text readability, and clear separation between navigation and conversation content.
- The interface should feel like a writing and thinking surface first, not a dashboard.
- Prioritize clarity of conversation flow over decorative complexity.

## Core Layout

- Use a two-zone or three-zone chat layout depending on screen size:
  - navigation/sidebar for conversations, history, and secondary actions
  - main conversation pane for messages and streaming output
  - optional contextual side panel for settings, artifacts, or details on large screens only
- Keep the message column readable with a constrained max width; do not stretch chat text edge-to-edge on large displays.
- The input composer must remain persistent and easy to reach at the bottom of the viewport.
- On mobile and tablet, collapse secondary navigation into drawers, sheets, or segmented views instead of shrinking everything into one crowded canvas.

## Conversation Experience

- Messages should read like a continuous document: stable spacing, clear role distinction, consistent content width, and minimal visual clutter.
- Group consecutive messages by sender when appropriate to reduce repetition.
- Preserve a visible distinction between user and assistant messages using surface tone, spacing, avatar treatment, alignment, or role labels — never rely on color alone.
- Streaming responses must feel alive but calm: show a cursor, subtle progress state, and stable layout while content is arriving.
- Auto-scroll to the newest content during streaming, but stop auto-following when the user intentionally scrolls upward.
- Provide clear affordances for retry, regenerate, copy, edit, and continue actions near the relevant message, not detached elsewhere.

## Prompt Composer

- The composer is the main interaction surface and must always feel prominent, stable, and ergonomic.
- Use a large, comfortable text area with clear focus styling and enough internal padding for extended writing.
- Place primary actions such as send, attach, model/tool selection, and stop generation close to the composer.
- The composer should support keyboard-first use: `Enter` / `Shift+Enter`, focus retention, and visible disabled/loading states.
- Keep the composer docked or sticky on long conversations so the user never loses the primary action.

## Important Chat Product Features

Incorporate these high-value UX patterns where relevant:

- conversation sidebar with recent chats and fast switching
- empty state with suggested prompts or starter actions
- persistent composer with multiline input
- streaming assistant output with live progress feedback
- inline message actions: copy, retry, edit, regenerate
- clear loading, stopped, error, and reconnect states
- readable markdown/code/file output surfaces
- support areas for attachments, tools, or artifacts without overwhelming the main thread
- subtle status indicators for connectivity, streaming, and background actions
- mobile-friendly conversation switching and composer ergonomics

## Visual Language

- Use soft surfaces, restrained borders, and readable contrast rather than loud gradients or heavy card stacks.
- Typography must support long-form reading: generous line height, moderate line length, clear heading hierarchy, and muted secondary metadata.
- Use whitespace as the primary separator before introducing borders and shadows.
- Motion should be quiet and purposeful: message reveal, panel transitions, typing/streaming states, and hover/focus feedback.
- Avoid visual overload in the sidebar and toolbar areas; secondary actions should be discoverable without competing with the conversation.

## Theming & Tokens

- Theme the chat product through semantic CSS variables, never through page-specific hardcoded values.
- At minimum define tokens for:
  - app background
  - sidebar background
  - message surfaces
  - composer background
  - primary text
  - muted text
  - accent/action color
  - borders/dividers
  - status colors
  - fonts
  - spacing scale
  - radius scale
  - shadows
- Ensure theme tokens work across light and dark modes without breaking message distinction or readability.
- The chat page should feel cohesive across themes; do not redesign layout per theme, only swap the token layer.

## Responsive Requirements

- Desktop: sidebar + main conversation layout with constrained message width and comfortable spacing.
- Tablet: keep the composer prominent, allow sidebar collapse, and avoid dense multi-column arrangements.
- Mobile: prioritize the conversation and composer; move history and secondary controls into drawers or overlays.
- Every major chat interaction must remain usable with one hand on mobile: scrolling, sending, switching chats, stopping generation.
- Test the full conversation flow on small screens: empty state, active chat, streaming, errors, long messages, code blocks, and keyboard open state.

## Accessibility

- Message streams and dynamic updates must be announced appropriately with `aria-live` where needed.
- Focus order must support a full conversation workflow without a mouse.
- Sidebar navigation, message actions, and composer controls all need accessible names.
- Distinguish states such as streaming, error, selected conversation, and disabled controls using more than color.

## Anti-patterns

- Do not clone ChatGPT or Claude visually one-to-one.
- Do not make the chat area full-width on large screens.
- Do not bury the composer below long scrolling content without sticky positioning.
- Do not overload the message row with too many permanently visible controls.
- Do not rely on dense shadows, excessive gradients, or dashboard-style widgets that compete with the conversation.
- Do not ship desktop-first layouts that merely shrink on tablet/mobile.

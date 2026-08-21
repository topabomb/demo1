# Agent Workspace Scenario Contracts

A framework/template is useful only if it survives the content and layout transitions of a real Agent workspace. This document defines the executable scenario surface for `demo1`; each scenario is represented by canonical data, projected through the normal runtime, rendered by replaceable components and verified in Chromium.

## Scenario matrix

| Scenario | Canonical semantics | Presentation responsibility | Browser invariants |
|---|---|---|---|
| Live LLM reasoning | stable assistant Message/Turn/Step + `reasoning` Block; append-only reasoning mutations | one stable Thinking node; collapsed and expanded heights are both valid | streaming text updates while open; collapse/expand changes height without row overlap, body overflow or semantic corruption |
| Live Markdown answer | stable `markdown` Block after/sibling to reasoning | re-chunk only mutable Markdown tail; settled chunks and sibling Blocks keep identity | 60 Hz publication remains incremental, tail/follow stays correct and projection cache stays bounded |
| Single user image upload | one `attachments` Block with one stable item id | attachment group renders one image with reserved intrinsic ratio | no inline overflow; dimensions reserve layout before load |
| Multi-file user upload | one grouped `attachments` Block containing independent image/file/audio item ids | responsive media grid + file rows | desktop two-column image grid may become one column on phone; no body overflow or virtual-row overlap |
| Image-generation tool | `tool-call` + `tool-result` share producer-owned `callId`; generated files are a separate `attachments` Block linked by provenance | ToolCard owns execution/model/progress/input/output; AttachmentBlock owns generated media/prompt provenance | prompt/model/call/result correlation remains visible; 1..N generated images fit desktop/mobile layouts |
| TTS | tool execution records plus independent `audio` artifact | AudioBlock owns player/waveform, duration and spoken text | media width contained; transcript wraps; artifact survives independently of ToolCard expansion |
| ASR | user audio Block + tool execution + result transcript | AudioBlock owns source/transcript surface; ToolCard owns ASR execution/result | long transcript wraps; structured result expansion does not overlap adjacent rows |
| Search/filesystem/shell-style tools | stable call/result identity and category-neutral structured data | generic ToolCard disclosure | large JSON owns internal scrolling; opening/closing never changes canonical state |
| Code/diff/HTML/image outputs | semantic Blocks, independent of provider | dedicated bounded renderers | code/table overflow is internal; HTML sanitized; image intrinsic ratio contained |
| Large heterogeneous history | all above content may exist in the same long session | bounded hot projection + virtualized physical list | hot work depends on changed/hot/visible data rather than total history |

## Abstraction rule

The framework deliberately distinguishes three concepts:

1. **Execution** — `tool-call` / `tool-result`. It describes what an Agent capability is doing, its stable `callId`, category, provider/model metadata, progress, input and output.
2. **Artifact/media** — `attachments`, `audio`, image/code/diff/HTML Blocks. They are displayable results or user inputs with their own stable identity and lifetime.
3. **LLM content** — `reasoning`, `markdown`, text and related model output. High-frequency streams use Block-specific incremental projection.

Do not put generated images, an audio player or an arbitrary product component inside ToolCard just because a tool produced them. The tool execution and its durable artifact are related by stable provenance, not by renderer containment. This keeps tools extensible while media components stay reusable for user uploads, assistant outputs and future providers.

## Identity

The normal semantic coordinate is:

```text
Session → Message → Turn → optional Step → Block → optional Artifact/Tool identity
```

A tool producer owns `callId`; an artifact producer owns item ids. The client never correlates a result to “the latest unfinished tool”. Generated artifacts may carry `provenance.toolCallId`, `toolName`, `model` and `prompt`, but they remain standalone canonical Blocks.

## Streaming publication

Every semantic mutation is applied in producer order. Publication cadence is a separate concern:

- SessionKernel `subscribeEvents` delivers every mutation to incremental presentation.
- Summary/UI notification remains microtask-coalesced.
- Reasoning append replaces one stable Thinking RenderUnit.
- Markdown append re-chunks only the mutable tail of the target Block, even when reasoning is a sibling in the same Message.
- Physical height changes are measured by the list adapter; collapsed/open state never changes canonical reasoning content.

## Scenario-pack fixture

`createAgentScenarioPack()` is a deterministic adapter-level fixture, not a DOM shortcut. It appends canonical records through `SessionKernel.appendCanonicalMessages()` and includes:

- single image upload;
- multi-image + document + audio upload;
- reasoning + Markdown response;
- image-generation call/result + four generated images and prompt/model provenance;
- TTS call/result + audio artifact;
- ASR input + call/result + transcript;
- final Markdown summary.

The fixture exists to make the abstraction falsifiable. A real backend should be able to normalize into the same vocabulary without changing SessionKernel, ProjectionEngine, viewport policy or renderer registry semantics.

## E2E acceptance

`e2e/agent-scenarios.spec.ts` adds three mandatory checks to the existing million-message and responsive suites:

1. live reasoning grows while expanded, can collapse again and never overlaps adjacent virtual rows;
2. upload/image-generation/TTS/ASR workflows render and remain contained on desktop and phone;
3. repeated heterogeneous packs keep mounted DOM and projection caches bounded.

These are correctness gates, not screenshots or demos. A Pages deployment is accepted only when the same complete Chromium suite passes against the deployed URL.

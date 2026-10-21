# Adapter provenance

Behavior is generated from recipe/ (gpt-with-taste 0.1.0). Runtime reads texts.json and its six generated Markdown files.

Pi transport adapts projection.ts, payload.ts and extension.ts from [SpadeLushen/pi-gpt-with-taste](https://github.com/SpadeLushen/pi-gpt-with-taste/tree/07013409c19fe307d0a951ef5f2b3f72f4c837b3), MIT. THIRD_PARTY_LICENSE preserves its full license.

Changes: dependency-free JavaScript, compiler-owned resources, independent role, factory scope options, compact branch controls and duplicate-registration guard. Request-local section, unanswered-input projection, completion-only custom message routing and OpenAI final-payload recovery retain the reference mechanisms. No behavior Markdown or TOML helper was copied from that repository.

Local integration: the `system-prompt:preview` event adds display-only, current-session previews using the same role text and activation decision as request injection. The viewer can show Taste before the first request without changing the model context or recording request snapshots.

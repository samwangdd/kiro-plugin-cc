# Kiro Rescue Delegation E2E Design

> Date: 2026-04-06
> Status: Draft

## Goal

Define a testable design that proves `/kiro:rescue` uses strong delegation in real Claude Code runtime:

- Claude Code must delegate the task through `kiro-plugin-cc`
- Claude Code must not directly inspect or modify the repository during that turn
- the delegated execution path must emit stable evidence that can be asserted automatically

## Primary Outcome

The first release targets one measurable goal:

`A1: /kiro:rescue must behave as strong delegation in real runtime.`

Strong delegation means:

- the command is triggered through the real Claude CLI runtime
- the runtime performs exactly one expected `Bash` tool call for the rescue path
- that `Bash` call invokes `node ".../kiro-companion.mjs" rescue ...`
- the runtime does not use direct repository tools such as `Read`, `Edit`, or `Grep`
- `kiro-companion` writes job and handoff evidence
- the final output contains a stub `kiro-cli` sentinel proving the response came from the delegation chain

## Non-Goals

This design does not cover:

- proving that real networked `kiro-cli` executions succeed against production models
- validating task completion quality inside Kiro
- review-mode delegation behavior
- broker or app-server style architecture similar to Codex Plugin CC

Those can be added in later phases after delegation integrity is locked down.

## Constraints

- keep `/kiro:rescue` on command-layer direct execution
- do not reintroduce a Claude-side rescue subagent or forwarding skill
- do not change product behavior just to make tests pass unless a missing evidence point blocks verification
- real-runtime smoke tests must not run as part of default `npm test`
- first version uses a stub `kiro-cli` to keep the runtime deterministic

## Recommended Approach

Use structural constraints plus runtime evidence.

Why this approach:

- structural checks in the repo are cheap and stable
- real runtime checks catch the actual failure mode the team cares about: Claude silently doing the work itself
- a stub `kiro-cli` removes model, auth, and network drift while preserving the real Claude and plugin execution path

## Test Architecture

### Layer 1: Repository Regression

Purpose:
prove the plugin definition and companion behavior stay aligned with the delegation contract.

Coverage:

- `plugins/kiro/commands/rescue.md` keeps:
  - `context: fork`
  - `disable-model-invocation: true`
  - `allowed-tools: Bash(node:*)`
  - `node "${CLAUDE_PLUGIN_ROOT}/scripts/kiro-companion.mjs" rescue $ARGUMENTS`
- `kiro-companion` foreground rescue writes:
  - `state.json`
  - `jobs/*.meta.json`
  - `jobs/*.log`
  - `.kiro-companion/handoff.md`
- result propagation remains verbatim from delegated execution

Existing tests already cover part of this layer and should be extended rather than replaced.

### Layer 2: Real Runtime Smoke

Purpose:
prove the real Claude CLI runtime uses strong delegation when `/kiro:rescue` is triggered.

Execution model:

- launch Claude non-interactively with:
  - `claude -p --bare --verbose --permission-mode dontAsk`
  - `--plugin-dir <local kiro plugin>`
  - `--output-format stream-json`
- inject a stub `kiro-cli` earlier in `PATH`
- set `KIRO_COMPANION_HOME` to a temp directory
- run `/kiro:rescue --fresh <smoke task>`
- parse the event stream and assert runtime behavior

This layer is the primary proof that Claude did not bypass the plugin.

## Acceptance Matrix

### R1: Command Trigger

Pass when:

- Claude loads the local plugin
- `/kiro:rescue ...` executes in non-interactive mode without manual intervention

Fail when:

- slash command is unavailable
- Claude ignores the plugin directory
- command invocation aborts before companion execution

### R2: Strong Delegation

Pass when:

- the event stream contains exactly one key `Bash` tool use
- that `Bash` command matches `node ".../kiro-companion.mjs" rescue ...`

Fail when:

- no `Bash` call is observed
- more than one relevant `Bash` call is observed
- the command does not target `kiro-companion.mjs rescue`

### R3: No Direct Repository Access

Pass when:

- the same turn contains no `Read`, `Edit`, or `Grep` tool use events

Fail when:

- any direct repository inspection or modification tool is used by Claude during the turn

### R4: Delegation Evidence

Pass when execution produces:

- `state.json`
- `jobs/*.meta.json`
- `jobs/*.log`
- project-local `.kiro-companion/handoff.md`

Fail when any required artifact is missing.

### R5: Output Provenance

Pass when:

- the final Claude result includes the stub sentinel
- the job summary or log also includes the same sentinel

Fail when:

- the sentinel is absent from final output
- the sentinel is absent from job evidence

## Evidence Sources

The tests should treat the following as official evidence:

- Claude `stream-json` output
- companion state artifacts under `KIRO_COMPANION_HOME`
- project-local handoff file

The tests should not rely on:

- human inspection
- timing-sensitive process scraping as the primary signal
- model text heuristics such as "this sounds like Claude wrote it"

## Stub Kiro CLI Contract

The stub `kiro-cli` only needs the behavior required by the smoke test:

- `chat` returns a fixed sentinel line such as `RESCUE_SENTINEL: delegated via stub`
- optional support for `version`, `whoami`, and `login` for setup-related probes

The sentinel must be unique enough that it cannot be confused with ordinary model output.

## Implementation Shape

### New Test Entry Point

Add a dedicated script, for example:

- `npm run test:e2e-delegation`

It should not run as part of default `npm test`.

### New Test Area

Recommended location:

- `tests/e2e/`

Recommended responsibilities:

- temp workspace creation
- temp `KIRO_COMPANION_HOME`
- stub `kiro-cli` creation
- Claude process invocation
- stream-json parsing
- artifact assertions

### Stream Parsing Rules

The parser should capture:

- slash command availability from the initial `system/init` event
- `assistant` tool-use events for `Bash`
- any tool uses for `Read`, `Edit`, `Grep`
- final result payload

The parser should ignore incidental metadata that does not affect delegation assertions.

## Risks

### Runtime Drift

Claude CLI stream-json output may evolve over time.

Mitigation:

- assert on a small number of stable fields
- keep parsing logic tolerant to unrelated event changes

### Plugin Loading Differences

Some environments may load extra global plugins or skills.

Mitigation:

- scope assertions to the current turn's tool-use events
- assert absence of forbidden tool use in the target turn, not across all global startup metadata

### Stub False Confidence

A stub proves delegation integrity, not real Kiro success.

Mitigation:

- document this explicitly
- add a later second-phase test with authenticated real `kiro-cli` if needed

## User-Provided Inputs Required

This first phase requires only the following confirmed inputs:

- real-runtime smoke tests may be added to the repository
- the tests may depend on the local `claude` CLI being installed
- first phase may use a stub `kiro-cli`
- stream-json event output is an accepted evidence source
- E2E smoke runs through a dedicated script, not `npm test`

All five have been confirmed in the design discussion.

## Phase 2 Extension

After A1 is stable, a second goal can be added:

- delegated tasks must automatically verify completion using command-based checks inside the implementation flow

That phase should start only after the delegation integrity test suite is green and trusted.

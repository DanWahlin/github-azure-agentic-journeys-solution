# SmartTodo — Phase 2 Report

**Scope:** Build the SmartTodo iOS client (Phase 2 of 3). SwiftUI, iOS 17+,
no third-party dependencies. Generate the source, statically verify it, and add a
portable contract check. No Xcode/simulator run (Linux host — SwiftUI/UIKit SDKs
do not exist on Linux, so no build/run was invented).

**Host:** Linux. No Swift toolchain and no iOS SDK are available; verification is
static and contract-based, plus a Node.js contract checker driven by fixtures
generated from the Phase 1 API's own compiled code.

## What was built (`smart-todo/src/ios`)

| Area | Files |
|------|-------|
| App entry | `SmartTodo/SmartTodoApp.swift` |
| Config | `SmartTodo/Config.swift` (replaceable base URL via `#if DEBUG`) |
| Models | `Models/Todo.swift` (`Todo` + `TodoStatus`), `Models/ActionStep.swift`, `Models/APIError.swift` |
| API client | `Services/APIClient.swift` (async/await, all six endpoints) |
| Views | `Views/TodoListView.swift`, `AddTodoView.swift`, `TodoDetailView.swift`, `ActionStepsView.swift` |
| Xcode project | `SmartTodo.xcodeproj` (project.pbxproj, workspace, shared scheme) |
| Verification | `scripts/contract-check.mjs`, `scripts/swift-static-check.mjs`, `scripts/fixtures/*.json` |
| Docs | `src/ios/README.md`, `src/ios/.gitignore` |

## Spec conformance

- **Codable models match the API exactly.** `Todo` fields
  `id, title, status, userId, stepsGenerated, createdAt, updatedAt, steps`;
  `ActionStep` fields `id, todoId, title, description, order, isCompleted, createdAt`.
  No `CodingKeys` remapping is needed because Swift property names equal the JSON
  keys. `createdAt`/`updatedAt` are kept as `String` (ISO 8601) to match the API,
  not decoded to `Date`.
- **Status raw values** are exactly `pending | in_progress | completed`
  (`TodoStatus` enum with `inProgress = "in_progress"`). `not_started` is never
  used. Verified against fixtures and the canonical set.
- **Error shape** `{ error: { code, message } }` is modeled by
  `APIErrorEnvelope`/`Detail`; the client decodes it on non-2xx responses and
  throws `APIClientError` (a `LocalizedError`) that preserves the server `code`.
- **API client** implements the exact spec signatures: `getTodos`,
  `createTodo(title:)`, `updateTodo(id:title:status:)`, `deleteTodo(id:)`,
  `generateSteps(todoId:)`, `updateStep(todoId:stepId:isCompleted:)`. All use
  `URLSession.shared.data(for:)` with `async throws`. `DELETE` uses a
  no-content path that never decodes JSON (per the `204` contract). Base URL and
  user id come from `Config` — never hardcoded at the call site.
- **Views** implement the spec:
  - `TodoListView`: navigation title "SmartTodo", color-coded status badges
    (gray/blue/green), `"N/M steps"` progress, swipe-to-delete with a
    confirmation alert, `+` toolbar button presenting `AddTodoView` as a sheet,
    tap-to-navigate to `TodoDetailView`, `.refreshable` pull-to-refresh, and the
    "No todos yet. Tap + to add one." empty state.
  - `AddTodoView`: sheet with placeholder "What do you want to accomplish?",
    Add disabled when empty/whitespace, Cancel, and `.onAppear` keyboard focus.
  - `TodoDetailView`: editable title `TextField`, status `Picker`
    (pending/in_progress/completed), conditional
    `HStack { Image(systemName:"sparkles"); Text("Generate Steps") }` /
    `arrow.clockwise` "Regenerate Steps" buttons with
    `.frame(maxWidth:.infinity)` + `.buttonStyle(.borderedProminent)` (`.tint(.blue)`
    for regenerate) — no `Label` inside the `Form` button — a "Generating
    steps..." `ProgressView` overlay, embedded `ActionStepsView`, and a
    destructive "Delete Todo" with a confirmation alert. The view is a `Form`, so
    all controls are reachable regardless of step count.
  - `ActionStepsView`: `ProgressView(value:total:)` with an "N of M complete"
    label and an ordered `ForEach` of steps (no fixed-height clipping) — each row
    has a checkbox that calls the API, the step number, a strikethrough/gray
    completed title, and an expandable description.
- **Loading/error states**: list shows a loading indicator, an error state with
  Retry, and inline error text; detail and add flows surface
  `error.localizedDescription`.
- **Config** keeps the `#if DEBUG` localhost/production switch and documents the
  single-line replacement for the deployed `API_URL`.

## Verification performed

All checks run on the Linux host with Node.js 24 and are re-runnable on macOS.

- **Contract check** — `node scripts/contract-check.mjs`: **pass**. Parses the
  Swift models (no compiler) and compares decodable stored properties, value
  types, and status raw values against JSON fixtures. Fixtures
  (`scripts/fixtures/*.json`) were generated from the Phase 1 API's **own
  compiled code** (`dist/data/memoryDataStore.js`, seeded), so they mirror the
  real serialized shapes for `Todo` (list, single, and freshly-created), nested
  `ActionStep`, and the `{ error: { code, message } }` envelope.
  - Self-test: temporarily renaming `isCompleted`→`completed` and retyping
    `order` to `String` made the checker report the expected mismatches and exit
    non-zero; reverting restored a clean pass. So the checker genuinely fails on
    drift.
- **Structural static check** — `node scripts/swift-static-check.mjs`: **pass**.
  Validates balanced braces/parens/brackets and string literals (ignoring
  comments and multiline strings) across all 10 Swift files, plus invariants:
  `Config` uses `#if DEBUG` + `apiBaseURL`; the client reads `Config.apiBaseURL`
  and uses `async throws`; DELETE has a no-decode path; detail view uses
  `sparkles`/`arrow.clockwise`; list uses `.refreshable`; steps view uses
  `ProgressView`; and no hardcoded API URL exists outside `Config.swift`.
  - Self-test: injecting an unbalanced brace produced the expected failure.
- **Xcode project integrity**: `project.pbxproj` references all 10 Swift sources
  (10 `PBXBuildFile` ↔ 10 `PBXFileReference`, all in the Sources build phase),
  iOS 17.0 deployment target, `GENERATE_INFOPLIST_FILE = YES`, and a shared
  scheme whose blueprint id matches the native target.

## Manual review notes (compiler-uncheckable on Linux)

APIs used are within the iOS 17 baseline: `NavigationStack`,
`ContentUnavailableView`, two-parameter `onChange(of:)`,
`URLSession.data(for:)`, `.refreshable`, `.buttonStyle(.borderedProminent)`,
`background(_:in:)`. Timestamps stay `String` to match the API. These require a
real Xcode build on macOS to fully type-check; that is the Phase 2 macOS step and
was intentionally not simulated here.

## Assumptions

- `updateTodo(status:)` takes a `String?` per the spec signature; the detail view
  passes `TodoStatus.rawValue`, keeping the wire value canonical.
- `Config` bundle id/base placeholder (`https://<your-function-app>...`) is
  replaced during Phase 3 with `azd env get-value API_URL`.

## Defects

None. No `issues.md` was created — no genuinely new defect was found. All static
and contract checks pass, and the Phase 1 API contract is unchanged.

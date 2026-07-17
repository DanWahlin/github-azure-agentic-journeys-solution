# SmartTodo — iOS Client (SwiftUI)

A SwiftUI (iOS 17+) client for the SmartTodo API. No third-party dependencies —
`URLSession` for networking and `Codable` for serialization.

## Structure

```
src/ios/
├── SmartTodo/
│   ├── SmartTodo.xcodeproj/        # Xcode project (open this)
│   ├── SmartTodoApp.swift          # @main entry point
│   ├── Config.swift                # Replaceable API base URL (#if DEBUG)
│   ├── Models/
│   │   ├── Todo.swift              # Todo + TodoStatus (Codable, matches API)
│   │   ├── ActionStep.swift        # ActionStep (Codable, matches API)
│   │   └── APIError.swift          # { error: { code, message } } + LocalizedError
│   ├── Services/
│   │   └── APIClient.swift         # async/await client for all 6 endpoints
│   └── Views/
│       ├── TodoListView.swift      # main screen: list, badges, swipe-delete, +
│       ├── AddTodoView.swift       # add sheet, auto-focused field
│       ├── TodoDetailView.swift    # edit, status picker, generate/regenerate
│       └── ActionStepsView.swift   # progress bar + checkable steps
└── scripts/
    ├── contract-check.mjs          # validate Swift models vs API JSON fixtures
    ├── swift-static-check.mjs      # brace/quote balance + invariants
    └── fixtures/                   # JSON fixtures generated from the API
```

## Build & run (macOS + Xcode)

1. Open `SmartTodo/SmartTodo.xcodeproj` in Xcode.
2. Select an iOS 17+ simulator and press ⌘R.
3. For local dev, run the API (`func start` in `../api`); the DEBUG build points
   at `http://localhost:7071`.

## Point at the deployed Azure API

Replace the `apiBaseURL` value in `Config.swift` with your Function App URL:

```swift
enum Config {
    static let apiBaseURL = "https://<function-app>.azurewebsites.net" // azd env get-value API_URL
    static let defaultUserId = "user-1"
}
```

You can restore the `#if DEBUG` conditional afterward.

## Static verification (portable, no Xcode)

These run on any platform with Node.js 24+:

```bash
node scripts/contract-check.mjs       # models match API field names, status values, types
node scripts/swift-static-check.mjs   # delimiter/string balance + invariants
```

Fixtures are generated from the API's own compiled code so they always reflect
the real contract.

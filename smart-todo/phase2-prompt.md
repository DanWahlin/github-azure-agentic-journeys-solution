SmartTodo journey, Phase 2 of 3. Read JOURNEY.md, PLAN.md, phase1-report.md, and the generated API contracts. Work only in this smart-todo folder.

Generate the complete SwiftUI source under src/ios as specified: Codable models whose field names and status raw values match the API exactly, async API client, todo list/detail/create views, generated-step interactions, error/loading states, and Config.swift with a replaceable API base URL. Do not invent an Xcode/simulator run on this Linux host.

Perform static verification of every generated Swift file and API contract. Add a portable Node.js contract-check script that validates Swift model fields/status values against API JSON fixtures, run it, and repair failures. Write phase2-report.md. Create issues.md only for a genuinely new defect.
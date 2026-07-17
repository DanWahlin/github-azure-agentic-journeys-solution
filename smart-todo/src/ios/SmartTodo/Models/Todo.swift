import Foundation

/// Todo status. Raw values match the API contract exactly:
/// `pending`, `in_progress`, `completed`. The value `not_started` is never used.
enum TodoStatus: String, Codable, CaseIterable, Identifiable {
    case pending
    case inProgress = "in_progress"
    case completed

    var id: String { rawValue }

    /// Human-friendly label for pickers and badges.
    var displayName: String {
        switch self {
        case .pending: return "Pending"
        case .inProgress: return "In Progress"
        case .completed: return "Completed"
        }
    }
}

/// Matches the API `Todo` shape exactly:
/// `{ id, title, status, userId, stepsGenerated, createdAt, updatedAt, steps[] }`.
///
/// Field names line up with the JSON keys, so no `CodingKeys` remapping is
/// required. `Identifiable` uses the server-generated `id`.
struct Todo: Codable, Identifiable, Equatable {
    let id: String
    var title: String
    var status: TodoStatus
    let userId: String
    var stepsGenerated: Bool
    let createdAt: String
    var updatedAt: String
    var steps: [ActionStep]

    /// Steps sorted by their 1-based `order` field for display.
    var orderedSteps: [ActionStep] {
        steps.sorted { $0.order < $1.order }
    }

    var completedStepCount: Int {
        steps.filter(\.isCompleted).count
    }

    /// Progress summary such as "2/4 steps"; `nil` when no steps exist.
    var progressText: String? {
        guard !steps.isEmpty else { return nil }
        return "\(completedStepCount)/\(steps.count) steps"
    }
}

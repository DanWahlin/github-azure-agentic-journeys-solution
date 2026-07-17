import Foundation

/// Matches the API `ActionStep` shape exactly:
/// `{ id, todoId, title, description, order, isCompleted, createdAt }`.
///
/// Field names line up with the JSON keys, so no `CodingKeys` remapping is
/// required. `Identifiable` uses the server-generated `id`.
struct ActionStep: Codable, Identifiable, Equatable {
    let id: String
    let todoId: String
    var title: String
    var description: String
    let order: Int
    var isCompleted: Bool
    let createdAt: String
}

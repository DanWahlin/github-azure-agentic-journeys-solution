import Foundation

/// Async networking client for the SmartTodo API.
///
/// All methods use `URLSession.shared.data(for:)` with `async throws`. On a
/// non-2xx response the client decodes the API `{ error: { code, message } }`
/// envelope and throws an `APIClientError` (a `LocalizedError`). The base URL
/// and default user id come from `Config` — they are never hardcoded here.
final class APIClient {
    static let shared = APIClient()

    private let baseURL = Config.apiBaseURL
    private let userId = Config.defaultUserId
    private let session: URLSession
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    init(session: URLSession = .shared) {
        self.session = session
    }

    // MARK: - Endpoints

    /// GET /api/todos?userId=...
    func getTodos() async throws -> [Todo] {
        var components = try urlComponents(path: "/api/todos")
        components.queryItems = [URLQueryItem(name: "userId", value: userId)]
        guard let url = components.url else { throw APIClientError.invalidURL }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        return try await send(request)
    }

    /// POST /api/todos  { title, userId }  → 201 Todo
    func createTodo(title: String) async throws -> Todo {
        let request = try jsonRequest(
            path: "/api/todos",
            method: "POST",
            body: CreateTodoBody(title: title, userId: userId)
        )
        return try await send(request)
    }

    /// PATCH /api/todos/:id  { title?, status? }  → 200 Todo
    func updateTodo(id: String, title: String?, status: String?) async throws -> Todo {
        let request = try jsonRequest(
            path: "/api/todos/\(pathEscaped(id))",
            method: "PATCH",
            body: UpdateTodoBody(title: title, status: status)
        )
        return try await send(request)
    }

    /// DELETE /api/todos/:id  → 204 No Content (no JSON body to decode).
    func deleteTodo(id: String) async throws {
        let url = try url(path: "/api/todos/\(pathEscaped(id))")
        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        try await sendNoContent(request)
    }

    /// POST /api/todos/:id/generate-steps  → 200 Todo with AI steps.
    func generateSteps(todoId: String) async throws -> Todo {
        let url = try url(path: "/api/todos/\(pathEscaped(todoId))/generate-steps")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        return try await send(request)
    }

    /// PATCH /api/todos/:id/steps/:stepId  { isCompleted }  → 200 ActionStep.
    func updateStep(todoId: String, stepId: String, isCompleted: Bool) async throws -> ActionStep {
        let request = try jsonRequest(
            path: "/api/todos/\(pathEscaped(todoId))/steps/\(pathEscaped(stepId))",
            method: "PATCH",
            body: UpdateStepBody(isCompleted: isCompleted)
        )
        return try await send(request)
    }

    // MARK: - Request bodies

    private struct CreateTodoBody: Encodable {
        let title: String
        let userId: String
    }

    private struct UpdateTodoBody: Encodable {
        let title: String?
        let status: String?
    }

    private struct UpdateStepBody: Encodable {
        let isCompleted: Bool
    }

    // MARK: - Transport

    private func send<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await session.data(for: request)
        try validate(response: response, data: data)
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIClientError.decoding(String(describing: error))
        }
    }

    private func sendNoContent(_ request: URLRequest) async throws {
        let (data, response) = try await session.data(for: request)
        try validate(response: response, data: data)
    }

    private func validate(response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else {
            throw APIClientError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            if let envelope = try? decoder.decode(APIErrorEnvelope.self, from: data) {
                throw APIClientError.api(
                    code: envelope.error.code,
                    message: envelope.error.message,
                    status: http.statusCode
                )
            }
            throw APIClientError.http(status: http.statusCode)
        }
    }

    // MARK: - URL helpers

    private func jsonRequest<Body: Encodable>(path: String, method: String, body: Body) throws -> URLRequest {
        let url = try url(path: path)
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(body)
        return request
    }

    private func urlComponents(path: String) throws -> URLComponents {
        guard let components = URLComponents(string: baseURL + path) else {
            throw APIClientError.invalidURL
        }
        return components
    }

    private func url(path: String) throws -> URL {
        guard let url = URL(string: baseURL + path) else {
            throw APIClientError.invalidURL
        }
        return url
    }

    /// Percent-escapes a path segment (ids are UUIDs/slugs, but escape defensively).
    private func pathEscaped(_ segment: String) -> String {
        segment.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? segment
    }
}

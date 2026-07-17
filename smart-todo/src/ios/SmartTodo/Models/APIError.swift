import Foundation

/// Decodes the API error envelope: `{ "error": { "code", "message" } }`.
struct APIErrorEnvelope: Codable, Equatable {
    struct Detail: Codable, Equatable {
        let code: String
        let message: String
    }

    let error: Detail
}

/// Error thrown by `APIClient`. Conforms to `LocalizedError` so SwiftUI can show
/// a descriptive message. It preserves the server error `code` when available.
enum APIClientError: LocalizedError, Equatable {
    /// The server returned a structured `{ error: { code, message } }` body.
    case api(code: String, message: String, status: Int)
    /// A non-2xx response without a decodable error body.
    case http(status: Int)
    /// The URL could not be constructed from `Config.apiBaseURL`.
    case invalidURL
    /// The response was not an HTTP response or was otherwise malformed.
    case invalidResponse
    /// The response body could not be decoded into the expected type.
    case decoding(String)

    var errorDescription: String? {
        switch self {
        case let .api(_, message, _):
            return message
        case let .http(status):
            return "The server returned an unexpected status code (\(status))."
        case .invalidURL:
            return "The API URL is invalid. Check Config.apiBaseURL."
        case .invalidResponse:
            return "The server returned an invalid response."
        case let .decoding(details):
            return "Could not read the server response. \(details)"
        }
    }

    /// The server error code (e.g. `VALIDATION_ERROR`) when present.
    var code: String? {
        if case let .api(code, _, _) = self { return code }
        return nil
    }
}

import Foundation

/// Central configuration for the SmartTodo client.
///
/// The API base URL must never be hardcoded at the call site — it is read from
/// here so it can be swapped for a deployed Function App URL. `#if DEBUG`
/// selects the local Azure Functions host during development and the deployed
/// URL for Release builds.
///
/// To test against the deployed Azure API, the simplest approach is to replace
/// the `apiBaseURL` value below with your deployed Function App URL (get it with
/// `azd env get-value API_URL`). You can restore the conditional later.
enum Config {
    #if DEBUG
    static let apiBaseURL = "https://func-id62b5c2lfhta.azurewebsites.net"
    #else
    static let apiBaseURL = "https://func-id62b5c2lfhta.azurewebsites.net"
    #endif

    static let defaultUserId = "user-1"
}

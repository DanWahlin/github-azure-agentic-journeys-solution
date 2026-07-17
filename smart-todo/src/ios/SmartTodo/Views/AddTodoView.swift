import SwiftUI

/// Presented as a sheet from `TodoListView`. A single text field for the todo
/// title with an auto-focused keyboard, an "Add" button (disabled when the title
/// is empty/whitespace), and a "Cancel" button.
struct AddTodoView: View {
    /// Called with the trimmed title when the user taps "Add".
    let onAdd: (String) async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var isSubmitting = false
    @FocusState private var isFocused: Bool

    private var trimmedTitle: String {
        title.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var canAdd: Bool {
        !trimmedTitle.isEmpty && !isSubmitting
    }

    var body: some View {
        NavigationStack {
            Form {
                TextField("What do you want to accomplish?", text: $title)
                    .focused($isFocused)
                    .submitLabel(.done)
                    .onSubmit {
                        if canAdd { submit() }
                    }
            }
            .navigationTitle("New Todo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSubmitting {
                        ProgressView()
                    } else {
                        Button("Add") { submit() }
                            .disabled(!canAdd)
                    }
                }
            }
            .onAppear { isFocused = true }
        }
    }

    private func submit() {
        let value = trimmedTitle
        guard !value.isEmpty else { return }
        isSubmitting = true
        Task {
            await onAdd(value)
            isSubmitting = false
            dismiss()
        }
    }
}

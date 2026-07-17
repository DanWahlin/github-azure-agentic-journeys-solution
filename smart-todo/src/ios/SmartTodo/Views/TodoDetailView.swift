import SwiftUI

/// Detail screen for a single todo. Title is editable, status is a picker, and a
/// conditional Generate/Regenerate Steps button drives the AI flow. Action steps
/// are embedded below and a destructive Delete button sits at the bottom. The
/// whole view is a `Form` so everything is scrollable regardless of step count.
struct TodoDetailView: View {
    @State private var todo: Todo
    @State private var isGenerating = false
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var showingDeleteConfirm = false

    let onUpdate: (Todo) -> Void
    let onDelete: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    private let client = APIClient.shared

    init(todo: Todo, onUpdate: @escaping (Todo) -> Void, onDelete: @escaping (String) -> Void) {
        _todo = State(initialValue: todo)
        self.onUpdate = onUpdate
        self.onDelete = onDelete
    }

    var body: some View {
        Form {
            Section("Title") {
                TextField("Title", text: $todo.title)
                    .onSubmit { Task { await saveTitle() } }
            }

            Section("Status") {
                Picker("Status", selection: $todo.status) {
                    ForEach(TodoStatus.allCases) { status in
                        Text(status.displayName).tag(status)
                    }
                }
                .onChange(of: todo.status) { _, newValue in
                    Task { await saveStatus(newValue) }
                }
            }

            Section {
                generateButton
            }

            if !todo.steps.isEmpty {
                Section("Action Steps") {
                    ActionStepsView(steps: todo.orderedSteps) { step, isCompleted in
                        await toggleStep(step, isCompleted: isCompleted)
                    }
                }
            }

            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(.red)
                }
            }

            Section {
                Button(role: .destructive) {
                    showingDeleteConfirm = true
                } label: {
                    Text("Delete Todo")
                        .frame(maxWidth: .infinity)
                }
            }
        }
        .navigationTitle("Todo")
        .navigationBarTitleDisplayMode(.inline)
        .overlay {
            if isGenerating {
                generatingOverlay
            }
        }
        .alert("Delete Todo", isPresented: $showingDeleteConfirm) {
            Button("Delete", role: .destructive) {
                Task { await deleteTodo() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Delete \"\(todo.title)\"? This cannot be undone.")
        }
    }

    // MARK: - Generate button

    @ViewBuilder
    private var generateButton: some View {
        if todo.stepsGenerated {
            Button {
                Task { await generateSteps() }
            } label: {
                HStack {
                    Image(systemName: "arrow.clockwise")
                    Text("Regenerate Steps")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(.blue)
            .disabled(isGenerating)
        } else {
            Button {
                Task { await generateSteps() }
            } label: {
                HStack {
                    Image(systemName: "sparkles")
                    Text("Generate Steps")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(isGenerating)
        }
    }

    private var generatingOverlay: some View {
        ZStack {
            Color.black.opacity(0.25).ignoresSafeArea()
            VStack(spacing: 12) {
                ProgressView()
                Text("Generating steps...")
                    .font(.callout)
            }
            .padding(24)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
        }
    }

    // MARK: - Actions

    private func saveTitle() async {
        let trimmed = todo.title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        await update(title: trimmed, status: nil)
    }

    private func saveStatus(_ status: TodoStatus) async {
        await update(title: nil, status: status.rawValue)
    }

    private func update(title: String?, status: String?) async {
        isSaving = true
        errorMessage = nil
        do {
            let updated = try await client.updateTodo(id: todo.id, title: title, status: status)
            apply(updated)
        } catch {
            errorMessage = error.localizedDescription
        }
        isSaving = false
    }

    private func generateSteps() async {
        isGenerating = true
        errorMessage = nil
        do {
            let updated = try await client.generateSteps(todoId: todo.id)
            apply(updated)
        } catch {
            errorMessage = error.localizedDescription
        }
        isGenerating = false
    }

    private func toggleStep(_ step: ActionStep, isCompleted: Bool) async {
        errorMessage = nil
        do {
            let updatedStep = try await client.updateStep(
                todoId: todo.id,
                stepId: step.id,
                isCompleted: isCompleted
            )
            if let index = todo.steps.firstIndex(where: { $0.id == updatedStep.id }) {
                todo.steps[index] = updatedStep
            }
            // The API may auto-complete/revert the parent todo; reflect that by
            // recomputing locally so the badge stays consistent until next refresh.
            applyAutoStatus()
            onUpdate(todo)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Mirrors the API auto-completion rule for immediate UI feedback.
    private func applyAutoStatus() {
        guard !todo.steps.isEmpty else { return }
        let allComplete = todo.steps.allSatisfy(\.isCompleted)
        if allComplete {
            todo.status = .completed
        } else if todo.status == .completed {
            todo.status = .inProgress
        }
    }

    private func deleteTodo() async {
        do {
            try await client.deleteTodo(id: todo.id)
            onDelete(todo.id)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func apply(_ updated: Todo) {
        todo = updated
        onUpdate(updated)
    }
}

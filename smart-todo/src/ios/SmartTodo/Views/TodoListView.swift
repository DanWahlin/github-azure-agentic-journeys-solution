import SwiftUI

/// Main screen (`/`). Shows the list of todos with status badges and step
/// progress, supports pull-to-refresh, swipe-to-delete with confirmation, and a
/// "+" toolbar button that presents `AddTodoView` as a sheet.
struct TodoListView: View {
    @State private var todos: [Todo] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var showingAdd = false
    @State private var pendingDelete: Todo?

    private let client = APIClient.shared

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("SmartTodo")
                .toolbar {
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button {
                            showingAdd = true
                        } label: {
                            Image(systemName: "plus")
                        }
                        .accessibilityLabel("Add todo")
                    }
                }
                .sheet(isPresented: $showingAdd) {
                    AddTodoView { title in
                        await addTodo(title: title)
                    }
                }
                .refreshable {
                    await loadTodos()
                }
                .task {
                    await loadTodos()
                }
                .alert("Delete Todo", isPresented: deleteAlertBinding, presenting: pendingDelete) { todo in
                    Button("Delete", role: .destructive) {
                        Task { await deleteTodo(todo) }
                    }
                    Button("Cancel", role: .cancel) {}
                } message: { todo in
                    Text("Delete \"\(todo.title)\"? This cannot be undone.")
                }
        }
    }

    @ViewBuilder
    private var content: some View {
        if isLoading && todos.isEmpty {
            ProgressView("Loading todos...")
        } else if let errorMessage, todos.isEmpty {
            errorState(errorMessage)
        } else if todos.isEmpty {
            emptyState
        } else {
            todoList
        }
    }

    private var todoList: some View {
        List {
            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(.red)
                }
            }
            ForEach(todos) { todo in
                NavigationLink {
                    TodoDetailView(todo: todo) { updated in
                        replace(updated)
                    } onDelete: { deletedId in
                        todos.removeAll { $0.id == deletedId }
                    }
                } label: {
                    TodoRow(todo: todo)
                }
            }
            .onDelete { offsets in
                if let index = offsets.first {
                    pendingDelete = todos[index]
                }
            }
        }
    }

    private var emptyState: some View {
        ContentUnavailableView {
            Label("No todos yet", systemImage: "checklist")
        } description: {
            Text("No todos yet. Tap + to add one.")
        }
    }

    private func errorState(_ message: String) -> some View {
        ContentUnavailableView {
            Label("Something went wrong", systemImage: "exclamationmark.triangle")
        } description: {
            Text(message)
        } actions: {
            Button("Retry") {
                Task { await loadTodos() }
            }
        }
    }

    private var deleteAlertBinding: Binding<Bool> {
        Binding(
            get: { pendingDelete != nil },
            set: { if !$0 { pendingDelete = nil } }
        )
    }

    // MARK: - Actions

    private func loadTodos() async {
        isLoading = true
        errorMessage = nil
        do {
            todos = try await client.getTodos()
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func addTodo(title: String) async {
        do {
            let created = try await client.createTodo(title: title)
            todos.append(created)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func deleteTodo(_ todo: Todo) async {
        do {
            try await client.deleteTodo(id: todo.id)
            todos.removeAll { $0.id == todo.id }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func replace(_ todo: Todo) {
        if let index = todos.firstIndex(where: { $0.id == todo.id }) {
            todos[index] = todo
        }
    }
}

/// A single row in the todo list: title, status badge, and step progress.
private struct TodoRow: View {
    let todo: Todo

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(todo.title)
                .font(.headline)
                .lineLimit(2)
            HStack(spacing: 8) {
                StatusBadge(status: todo.status)
                if let progress = todo.progressText {
                    Text(progress)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 4)
    }
}

/// Color-coded status badge: gray = pending, blue = in_progress, green = completed.
struct StatusBadge: View {
    let status: TodoStatus

    var body: some View {
        Text(status.displayName)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(color.opacity(0.2), in: Capsule())
            .foregroundStyle(color)
    }

    private var color: Color {
        switch status {
        case .pending: return .gray
        case .inProgress: return .blue
        case .completed: return .green
        }
    }
}

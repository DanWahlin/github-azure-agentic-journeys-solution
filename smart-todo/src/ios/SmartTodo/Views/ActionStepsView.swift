import SwiftUI

/// Displays a todo's action steps: a progress bar at the top, then an ordered
/// list of step rows. Designed to be embedded inside a parent `Form`/`ScrollView`
/// (uses `ForEach`, not a fixed-height container) so all steps stay visible.
struct ActionStepsView: View {
    /// Steps already sorted by `order`.
    let steps: [ActionStep]
    /// Called when a step's checkbox is toggled; receives the new value.
    let onToggle: (ActionStep, Bool) async -> Void

    private var completedCount: Int {
        steps.filter(\.isCompleted).count
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !steps.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    ProgressView(
                        value: Double(completedCount),
                        total: Double(steps.count)
                    )
                    Text("\(completedCount) of \(steps.count) complete")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 4)
            }

            ForEach(steps) { step in
                ActionStepRow(step: step) { newValue in
                    await onToggle(step, newValue)
                }
            }
        }
    }
}

/// A single step row: checkbox, step number, title (strikethrough + gray when
/// completed), and an expandable description.
private struct ActionStepRow: View {
    let step: ActionStep
    let onToggle: (Bool) async -> Void

    @State private var isExpanded = false
    @State private var isUpdating = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top, spacing: 12) {
                Button {
                    Task {
                        isUpdating = true
                        await onToggle(!step.isCompleted)
                        isUpdating = false
                    }
                } label: {
                    Image(systemName: step.isCompleted ? "checkmark.circle.fill" : "circle")
                        .foregroundStyle(step.isCompleted ? .green : .secondary)
                        .imageScale(.large)
                }
                .buttonStyle(.plain)
                .disabled(isUpdating)

                Text("\(step.order).")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(.secondary)

                VStack(alignment: .leading, spacing: 4) {
                    Text(step.title)
                        .strikethrough(step.isCompleted)
                        .foregroundStyle(step.isCompleted ? .secondary : .primary)

                    if isExpanded {
                        Text(step.description)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Spacer(minLength: 0)

                Button {
                    withAnimation { isExpanded.toggle() }
                } label: {
                    Image(systemName: "chevron.right")
                        .rotationEffect(.degrees(isExpanded ? 90 : 0))
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(isExpanded ? "Collapse description" : "Expand description")
            }
        }
        .padding(.vertical, 2)
        .contentShape(Rectangle())
    }
}

const vscode = require("vscode")

const UNUSED_COLOR = "#7f8591"

let unusedDecoration
let output

function getDiagnosticCode(diagnostic) {
    if (
        typeof diagnostic.code === "string" ||
        typeof diagnostic.code === "number"
    ) {
        return String(diagnostic.code)
    }

    if (
        diagnostic.code &&
        typeof diagnostic.code.value !== "undefined"
    ) {
        return String(diagnostic.code.value)
    }

    return ""
}

function isUnusedDiagnostic(diagnostic) {
    const source = (diagnostic.source ?? "").toLowerCase()
    const code = getDiagnosticCode(diagnostic).toLowerCase()

    if (source === "eslint") {
        return (
            code === "no-unused-vars" ||
            code === "@typescript-eslint/no-unused-vars" ||
            code === "no-unused-private-class-members"
        )
    }

    if (source === "pyrefly") {
        return (
            code === "unused-variable" ||
            code === "unused-import" ||
            code === "unused-parameter"
        )
    }

    return false
}

function updateEditor(editor) {
    if (!editor) {
        return
    }

    const diagnostics =
        vscode.languages.getDiagnostics(editor.document.uri)

    output.appendLine("")
    output.appendLine(
        `--- ${editor.document.fileName}`
    )

    for (const diagnostic of diagnostics) {
        output.appendLine(
            JSON.stringify({
                source: diagnostic.source,
                code: getDiagnosticCode(diagnostic),
                tags: diagnostic.tags,
                message: diagnostic.message,
                range: {
                    start: [
                        diagnostic.range.start.line,
                        diagnostic.range.start.character
                    ],
                    end: [
                        diagnostic.range.end.line,
                        diagnostic.range.end.character
                    ]
                },
                matched: isUnusedDiagnostic(diagnostic)
            })
        )
    }

    const ranges = diagnostics
        .filter(isUnusedDiagnostic)
        .map(diagnostic => diagnostic.range)

    output.appendLine(
        `Matched unused diagnostics: ${ranges.length}`
    )

    editor.setDecorations(
        unusedDecoration,
        ranges
    )
}

function updateAllEditors() {
    for (const editor of vscode.window.visibleTextEditors) {
        updateEditor(editor)
    }
}

function activate(context) {
    output =
        vscode.window.createOutputChannel(
            "Atom One Dark Diagnostics"
        )

    output.appendLine(
        "Atom One Dark extension ACTIVATED"
    )

    unusedDecoration =
        vscode.window.createTextEditorDecorationType({
            color: UNUSED_COLOR
        })

    context.subscriptions.push(
        output,
        unusedDecoration,

        vscode.languages.onDidChangeDiagnostics(() => {
            output.appendLine(
                "Diagnostics changed"
            )
            updateAllEditors()
        }),

        vscode.window.onDidChangeActiveTextEditor(editor => {
            updateEditor(editor)
        }),

        vscode.window.onDidChangeVisibleTextEditors(() => {
            updateAllEditors()
        })
    )

    updateAllEditors()
}

function deactivate() {
    unusedDecoration?.dispose()
    output?.dispose()
}

module.exports = {
    activate,
    deactivate
}
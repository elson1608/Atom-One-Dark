const vscode = require("vscode")

const UNUSED_COLOR = "#7f8591"
const PARAMETER_COLOR = "#d19a66"
const SQL_IDENTIFIER_COLOR = "#abb2bf"

const PARAMETER_UPDATE_DELAY_MS = 150

let unusedDecoration
let parameterDecoration
let sqlNameDecoration

const parameterUpdateTimers = new Map()
const parameterRequestVersions = new Map()

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
    const source =
        (diagnostic.source ?? "").toLowerCase()

    const code =
        getDiagnosticCode(diagnostic).toLowerCase()

    if (source === "eslint") {
        return (
            code === "no-unused-vars" ||
            code ===
                "@typescript-eslint/no-unused-vars" ||
            code ===
                "no-unused-private-class-members" ||
            code ===
                "@typescript-eslint/no-unused-private-class-members"
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

function getUnusedRanges(document) {
    return vscode.languages
        .getDiagnostics(document.uri)
        .filter(isUnusedDiagnostic)
        .map(diagnostic => diagnostic.range)
}

function updateUnusedDecoration(editor) {
    if (!editor) {
        return
    }

    editor.setDecorations(
        unusedDecoration,
        getUnusedRanges(editor.document)
    )
}

function rangesOverlap(first, second) {
    return (
        first.intersection(second) !== undefined
    )
}

async function updatePythonParameters(editor) {
    if (!editor) {
        return
    }

    if (editor.document.languageId !== "python") {
        editor.setDecorations(
            parameterDecoration,
            []
        )

        return
    }

    const document = editor.document
    const uri = document.uri
    const uriKey = uri.toString()
    const documentVersion = document.version

    const requestVersion =
        (
            parameterRequestVersions.get(
                uriKey
            ) ?? 0
        ) + 1

    parameterRequestVersions.set(
        uriKey,
        requestVersion
    )

    let legend
    let tokens

    try {
        ;[legend, tokens] =
            await Promise.all([
                vscode.commands.executeCommand(
                    "vscode.provideDocumentSemanticTokensLegend",
                    uri
                ),
                vscode.commands.executeCommand(
                    "vscode.provideDocumentSemanticTokens",
                    uri
                )
            ])
    } catch {
        editor.setDecorations(
            parameterDecoration,
            []
        )

        return
    }

    if (
        parameterRequestVersions.get(
            uriKey
        ) !== requestVersion ||
        editor.document.version !==
            documentVersion
    ) {
        return
    }

    if (
        !legend ||
        !tokens ||
        !tokens.data
    ) {
        editor.setDecorations(
            parameterDecoration,
            []
        )

        return
    }

    const unusedRanges =
        getUnusedRanges(document)

    const ranges = []

    let line = 0
    let character = 0

    for (let i = 0; i < tokens.data.length; i += 5) {
        const deltaLine =
            tokens.data[i]

        const deltaStart =
            tokens.data[i + 1]

        const length =
            tokens.data[i + 2]

        const tokenTypeIndex =
            tokens.data[i + 3]

        if (deltaLine === 0) {
            character += deltaStart
        } else {
            line += deltaLine
            character = deltaStart
        }

        if (
            legend.tokenTypes[
                tokenTypeIndex
            ] !== "parameter"
        ) {
            continue
        }

        const range =
            new vscode.Range(
                line,
                character,
                line,
                character + length
            )

        // Unused gray has priority
        // over normal parameter orange.
        if (
            unusedRanges.some(
                unusedRange =>
                    rangesOverlap(
                        range,
                        unusedRange
                    )
            )
        ) {
            continue
        }

        ranges.push(range)
    }

    editor.setDecorations(
        parameterDecoration,
        ranges
    )
}

function schedulePythonParameterUpdate(
    editor
) {
    if (!editor) {
        return
    }

    const uriKey =
        editor.document.uri.toString()

    const existingTimer =
        parameterUpdateTimers.get(
            uriKey
        )

    if (existingTimer) {
        clearTimeout(existingTimer)
    }

    const timer = setTimeout(
        () => {
            parameterUpdateTimers.delete(
                uriKey
            )

            void updatePythonParameters(
                editor
            )
        },
        PARAMETER_UPDATE_DELAY_MS
    )

    parameterUpdateTimers.set(
        uriKey,
        timer
    )
}

function getSqlNameRanges(document) {
    if (document.languageId !== "sql") {
        return []
    }

    const text = document.getText()
    const ranges = []

    let index = 0

    while (index < text.length) {
        const character = text[index]
        const next = text[index + 1]

        // -- line comment
        if (
            character === "-" &&
            next === "-"
        ) {
            index += 2

            while (
                index < text.length &&
                text[index] !== "\n"
            ) {
                index++
            }

            continue
        }

        // /* block comment */
        if (
            character === "/" &&
            next === "*"
        ) {
            index += 2

            let depth = 1

            while (
                index < text.length &&
                depth > 0
            ) {
                if (
                    text[index] === "/" &&
                    text[index + 1] === "*"
                ) {
                    depth++
                    index += 2
                    continue
                }

                if (
                    text[index] === "*" &&
                    text[index + 1] === "/"
                ) {
                    depth--
                    index += 2
                    continue
                }

                index++
            }

            continue
        }

        // 'string'
        if (character === "'") {
            index++

            while (index < text.length) {
                if (text[index] !== "'") {
                    index++
                    continue
                }

                // Escaped quote: ''
                if (text[index + 1] === "'") {
                    index += 2
                    continue
                }

                index++
                break
            }

            continue
        }

        // "quoted identifier"
        if (character === '"') {
            index++

            while (index < text.length) {
                if (text[index] !== '"') {
                    index++
                    continue
                }

                // Escaped quote: ""
                if (text[index + 1] === '"') {
                    index += 2
                    continue
                }

                index++
                break
            }

            continue
        }

        const remaining =
            text.slice(index)

        const match =
            remaining.match(
                /^(name)\b/i
            )

        if (!match) {
            index++
            continue
        }

        const previous =
            index > 0
                ? text[index - 1]
                : ""

        // Make sure this is the start
        // of an identifier.
        if (
            /[A-Za-z0-9_$]/.test(
                previous
            )
        ) {
            index++
            continue
        }

        const start = index
        const end =
            index + match[0].length

        ranges.push(
            new vscode.Range(
                document.positionAt(start),
                document.positionAt(end)
            )
        )

        index = end
    }

    return ranges
}

function updateSqlNameDecoration(editor) {
    if (!editor) {
        return
    }

    editor.setDecorations(
        sqlNameDecoration,
        getSqlNameRanges(
            editor.document
        )
    )
}

function updateEditor(editor) {
    if (!editor) {
        return
    }

    updateUnusedDecoration(editor)
    updateSqlNameDecoration(editor)

    schedulePythonParameterUpdate(editor)
}

function updateAllEditors() {
    for (
        const editor of
        vscode.window.visibleTextEditors
    ) {
        updateEditor(editor)
    }
}

function activate(context) {
    unusedDecoration =
        vscode.window
            .createTextEditorDecorationType({
                color: UNUSED_COLOR
            })

    parameterDecoration =
        vscode.window
            .createTextEditorDecorationType({
                color: PARAMETER_COLOR
            })

    sqlNameDecoration =
        vscode.window
            .createTextEditorDecorationType({
                color: SQL_IDENTIFIER_COLOR
            })

    context.subscriptions.push(
        unusedDecoration,
        parameterDecoration,
        sqlNameDecoration,

        vscode.languages
            .onDidChangeDiagnostics(
                () => {
                    updateAllEditors()
                }
            ),

        vscode.window
            .onDidChangeActiveTextEditor(
                editor => {
                    updateEditor(editor)
                }
            ),

        vscode.window
            .onDidChangeVisibleTextEditors(
                () => {
                    updateAllEditors()
                }
            ),

        vscode.workspace
            .onDidChangeTextDocument(
                event => {
                    for (
                        const editor of
                        vscode.window
                            .visibleTextEditors
                    ) {
                        if (
                            editor.document.uri
                                .toString() !==
                            event.document.uri
                                .toString()
                        ) {
                            continue
                        }

                        updateUnusedDecoration(
                            editor
                        )

                        updateSqlNameDecoration(
                            editor
                        )

                        schedulePythonParameterUpdate(
                            editor
                        )
                    }
                }
            )
    )

    updateAllEditors()
}

function deactivate() {
    for (
        const timer of
        parameterUpdateTimers.values()
    ) {
        clearTimeout(timer)
    }

    parameterUpdateTimers.clear()
    parameterRequestVersions.clear()

    unusedDecoration?.dispose()
    parameterDecoration?.dispose()
    sqlNameDecoration?.dispose()
}

module.exports = {
    activate,
    deactivate
}
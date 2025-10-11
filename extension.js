const vscode = require('vscode');

function activate(context) {
  const disposable = vscode.commands.registerCommand('theme.applyRecommendedFont', async () => {
    const cfg = vscode.workspace.getConfiguration();
    await cfg.update('editor.fontFamily', "JetBrains Mono", vscode.ConfigurationTarget.Global);
    await cfg.update('editor.fontLigatures', true, vscode.ConfigurationTarget.Global);
    await cfg.update('terminal.integrated.fontFamily', "JetBrains Mono", vscode.ConfigurationTarget.Global);
    await cfg.update('debug.console.fontFamily', "JetBrains Mono", vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage("Applied recommended font settings. Make sure JetBrains Mono is installed on your OS.");
  });
  context.subscriptions.push(disposable);
}

function deactivate() {}
module.exports = { activate, deactivate };

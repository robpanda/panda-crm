import * as vscode from "vscode";
import { AgentController } from "./agent/AgentController";

export function activate(context: vscode.ExtensionContext) {
  const agent = new AgentController(context);

  context.subscriptions.push(
    vscode.commands.registerCommand("panda-crm.openChat", () => {
      agent.openChat();
    })
  );
}

export function deactivate() {}

import * as vscode from "vscode";
import { SYSTEM_PROMPT } from "./system";
import { ROUTING_PROMPT } from "./routing";
import { INTERPRETER_PROMPT } from "./interpreter";
import { EXECUTOR_PROMPT } from "./executor";

export class PromptStore {
  constructor(private readonly context: vscode.ExtensionContext) {
    this.initializeDefaults();
  }

  private initializeDefaults() {
    // Always update prompts to ensure latest versions are used
    this.forceUpdate("system", SYSTEM_PROMPT);
    this.forceUpdate("routing", ROUTING_PROMPT);
    this.forceUpdate("interpreter", INTERPRETER_PROMPT);
    this.forceUpdate("executor", EXECUTOR_PROMPT);
  }

  private forceUpdate(key: string, value: string) {
    const fullKey = `pandaCrm.prompt.${key}`;
    this.context.globalState.update(fullKey, value);
  }

  get(key: "system" | "routing" | "interpreter" | "executor"): string {
    return this.context.globalState.get(
      `pandaCrm.prompt.${key}`,
      ""
    );
  }
}

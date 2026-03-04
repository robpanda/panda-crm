import * as vscode from "vscode";
export declare class PromptStore {
    private readonly context;
    constructor(context: vscode.ExtensionContext);
    private initializeDefaults;
    private forceUpdate;
    get(key: "system" | "routing" | "interpreter" | "executor"): string;
}
//# sourceMappingURL=PromptStore.d.ts.map
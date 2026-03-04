import * as vscode from "vscode";
export declare class AgentController {
    private readonly context;
    private readonly secretsService;
    private readonly claudeClient;
    private readonly memoryService;
    private readonly promptStore;
    private currentConversation;
    private chatWebview;
    constructor(context: vscode.ExtensionContext);
    openChat(): void;
    private handleWebviewMessage;
    private sendMessage;
    private startNewConversation;
    private loadConversation;
    private deleteConversation;
    private loadCurrentConversation;
    private refreshConversationList;
}
//# sourceMappingURL=AgentController.d.ts.map
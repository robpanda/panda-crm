import * as vscode from "vscode";
import { ClaudeMessage } from "../ClaudeClient";
import { ConversationSummary } from "../services/MemoryService";
export interface WebviewMessage {
    type: "sendMessage" | "newConversation" | "loadConversation" | "deleteConversation" | "getConversations" | "ready";
    payload?: {
        content?: string;
        conversationId?: string;
    };
}
export interface ExtensionMessage {
    type: "addMessage" | "setMessages" | "setConversations" | "setLoading" | "setError" | "clearInput";
    payload?: {
        message?: ClaudeMessage;
        messages?: ClaudeMessage[];
        conversations?: ConversationSummary[];
        loading?: boolean;
        error?: string;
    };
}
export declare class ChatWebview {
    private static panelCount;
    private static activePanels;
    private readonly _panel;
    private readonly _extensionUri;
    private readonly _panelId;
    private _disposables;
    private _messageHandler?;
    private constructor();
    static create(extensionUri: vscode.Uri): ChatWebview;
    static getActivePanelCount(): number;
    onMessage(handler: (message: WebviewMessage) => void): void;
    postMessage(message: ExtensionMessage): void;
    dispose(): void;
    private _getHtmlContent;
}
//# sourceMappingURL=ChatWebview.d.ts.map
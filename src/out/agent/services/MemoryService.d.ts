import { ClaudeMessage } from "../ClaudeClient";
export interface Conversation {
    id: string;
    title: string;
    messages: ClaudeMessage[];
    createdAt: string;
    updatedAt: string;
    metadata?: {
        model?: string;
        totalTokens?: number;
        taskSpec?: string;
    };
}
export interface ConversationSummary {
    id: string;
    title: string;
    messageCount: number;
    createdAt: string;
    updatedAt: string;
}
export declare class MemoryService {
    private client;
    private bucket;
    private prefix;
    constructor();
    private getKey;
    saveConversation(conversation: Conversation): Promise<void>;
    getConversation(conversationId: string): Promise<Conversation | null>;
    listConversations(limit?: number): Promise<ConversationSummary[]>;
    deleteConversation(conversationId: string): Promise<void>;
    appendMessage(conversationId: string, message: ClaudeMessage): Promise<Conversation>;
    private generateTitle;
    generateConversationId(): string;
}
//# sourceMappingURL=MemoryService.d.ts.map
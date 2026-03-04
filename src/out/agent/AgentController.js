"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentController = void 0;
const vscode = __importStar(require("vscode"));
const PromptStore_1 = require("./prompts/PromptStore");
const ClaudeClient_1 = require("./ClaudeClient");
const SecretsService_1 = require("./services/SecretsService");
const MemoryService_1 = require("./services/MemoryService");
const ChatWebview_1 = require("./ui/ChatWebview");
class AgentController {
    context;
    secretsService;
    claudeClient;
    memoryService;
    promptStore;
    currentConversation = null;
    chatWebview = null;
    constructor(context) {
        this.context = context;
        this.secretsService = new SecretsService_1.SecretsService();
        this.claudeClient = new ClaudeClient_1.ClaudeClient(this.secretsService);
        this.memoryService = new MemoryService_1.MemoryService();
        this.promptStore = new PromptStore_1.PromptStore(context);
    }
    openChat() {
        this.chatWebview = ChatWebview_1.ChatWebview.create(this.context.extensionUri);
        this.chatWebview.onMessage(async (message) => {
            await this.handleWebviewMessage(message);
        });
    }
    async handleWebviewMessage(message) {
        if (!this.chatWebview)
            return;
        try {
            switch (message.type) {
                case "ready":
                    await this.loadCurrentConversation();
                    break;
                case "sendMessage":
                    if (message.payload?.content) {
                        await this.sendMessage(message.payload.content);
                    }
                    break;
                case "newConversation":
                    await this.startNewConversation();
                    break;
                case "loadConversation":
                    if (message.payload?.conversationId) {
                        await this.loadConversation(message.payload.conversationId);
                    }
                    break;
                case "deleteConversation":
                    if (message.payload?.conversationId) {
                        await this.deleteConversation(message.payload.conversationId);
                    }
                    break;
                case "getConversations":
                    await this.refreshConversationList();
                    break;
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.chatWebview.postMessage({
                type: "setError",
                payload: { error: errorMessage },
            });
            this.chatWebview.postMessage({
                type: "setLoading",
                payload: { loading: false },
            });
        }
    }
    async sendMessage(content) {
        if (!this.chatWebview)
            return;
        // Clear any previous errors
        this.chatWebview.postMessage({ type: "setError", payload: { error: "" } });
        // Create new conversation if needed
        if (!this.currentConversation) {
            const conversationId = this.memoryService.generateConversationId();
            this.currentConversation = {
                id: conversationId,
                title: content.substring(0, 50),
                messages: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
        }
        // Add user message
        const userMessage = { role: "user", content };
        this.currentConversation.messages.push(userMessage);
        // Update UI
        this.chatWebview.postMessage({
            type: "addMessage",
            payload: { message: userMessage },
        });
        this.chatWebview.postMessage({ type: "clearInput" });
        this.chatWebview.postMessage({
            type: "setLoading",
            payload: { loading: true },
        });
        try {
            // Get system prompt
            const systemPrompt = this.promptStore.get("system");
            // Get model from config
            const config = vscode.workspace.getConfiguration("pandaClaude");
            const model = config.get("defaultModel", "claude-sonnet-4-20250514");
            // Call Claude
            const { response, usage } = await this.claudeClient.generateWithHistory(this.currentConversation.messages, {
                model,
                system: systemPrompt,
                max_tokens: 4096,
            });
            // Add assistant response
            const assistantMessage = { role: "assistant", content: response };
            this.currentConversation.messages.push(assistantMessage);
            // Update metadata
            this.currentConversation.metadata = {
                ...this.currentConversation.metadata,
                model,
                totalTokens: (this.currentConversation.metadata?.totalTokens ?? 0) +
                    usage.input_tokens + usage.output_tokens,
            };
            // Save to S3
            await this.memoryService.saveConversation(this.currentConversation);
            // Update UI
            this.chatWebview.postMessage({
                type: "addMessage",
                payload: { message: assistantMessage },
            });
            // Refresh conversation list
            await this.refreshConversationList();
        }
        finally {
            this.chatWebview.postMessage({
                type: "setLoading",
                payload: { loading: false },
            });
        }
    }
    async startNewConversation() {
        this.currentConversation = null;
        if (this.chatWebview) {
            this.chatWebview.postMessage({
                type: "setMessages",
                payload: { messages: [] },
            });
        }
    }
    async loadConversation(conversationId) {
        if (!this.chatWebview)
            return;
        const conversation = await this.memoryService.getConversation(conversationId);
        if (conversation) {
            this.currentConversation = conversation;
            this.chatWebview.postMessage({
                type: "setMessages",
                payload: { messages: conversation.messages },
            });
        }
    }
    async deleteConversation(conversationId) {
        await this.memoryService.deleteConversation(conversationId);
        // If deleting current conversation, clear it
        if (this.currentConversation?.id === conversationId) {
            await this.startNewConversation();
        }
        await this.refreshConversationList();
    }
    async loadCurrentConversation() {
        // Load most recent conversation or start fresh
        const conversations = await this.memoryService.listConversations(1);
        if (conversations.length > 0) {
            await this.loadConversation(conversations[0].id);
        }
        await this.refreshConversationList();
    }
    async refreshConversationList() {
        if (!this.chatWebview)
            return;
        const conversations = await this.memoryService.listConversations(50);
        this.chatWebview.postMessage({
            type: "setConversations",
            payload: { conversations },
        });
    }
}
exports.AgentController = AgentController;
//# sourceMappingURL=AgentController.js.map
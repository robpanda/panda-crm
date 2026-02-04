import * as vscode from "vscode";
import { PromptStore } from "./prompts/PromptStore";
import { ClaudeClient, ClaudeMessage } from "./ClaudeClient";
import { SecretsService } from "./services/SecretsService";
import { MemoryService, Conversation } from "./services/MemoryService";
import { ChatWebview, WebviewMessage } from "./ui/ChatWebview";

export class AgentController {
  private readonly secretsService: SecretsService;
  private readonly claudeClient: ClaudeClient;
  private readonly memoryService: MemoryService;
  private readonly promptStore: PromptStore;
  private currentConversation: Conversation | null = null;
  private chatWebview: ChatWebview | null = null;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.secretsService = new SecretsService();
    this.claudeClient = new ClaudeClient(this.secretsService);
    this.memoryService = new MemoryService();
    this.promptStore = new PromptStore(context);
  }

  openChat(): void {
    this.chatWebview = ChatWebview.create(this.context.extensionUri);

    this.chatWebview.onMessage(async (message: WebviewMessage) => {
      await this.handleWebviewMessage(message);
    });
  }

  private async handleWebviewMessage(message: WebviewMessage): Promise<void> {
    if (!this.chatWebview) return;

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
    } catch (error) {
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

  private async sendMessage(content: string): Promise<void> {
    if (!this.chatWebview) return;

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
    const userMessage: ClaudeMessage = { role: "user", content };
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
      const model = config.get<string>("defaultModel", "claude-sonnet-4-20250514");

      // Call Claude
      const { response, usage } = await this.claudeClient.generateWithHistory(
        this.currentConversation.messages,
        {
          model,
          system: systemPrompt,
          max_tokens: 4096,
        }
      );

      // Add assistant response
      const assistantMessage: ClaudeMessage = { role: "assistant", content: response };
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
    } finally {
      this.chatWebview.postMessage({
        type: "setLoading",
        payload: { loading: false },
      });
    }
  }

  private async startNewConversation(): Promise<void> {
    this.currentConversation = null;

    if (this.chatWebview) {
      this.chatWebview.postMessage({
        type: "setMessages",
        payload: { messages: [] },
      });
    }
  }

  private async loadConversation(conversationId: string): Promise<void> {
    if (!this.chatWebview) return;

    const conversation = await this.memoryService.getConversation(conversationId);

    if (conversation) {
      this.currentConversation = conversation;
      this.chatWebview.postMessage({
        type: "setMessages",
        payload: { messages: conversation.messages },
      });
    }
  }

  private async deleteConversation(conversationId: string): Promise<void> {
    await this.memoryService.deleteConversation(conversationId);

    // If deleting current conversation, clear it
    if (this.currentConversation?.id === conversationId) {
      await this.startNewConversation();
    }

    await this.refreshConversationList();
  }

  private async loadCurrentConversation(): Promise<void> {
    // Load most recent conversation or start fresh
    const conversations = await this.memoryService.listConversations(1);

    if (conversations.length > 0) {
      await this.loadConversation(conversations[0].id);
    }

    await this.refreshConversationList();
  }

  private async refreshConversationList(): Promise<void> {
    if (!this.chatWebview) return;

    const conversations = await this.memoryService.listConversations(50);

    this.chatWebview.postMessage({
      type: "setConversations",
      payload: { conversations },
    });
  }
}

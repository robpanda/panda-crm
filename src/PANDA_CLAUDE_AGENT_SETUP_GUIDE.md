# Panda Claude Agent - VS Code Extension Setup Guide

This guide contains everything needed to recreate the Panda Claude Agent VS Code extension on a new system with a different AWS account.

## Overview

The Panda Claude Agent is a VS Code extension that:
- Provides a chat interface to Claude AI
- Supports multiple chat panels simultaneously
- Syncs conversations across devices via AWS S3
- Securely stores API keys in AWS Secrets Manager

---

## Directory Structure

```
panda-claude-agent/
├── package.json
├── tsconfig.json
├── extension.ts
└── agent/
    ├── AgentController.ts
    ├── ClaudeClient.ts
    ├── services/
    │   ├── SecretsService.ts
    │   └── MemoryService.ts
    ├── ui/
    │   └── ChatWebview.ts
    └── prompts/
        ├── index.ts
        ├── PromptStore.ts
        ├── system.ts
        ├── routing.ts
        ├── interpreter.ts
        └── executor.ts
```

---

## AWS Setup Instructions

### 1. Create S3 Bucket for Conversation Storage

```bash
# Replace YOUR_BUCKET_NAME with your desired bucket name
aws s3 mb s3://YOUR_BUCKET_NAME --region us-east-2

# Enable versioning (optional but recommended)
aws s3api put-bucket-versioning \
  --bucket YOUR_BUCKET_NAME \
  --versioning-configuration Status=Enabled
```

### 2. Create Secrets Manager Secret for Claude API Key

```bash
# Option A: Store as JSON (recommended)
aws secretsmanager create-secret \
  --name "panda-claude-agent/api-key" \
  --description "Claude API key for Panda Claude Agent" \
  --secret-string '{"CLAUDE_API_KEY":"sk-ant-api03-YOUR_API_KEY_HERE"}' \
  --region us-east-2

# Option B: Store as plain string
aws secretsmanager create-secret \
  --name "panda-claude-agent/api-key" \
  --description "Claude API key for Panda Claude Agent" \
  --secret-string "sk-ant-api03-YOUR_API_KEY_HERE" \
  --region us-east-2
```

### 3. Configure AWS Credentials

Ensure your local AWS credentials are configured:

```bash
aws configure
# Enter your AWS Access Key ID
# Enter your AWS Secret Access Key
# Default region: us-east-2
# Default output format: json
```

Or set environment variables:
```bash
export AWS_ACCESS_KEY_ID=your_access_key
export AWS_SECRET_ACCESS_KEY=your_secret_key
export AWS_REGION=us-east-2
```

---

## Source Code Files

### 1. package.json

```json
{
  "name": "panda-claude-agent",
  "displayName": "Panda Claude Agent",
  "description": "AI assistant for Panda CRM development with cross-device sync",
  "version": "0.1.0",
  "publisher": "panda-exteriors",
  "engines": {
    "vscode": "^1.85.0"
  },
  "categories": [
    "Other"
  ],
  "activationEvents": [
    "onCommand:panda-crm.openChat"
  ],
  "main": "./out/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "panda-crm.openChat",
        "title": "Open Panda Claude Chat"
      }
    ],
    "keybindings": [
      {
        "command": "panda-crm.openChat",
        "key": "ctrl+shift+p",
        "mac": "cmd+shift+p"
      }
    ],
    "configuration": {
      "title": "Panda Claude Agent",
      "properties": {
        "pandaClaude.awsRegion": {
          "type": "string",
          "default": "us-east-2",
          "description": "AWS region for Secrets Manager and S3"
        },
        "pandaClaude.secretName": {
          "type": "string",
          "default": "panda-claude-agent/api-key",
          "description": "Name of the secret in AWS Secrets Manager containing the Claude API key"
        },
        "pandaClaude.s3Bucket": {
          "type": "string",
          "default": "panda-claude-agent-memory",
          "description": "S3 bucket name for storing conversation history"
        },
        "pandaClaude.defaultModel": {
          "type": "string",
          "default": "claude-sonnet-4-20250514",
          "description": "Default Claude model to use"
        }
      }
    }
  },
  "scripts": {
    "vscode:prepublish": "npm run compile",
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "pretest": "npm run compile"
  },
  "dependencies": {
    "@aws-sdk/client-s3": "^3.500.0",
    "@aws-sdk/client-secrets-manager": "^3.500.0"
  },
  "devDependencies": {
    "@types/node": "^20.x",
    "@types/vscode": "^1.85.0",
    "typescript": "^5.3.0"
  }
}
```

### 2. tsconfig.json

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "lib": ["ES2022"],
    "outDir": "out",
    "rootDir": ".",
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true
  },
  "include": [
    "*.ts",
    "agent/**/*.ts"
  ],
  "exclude": [
    "node_modules",
    "out"
  ]
}
```

### 3. extension.ts

```typescript
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
```

### 4. agent/AgentController.ts

```typescript
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
```

### 5. agent/ClaudeClient.ts

```typescript
import { SecretsService } from "./services/SecretsService";

// Claude API Types
export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ClaudeRequest {
  prompt: string;
  model: string;
  max_tokens?: number;
  system?: string;
  messages?: ClaudeMessage[];
}

export interface ClaudeContentBlock {
  type: "text" | "tool_use";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

export interface ClaudeResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: ClaudeContentBlock[];
  model: string;
  stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use";
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface ClaudeErrorResponse {
  type: "error";
  error: {
    type: string;
    message: string;
  };
}

export class ClaudeClient {
  private apiKey: string | null = null;
  private secretsService: SecretsService;

  constructor(secretsService: SecretsService) {
    this.secretsService = secretsService;
  }

  private async ensureApiKey(): Promise<string> {
    if (!this.apiKey) {
      this.apiKey = await this.secretsService.getClaudeApiKey();
    }
    return this.apiKey;
  }

  async generate(request: ClaudeRequest): Promise<string> {
    const apiKey = await this.ensureApiKey();

    // Build messages array
    const messages: ClaudeMessage[] = request.messages ?? [
      { role: "user", content: request.prompt }
    ];

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: request.model,
        max_tokens: request.max_tokens ?? 4096,
        system: request.system,
        messages,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      let errorMessage = `Claude API error: ${res.status}`;

      try {
        const errorJson = JSON.parse(errorText) as ClaudeErrorResponse;
        errorMessage = `Claude API error: ${errorJson.error.type} - ${errorJson.error.message}`;
      } catch {
        errorMessage = `Claude API error: ${res.status} ${errorText}`;
      }

      throw new Error(errorMessage);
    }

    const data = await res.json() as ClaudeResponse;

    // Extract text from content blocks
    const textContent = data.content
      .filter((block): block is ClaudeContentBlock & { text: string } =>
        block.type === "text" && typeof block.text === "string"
      )
      .map(block => block.text)
      .join("\n");

    return textContent;
  }

  async generateWithHistory(
    messages: ClaudeMessage[],
    options: { model: string; max_tokens?: number; system?: string }
  ): Promise<{ response: string; usage: { input_tokens: number; output_tokens: number } }> {
    const apiKey = await this.ensureApiKey();

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options.model,
        max_tokens: options.max_tokens ?? 4096,
        system: options.system,
        messages,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Claude API error: ${res.status} ${errorText}`);
    }

    const data = await res.json() as ClaudeResponse;

    const textContent = data.content
      .filter((block): block is ClaudeContentBlock & { text: string } =>
        block.type === "text" && typeof block.text === "string"
      )
      .map(block => block.text)
      .join("\n");

    return {
      response: textContent,
      usage: data.usage,
    };
  }
}
```

### 6. agent/services/SecretsService.ts

```typescript
import * as vscode from "vscode";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

export class SecretsService {
  private client: SecretsManagerClient;
  private cachedApiKey: string | null = null;
  private secretName: string;

  constructor() {
    const config = vscode.workspace.getConfiguration("pandaClaude");
    const region = config.get<string>("awsRegion", "us-east-2");
    this.secretName = config.get<string>(
      "secretName",
      "panda-claude-agent/api-key"
    );

    this.client = new SecretsManagerClient({ region });
  }

  async getClaudeApiKey(): Promise<string> {
    if (this.cachedApiKey) {
      return this.cachedApiKey;
    }

    try {
      const command = new GetSecretValueCommand({
        SecretId: this.secretName,
      });

      const response = await this.client.send(command);

      if (!response.SecretString) {
        throw new Error("Secret value is empty");
      }

      // Try to parse as JSON first (for {"CLAUDE_API_KEY": "..."} format)
      try {
        const parsed = JSON.parse(response.SecretString);
        if (parsed.CLAUDE_API_KEY) {
          this.cachedApiKey = parsed.CLAUDE_API_KEY;
          return this.cachedApiKey;
        }
      } catch {
        // Not JSON, use as plain string
      }

      // Use as plain string
      this.cachedApiKey = response.SecretString;
      return this.cachedApiKey;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error(
        `Failed to retrieve Claude API key from Secrets Manager: ${message}`
      );
    }
  }

  clearCache(): void {
    this.cachedApiKey = null;
  }
}
```

### 7. agent/services/MemoryService.ts

```typescript
import * as vscode from "vscode";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
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
    tags?: string[];
  };
}

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export class MemoryService {
  private client: S3Client;
  private bucket: string;
  private prefix: string;

  constructor() {
    const config = vscode.workspace.getConfiguration("pandaClaude");
    const region = config.get<string>("awsRegion", "us-east-2");
    this.bucket = config.get<string>("s3Bucket", "panda-claude-agent-memory");

    // Use workspace name as prefix for organization
    const workspaceName =
      vscode.workspace.workspaceFolders?.[0]?.name ?? "default";
    this.prefix = `conversations/${workspaceName}`;

    this.client = new S3Client({ region });
  }

  async saveConversation(conversation: Conversation): Promise<void> {
    const key = `${this.prefix}/${conversation.id}.json`;

    conversation.updatedAt = new Date().toISOString();

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: JSON.stringify(conversation, null, 2),
      ContentType: "application/json",
    });

    await this.client.send(command);
  }

  async getConversation(id: string): Promise<Conversation | null> {
    const key = `${this.prefix}/${id}.json`;

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.client.send(command);

      if (!response.Body) {
        return null;
      }

      const bodyString = await response.Body.transformToString();
      return JSON.parse(bodyString) as Conversation;
    } catch (error) {
      // Return null if not found
      if (
        error instanceof Error &&
        error.name === "NoSuchKey"
      ) {
        return null;
      }
      throw error;
    }
  }

  async listConversations(limit: number = 50): Promise<ConversationSummary[]> {
    const command = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: this.prefix,
      MaxKeys: limit,
    });

    const response = await this.client.send(command);

    if (!response.Contents) {
      return [];
    }

    const summaries: ConversationSummary[] = [];

    for (const item of response.Contents) {
      if (!item.Key) continue;

      try {
        const conversation = await this.getConversation(
          item.Key.replace(`${this.prefix}/`, "").replace(".json", "")
        );

        if (conversation) {
          summaries.push({
            id: conversation.id,
            title: conversation.title,
            createdAt: conversation.createdAt,
            updatedAt: conversation.updatedAt,
            messageCount: conversation.messages.length,
          });
        }
      } catch {
        // Skip invalid conversations
      }
    }

    // Sort by updatedAt descending
    return summaries.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  async deleteConversation(id: string): Promise<void> {
    const key = `${this.prefix}/${id}.json`;

    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await this.client.send(command);
  }

  async appendMessage(
    conversationId: string,
    message: ClaudeMessage
  ): Promise<void> {
    const conversation = await this.getConversation(conversationId);

    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    conversation.messages.push(message);
    await this.saveConversation(conversation);
  }

  generateConversationId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `conv_${timestamp}_${random}`;
  }
}
```

### 8. agent/ui/ChatWebview.ts

```typescript
import * as vscode from "vscode";
import { ClaudeMessage } from "../ClaudeClient";
import { ConversationSummary } from "../services/MemoryService";

export interface WebviewMessage {
  type: string;
  payload?: {
    content?: string;
    conversationId?: string;
  };
}

export class ChatWebview {
  private _panel: vscode.WebviewPanel;
  private _extensionUri: vscode.Uri;
  private _messageHandler?: (message: WebviewMessage) => void;
  private _panelId: number;

  // Static tracking for multi-panel support
  private static panelCount = 0;
  private static activePanels: Set<ChatWebview> = new Set();

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    panelId: number
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._panelId = panelId;

    ChatWebview.activePanels.add(this);

    this._panel.webview.html = this._getHtmlContent();

    this._panel.onDidDispose(() => this.dispose());

    this._panel.webview.onDidReceiveMessage((message: WebviewMessage) => {
      if (this._messageHandler) {
        this._messageHandler(message);
      }
    });
  }

  public static create(extensionUri: vscode.Uri): ChatWebview {
    ChatWebview.panelCount++;
    const panelId = ChatWebview.panelCount;

    const title =
      panelId === 1
        ? "Panda Claude Agent"
        : `Panda Claude Agent #${panelId}`;

    const panel = vscode.window.createWebviewPanel(
      "pandaClaudeChat",
      title,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      }
    );

    return new ChatWebview(panel, extensionUri, panelId);
  }

  public static getActiveCount(): number {
    return ChatWebview.activePanels.size;
  }

  public onMessage(handler: (message: WebviewMessage) => void): void {
    this._messageHandler = handler;
  }

  public postMessage(message: {
    type: string;
    payload?: {
      message?: ClaudeMessage;
      messages?: ClaudeMessage[];
      conversations?: ConversationSummary[];
      loading?: boolean;
      error?: string;
    };
  }): void {
    this._panel.webview.postMessage(message);
  }

  public dispose(): void {
    ChatWebview.activePanels.delete(this);
    this._panel.dispose();
  }

  private _getHtmlContent(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Panda Claude Agent</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: #1e1e1e;
      color: #e0e0e0;
      height: 100vh;
      display: flex;
    }

    /* Sidebar */
    .sidebar {
      width: 260px;
      background: #252526;
      border-right: 1px solid #3c3c3c;
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
    }

    .sidebar-header {
      padding: 16px;
      border-bottom: 1px solid #3c3c3c;
    }

    .new-chat-btn {
      width: 100%;
      padding: 10px 16px;
      background: #0e639c;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    .new-chat-btn:hover {
      background: #1177bb;
    }

    .conversation-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }

    .conversation-item {
      padding: 12px;
      border-radius: 6px;
      cursor: pointer;
      margin-bottom: 4px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .conversation-item:hover {
      background: #2d2d2d;
    }

    .conversation-item.active {
      background: #37373d;
    }

    .conversation-title {
      font-size: 13px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
    }

    .conversation-delete {
      opacity: 0;
      background: none;
      border: none;
      color: #e0e0e0;
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
    }

    .conversation-item:hover .conversation-delete {
      opacity: 0.6;
    }

    .conversation-delete:hover {
      opacity: 1 !important;
      background: #5a1d1d;
    }

    /* Main Chat Area */
    .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .chat-header {
      padding: 16px 20px;
      border-bottom: 1px solid #3c3c3c;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .chat-header h1 {
      font-size: 16px;
      font-weight: 600;
      color: #e0e0e0;
    }

    .messages-container {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
    }

    .message {
      margin-bottom: 20px;
      display: flex;
      gap: 12px;
    }

    .message-avatar {
      width: 32px;
      height: 32px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 600;
      flex-shrink: 0;
    }

    .message.user .message-avatar {
      background: #0e639c;
    }

    .message.assistant .message-avatar {
      background: #6b4fbb;
    }

    .message-content {
      flex: 1;
      line-height: 1.6;
      font-size: 14px;
    }

    .message-content pre {
      background: #2d2d2d;
      padding: 12px;
      border-radius: 6px;
      overflow-x: auto;
      margin: 8px 0;
    }

    .message-content code {
      font-family: 'Fira Code', 'Consolas', monospace;
      font-size: 13px;
    }

    /* Input Area */
    .input-container {
      padding: 16px 20px;
      border-top: 1px solid #3c3c3c;
      background: #252526;
    }

    .input-wrapper {
      display: flex;
      gap: 12px;
      align-items: flex-end;
    }

    .input-wrapper textarea {
      flex: 1;
      padding: 12px 16px;
      background: #3c3c3c;
      border: 1px solid #4c4c4c;
      border-radius: 8px;
      color: #e0e0e0;
      font-size: 14px;
      font-family: inherit;
      resize: none;
      min-height: 44px;
      max-height: 200px;
    }

    .input-wrapper textarea:focus {
      outline: none;
      border-color: #0e639c;
    }

    .send-btn {
      padding: 12px 20px;
      background: #0e639c;
      color: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
    }

    .send-btn:hover {
      background: #1177bb;
    }

    .send-btn:disabled {
      background: #4c4c4c;
      cursor: not-allowed;
    }

    /* Loading indicator */
    .loading {
      display: flex;
      gap: 4px;
      padding: 8px 0;
    }

    .loading span {
      width: 8px;
      height: 8px;
      background: #6b4fbb;
      border-radius: 50%;
      animation: bounce 1.4s infinite ease-in-out both;
    }

    .loading span:nth-child(1) { animation-delay: -0.32s; }
    .loading span:nth-child(2) { animation-delay: -0.16s; }

    @keyframes bounce {
      0%, 80%, 100% { transform: scale(0); }
      40% { transform: scale(1); }
    }

    /* Error message */
    .error {
      background: #5a1d1d;
      color: #f48771;
      padding: 12px 16px;
      border-radius: 6px;
      margin-bottom: 16px;
      font-size: 13px;
    }

    /* Empty state */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #808080;
      text-align: center;
      padding: 40px;
    }

    .empty-state h2 {
      font-size: 20px;
      margin-bottom: 8px;
      color: #e0e0e0;
    }

    .empty-state p {
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="sidebar">
    <div class="sidebar-header">
      <button class="new-chat-btn" onclick="newConversation()">
        + New Chat
      </button>
    </div>
    <div class="conversation-list" id="conversationList">
      <!-- Conversations will be populated here -->
    </div>
  </div>

  <div class="main-content">
    <div class="chat-header">
      <h1>Panda Claude Agent</h1>
    </div>

    <div class="messages-container" id="messagesContainer">
      <div class="empty-state" id="emptyState">
        <h2>Welcome to Panda Claude Agent</h2>
        <p>Start a conversation by typing a message below.</p>
      </div>
    </div>

    <div class="input-container">
      <div id="errorContainer"></div>
      <div class="input-wrapper">
        <textarea
          id="messageInput"
          placeholder="Type your message..."
          rows="1"
          onkeydown="handleKeyDown(event)"
          oninput="autoResize(this)"
        ></textarea>
        <button class="send-btn" id="sendBtn" onclick="sendMessage()">Send</button>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let isLoading = false;
    let currentConversationId = null;

    // Initialize
    vscode.postMessage({ type: 'ready' });

    // Handle messages from extension
    window.addEventListener('message', event => {
      const message = event.data;

      switch (message.type) {
        case 'addMessage':
          addMessage(message.payload.message);
          break;
        case 'setMessages':
          setMessages(message.payload.messages);
          break;
        case 'setConversations':
          setConversations(message.payload.conversations);
          break;
        case 'setLoading':
          setLoading(message.payload.loading);
          break;
        case 'setError':
          setError(message.payload.error);
          break;
        case 'clearInput':
          document.getElementById('messageInput').value = '';
          autoResize(document.getElementById('messageInput'));
          break;
      }
    });

    function addMessage(msg) {
      hideEmptyState();
      const container = document.getElementById('messagesContainer');
      const messageEl = createMessageElement(msg);
      container.appendChild(messageEl);
      container.scrollTop = container.scrollHeight;
    }

    function setMessages(messages) {
      const container = document.getElementById('messagesContainer');
      container.innerHTML = '';

      if (messages.length === 0) {
        showEmptyState();
        return;
      }

      hideEmptyState();
      messages.forEach(msg => {
        container.appendChild(createMessageElement(msg));
      });
      container.scrollTop = container.scrollHeight;
    }

    function createMessageElement(msg) {
      const div = document.createElement('div');
      div.className = 'message ' + msg.role;

      const avatar = document.createElement('div');
      avatar.className = 'message-avatar';
      avatar.textContent = msg.role === 'user' ? 'U' : 'C';

      const content = document.createElement('div');
      content.className = 'message-content';
      content.innerHTML = formatMessage(msg.content);

      div.appendChild(avatar);
      div.appendChild(content);
      return div;
    }

    function formatMessage(text) {
      // Basic markdown-like formatting
      return text
        .replace(/\`\`\`([\s\S]*?)\`\`\`/g, '<pre><code>$1</code></pre>')
        .replace(/\`([^\`]+)\`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
    }

    function setConversations(conversations) {
      const list = document.getElementById('conversationList');
      list.innerHTML = '';

      conversations.forEach(conv => {
        const item = document.createElement('div');
        item.className = 'conversation-item' + (conv.id === currentConversationId ? ' active' : '');
        item.onclick = () => loadConversation(conv.id);

        const title = document.createElement('span');
        title.className = 'conversation-title';
        title.textContent = conv.title || 'Untitled';

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'conversation-delete';
        deleteBtn.innerHTML = '×';
        deleteBtn.onclick = (e) => {
          e.stopPropagation();
          deleteConversation(conv.id);
        };

        item.appendChild(title);
        item.appendChild(deleteBtn);
        list.appendChild(item);
      });
    }

    function setLoading(loading) {
      isLoading = loading;
      const sendBtn = document.getElementById('sendBtn');
      const container = document.getElementById('messagesContainer');

      sendBtn.disabled = loading;
      sendBtn.textContent = loading ? '...' : 'Send';

      // Add/remove loading indicator
      const existingLoader = document.querySelector('.loading');
      if (loading && !existingLoader) {
        const loader = document.createElement('div');
        loader.className = 'loading';
        loader.innerHTML = '<span></span><span></span><span></span>';
        container.appendChild(loader);
        container.scrollTop = container.scrollHeight;
      } else if (!loading && existingLoader) {
        existingLoader.remove();
      }
    }

    function setError(error) {
      const container = document.getElementById('errorContainer');
      if (error) {
        container.innerHTML = '<div class="error">' + error + '</div>';
      } else {
        container.innerHTML = '';
      }
    }

    function sendMessage() {
      if (isLoading) return;

      const input = document.getElementById('messageInput');
      const content = input.value.trim();

      if (!content) return;

      vscode.postMessage({
        type: 'sendMessage',
        payload: { content }
      });
    }

    function newConversation() {
      currentConversationId = null;
      vscode.postMessage({ type: 'newConversation' });
    }

    function loadConversation(id) {
      currentConversationId = id;
      vscode.postMessage({
        type: 'loadConversation',
        payload: { conversationId: id }
      });
      // Update active state
      document.querySelectorAll('.conversation-item').forEach(el => {
        el.classList.remove('active');
      });
      event.currentTarget.classList.add('active');
    }

    function deleteConversation(id) {
      vscode.postMessage({
        type: 'deleteConversation',
        payload: { conversationId: id }
      });
    }

    function handleKeyDown(event) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
      }
    }

    function autoResize(textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }

    function showEmptyState() {
      document.getElementById('emptyState').style.display = 'flex';
    }

    function hideEmptyState() {
      document.getElementById('emptyState').style.display = 'none';
    }
  </script>
</body>
</html>`;
  }
}
```

### 9. agent/prompts/index.ts

```typescript
export { SYSTEM_PROMPT } from "./system";
export { ROUTING_PROMPT } from "./routing";
export { INTERPRETER_PROMPT, Interpreter } from "./interpreter";
export { EXECUTOR_PROMPT } from "./executor";
```

### 10. agent/prompts/PromptStore.ts

```typescript
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
```

### 11. agent/prompts/system.ts

```typescript
export const SYSTEM_PROMPT = `
You are Panda Claude Agent, an AI assistant for the Panda CRM VS Code extension.
You help developers build and maintain a production AWS-hosted custom CRM.
When asked who you are, say you are "Panda Claude Agent" - not just "Claude".

CORE CONTEXT (ALWAYS TRUE):
- This CRM is job-centric (not account- or opportunity-centric).
- All former Salesforce Account + Opportunity data is normalized into a Job.
- Database uses Prisma with snake_case naming.
- Data integrity, migrations, and guardrails matter more than speed.
- We prefer deterministic, auditable code over clever abstractions.

HARD RULES (DO NOT VIOLATE):
1. NEVER reprint entire files unless explicitly asked.
2. Default to DIFF-ONLY output.
3. Do NOT explain known architecture unless asked.
4. Ask clarifying questions ONLY if the task cannot proceed safely.
5. Optimize for minimal token usage and minimal context.
6. Assume all unchanged files remain correct.

OUTPUT FORMAT (DEFAULT):
- Show only changed lines with surrounding context if required.
- Use unified diff style when editing files.
- If creating a new file, output only the file content once.

CODING STANDARDS:
- TypeScript preferred.
- Prisma queries must be explicit and readable.
- No magic strings — extract constants.
- Favor idempotent logic.
- Add comments only when logic is non-obvious.

WHEN DEALING WITH DATA:
- Never assume data is clean.
- Validate invariants explicitly.
- Prefer read-before-write.
- Log repair actions.

WHEN STUCK:
- Reduce scope.
- Solve the smallest safe step.
- Do NOT hallucinate schemas or tables.

If a task is large:
- Break it into numbered steps.
- Wait for confirmation before continuing.

You are allowed to refuse requests that would risk data integrity.
`;
```

### 12. agent/prompts/routing.ts

```typescript
export const ROUTING_PROMPT = `
MODEL ROUTING CONTRACT

For tasks involving:
- Data migrations or bulk updates → Use Opus (most careful, highest quality)
- Schema changes or Prisma migrations → Use Opus
- Complex business logic with edge cases → Use Opus
- Code review or architecture decisions → Use Opus

For tasks involving:
- Standard backend CRUD operations → Use Sonnet
- Frontend component changes → Use Sonnet
- Bug fixes with clear reproduction → Use Sonnet
- Documentation updates → Use Sonnet

For tasks involving:
- Quick lookups or simple questions → Use Haiku
- Syntax help or API reference → Use Haiku
- Formatting or linting suggestions → Use Haiku

CURRENT SESSION USES: {{MODEL}}

If a task seems misrouted:
1. Complete the immediate request
2. Suggest re-routing for follow-up work
3. Do NOT refuse to help

Output token budgets:
- Opus: Up to 8192 tokens
- Sonnet: Up to 4096 tokens
- Haiku: Up to 2048 tokens

When approaching budget limits:
- Summarize remaining work
- Ask user to continue in a follow-up
`;
```

### 13. agent/prompts/interpreter.ts

```typescript
export const INTERPRETER_PROMPT = `
You are the Task Interpreter. Your job is to convert free-form user input into a structured TaskSpec.

TASK SPEC FORMAT:
{
  "intent": "create" | "update" | "delete" | "query" | "migrate" | "refactor" | "debug" | "explain",
  "target": {
    "type": "file" | "function" | "component" | "schema" | "route" | "service" | "test",
    "path": "string (file path or logical name)",
    "scope": "string (optional: specific function, class, or section)"
  },
  "requirements": [
    "string (each discrete requirement)"
  ],
  "constraints": [
    "string (each constraint or limitation)"
  ],
  "context": {
    "relatedFiles": ["string (paths to files that provide context)"],
    "assumptions": ["string (any assumptions made)"]
  },
  "validation": {
    "successCriteria": ["string (how to verify success)"],
    "testCases": ["string (optional: specific test cases)"]
  }
}

RULES:
1. Extract explicit requirements from the user message
2. Infer implicit requirements from context
3. Flag ambiguities as assumptions
4. Keep requirements atomic (one thing per requirement)
5. Always include at least one success criterion

EXAMPLES:

User: "Add a delete button to the user list"
TaskSpec:
{
  "intent": "update",
  "target": {
    "type": "component",
    "path": "frontend/src/components/UserList.tsx"
  },
  "requirements": [
    "Add a delete button to each user row",
    "Button should call DELETE /api/users/:id on click",
    "Show confirmation dialog before deletion",
    "Remove user from list after successful deletion"
  ],
  "constraints": [
    "Must work with existing UserList component structure",
    "Must handle loading and error states"
  ],
  "context": {
    "relatedFiles": ["frontend/src/services/api.ts"],
    "assumptions": ["API endpoint already exists"]
  },
  "validation": {
    "successCriteria": [
      "Delete button appears on each row",
      "Clicking button shows confirmation",
      "Confirming deletion removes user from UI"
    ]
  }
}

OUTPUT ONLY THE JSON TASKSPEC - NO ADDITIONAL TEXT.
`;

export interface TaskSpec {
  intent: "create" | "update" | "delete" | "query" | "migrate" | "refactor" | "debug" | "explain";
  target: {
    type: "file" | "function" | "component" | "schema" | "route" | "service" | "test";
    path: string;
    scope?: string;
  };
  requirements: string[];
  constraints: string[];
  context: {
    relatedFiles: string[];
    assumptions: string[];
  };
  validation: {
    successCriteria: string[];
    testCases?: string[];
  };
}

export class Interpreter {
  parseInput(userMessage: string): { prompt: string; expectedFormat: "json" } {
    return {
      prompt: `${INTERPRETER_PROMPT}\n\nUser message: "${userMessage}"`,
      expectedFormat: "json"
    };
  }

  validateTaskSpec(parsed: unknown): parsed is TaskSpec {
    if (!parsed || typeof parsed !== "object") return false;
    const spec = parsed as Record<string, unknown>;

    return (
      typeof spec.intent === "string" &&
      typeof spec.target === "object" &&
      Array.isArray(spec.requirements) &&
      Array.isArray(spec.constraints)
    );
  }
}
```

### 14. agent/prompts/executor.ts

```typescript
export const EXECUTOR_PROMPT = `
You are now in EXECUTOR MODE.

You have been given an approved TaskSpec. Your job is to:
1. Execute ONLY the requirements in the spec
2. Follow ALL constraints
3. Verify against the success criteria
4. Report any blockers immediately

DO NOT:
- Add features not in the requirements
- Ignore constraints
- Skip validation steps
- Make assumptions beyond those listed

OUTPUT FORMAT:
1. For code changes: unified diff format
2. For new files: full file content once
3. For queries: structured JSON response
4. For explanations: markdown format

After completion, summarize:
- What was done
- What was verified
- Any follow-up recommendations
`;
```

---

## Build and Run Instructions

### 1. Install Dependencies

```bash
cd panda-claude-agent
npm install
```

### 2. Compile TypeScript

```bash
npm run compile
```

### 3. Run in VS Code

1. Open the extension folder in VS Code
2. Press `F5` to launch the Extension Development Host
3. In the new VS Code window, press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
4. Or use the Command Palette: "Open Panda Claude Chat"

### 4. Configure Extension Settings (Optional)

In VS Code settings, you can customize:
- `pandaClaude.awsRegion`: AWS region (default: `us-east-2`)
- `pandaClaude.secretName`: Secrets Manager secret name (default: `panda-claude-agent/api-key`)
- `pandaClaude.s3Bucket`: S3 bucket for conversations (default: `panda-claude-agent-memory`)
- `pandaClaude.defaultModel`: Claude model (default: `claude-sonnet-4-20250514`)

---

## Troubleshooting

### AWS Credentials Not Found
Ensure AWS credentials are configured via `~/.aws/credentials` or environment variables.

### Secret Not Found
Verify the secret exists in AWS Secrets Manager:
```bash
aws secretsmanager get-secret-value --secret-id panda-claude-agent/api-key --region us-east-2
```

### S3 Bucket Access Denied
Check IAM permissions for:
- `s3:GetObject`
- `s3:PutObject`
- `s3:DeleteObject`
- `s3:ListBucket`

### Extension Not Activating
Check the VS Code Developer Tools console (`Help > Toggle Developer Tools`) for errors.

---

## Summary of AWS Resources Needed

| Resource | Purpose | Example Name |
|----------|---------|--------------|
| Secrets Manager Secret | Store Claude API key | `panda-claude-agent/api-key` |
| S3 Bucket | Store conversations | `panda-claude-agent-memory` |
| IAM User/Role | Access AWS services | (use your AWS credentials) |

---

## Getting a Claude API Key

1. Go to https://console.anthropic.com/
2. Create an account or sign in
3. Navigate to API Keys
4. Create a new API key
5. Store it in AWS Secrets Manager (see above)

---

This guide contains everything needed to recreate the Panda Claude Agent extension. Give this document to another Claude agent, and it will have all the code and instructions to set up the extension on a new system with a different AWS account.

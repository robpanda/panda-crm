import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import * as vscode from "vscode";
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

export class MemoryService {
  private client: S3Client;
  private bucket: string;
  private prefix: string;

  constructor() {
    const config = vscode.workspace.getConfiguration("pandaClaude");
    const region = config.get<string>("awsRegion", "us-east-2");
    this.bucket = config.get<string>("s3Bucket", "panda-claude-agent-memory");

    // Use workspace folder name or fallback to 'default' for prefix
    const workspaceName = vscode.workspace.workspaceFolders?.[0]?.name ?? "default";
    this.prefix = `conversations/${workspaceName}`;

    this.client = new S3Client({ region });
  }

  private getKey(conversationId: string): string {
    return `${this.prefix}/${conversationId}.json`;
  }

  async saveConversation(conversation: Conversation): Promise<void> {
    const key = this.getKey(conversation.id);

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: JSON.stringify(conversation, null, 2),
        ContentType: "application/json",
      });

      await this.client.send(command);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to save conversation: ${errorMessage}`);
      throw new Error(`Failed to save conversation: ${errorMessage}`);
    }
  }

  async getConversation(conversationId: string): Promise<Conversation | null> {
    const key = this.getKey(conversationId);

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
      // Return null if conversation doesn't exist
      if (error instanceof Error && error.name === "NoSuchKey") {
        return null;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to get conversation: ${errorMessage}`);
      return null;
    }
  }

  async listConversations(limit = 50): Promise<ConversationSummary[]> {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: this.prefix,
        MaxKeys: limit,
      });

      const response = await this.client.send(command);
      const summaries: ConversationSummary[] = [];

      if (!response.Contents) {
        return summaries;
      }

      // Fetch each conversation to get summary info
      for (const obj of response.Contents) {
        if (!obj.Key) continue;

        const conversationId = obj.Key.replace(`${this.prefix}/`, "").replace(".json", "");

        try {
          const conversation = await this.getConversation(conversationId);
          if (conversation) {
            summaries.push({
              id: conversation.id,
              title: conversation.title,
              messageCount: conversation.messages.length,
              createdAt: conversation.createdAt,
              updatedAt: conversation.updatedAt,
            });
          }
        } catch {
          // Skip invalid conversations
          continue;
        }
      }

      // Sort by updatedAt descending
      summaries.sort((a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );

      return summaries;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to list conversations: ${errorMessage}`);
      return [];
    }
  }

  async deleteConversation(conversationId: string): Promise<void> {
    const key = this.getKey(conversationId);

    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.client.send(command);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to delete conversation: ${errorMessage}`);
      throw new Error(`Failed to delete conversation: ${errorMessage}`);
    }
  }

  async appendMessage(
    conversationId: string,
    message: ClaudeMessage
  ): Promise<Conversation> {
    let conversation = await this.getConversation(conversationId);

    if (!conversation) {
      // Create new conversation
      conversation = {
        id: conversationId,
        title: this.generateTitle(message.content),
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    conversation.messages.push(message);
    conversation.updatedAt = new Date().toISOString();

    await this.saveConversation(conversation);

    return conversation;
  }

  private generateTitle(content: string): string {
    // Generate title from first message (first 50 chars)
    const cleaned = content.replace(/\s+/g, " ").trim();
    return cleaned.length > 50 ? cleaned.substring(0, 47) + "..." : cleaned;
  }

  generateConversationId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `conv_${timestamp}_${random}`;
  }
}

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
exports.MemoryService = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const vscode = __importStar(require("vscode"));
class MemoryService {
    client;
    bucket;
    prefix;
    constructor() {
        const config = vscode.workspace.getConfiguration("pandaClaude");
        const region = config.get("awsRegion", "us-east-2");
        this.bucket = config.get("s3Bucket", "panda-claude-agent-memory");
        // Use workspace folder name or fallback to 'default' for prefix
        const workspaceName = vscode.workspace.workspaceFolders?.[0]?.name ?? "default";
        this.prefix = `conversations/${workspaceName}`;
        this.client = new client_s3_1.S3Client({ region });
    }
    getKey(conversationId) {
        return `${this.prefix}/${conversationId}.json`;
    }
    async saveConversation(conversation) {
        const key = this.getKey(conversation.id);
        try {
            const command = new client_s3_1.PutObjectCommand({
                Bucket: this.bucket,
                Key: key,
                Body: JSON.stringify(conversation, null, 2),
                ContentType: "application/json",
            });
            await this.client.send(command);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`Failed to save conversation: ${errorMessage}`);
            throw new Error(`Failed to save conversation: ${errorMessage}`);
        }
    }
    async getConversation(conversationId) {
        const key = this.getKey(conversationId);
        try {
            const command = new client_s3_1.GetObjectCommand({
                Bucket: this.bucket,
                Key: key,
            });
            const response = await this.client.send(command);
            if (!response.Body) {
                return null;
            }
            const bodyString = await response.Body.transformToString();
            return JSON.parse(bodyString);
        }
        catch (error) {
            // Return null if conversation doesn't exist
            if (error instanceof Error && error.name === "NoSuchKey") {
                return null;
            }
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`Failed to get conversation: ${errorMessage}`);
            return null;
        }
    }
    async listConversations(limit = 50) {
        try {
            const command = new client_s3_1.ListObjectsV2Command({
                Bucket: this.bucket,
                Prefix: this.prefix,
                MaxKeys: limit,
            });
            const response = await this.client.send(command);
            const summaries = [];
            if (!response.Contents) {
                return summaries;
            }
            // Fetch each conversation to get summary info
            for (const obj of response.Contents) {
                if (!obj.Key)
                    continue;
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
                }
                catch {
                    // Skip invalid conversations
                    continue;
                }
            }
            // Sort by updatedAt descending
            summaries.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
            return summaries;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`Failed to list conversations: ${errorMessage}`);
            return [];
        }
    }
    async deleteConversation(conversationId) {
        const key = this.getKey(conversationId);
        try {
            const command = new client_s3_1.DeleteObjectCommand({
                Bucket: this.bucket,
                Key: key,
            });
            await this.client.send(command);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`Failed to delete conversation: ${errorMessage}`);
            throw new Error(`Failed to delete conversation: ${errorMessage}`);
        }
    }
    async appendMessage(conversationId, message) {
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
    generateTitle(content) {
        // Generate title from first message (first 50 chars)
        const cleaned = content.replace(/\s+/g, " ").trim();
        return cleaned.length > 50 ? cleaned.substring(0, 47) + "..." : cleaned;
    }
    generateConversationId() {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 8);
        return `conv_${timestamp}_${random}`;
    }
}
exports.MemoryService = MemoryService;
//# sourceMappingURL=MemoryService.js.map
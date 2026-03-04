import { SecretsService } from "./services/SecretsService";
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
export declare class ClaudeClient {
    private apiKey;
    private secretsService;
    constructor(secretsService: SecretsService);
    private ensureApiKey;
    generate(request: ClaudeRequest): Promise<string>;
    generateWithHistory(messages: ClaudeMessage[], options: {
        model: string;
        max_tokens?: number;
        system?: string;
    }): Promise<{
        response: string;
        usage: {
            input_tokens: number;
            output_tokens: number;
        };
    }>;
}
//# sourceMappingURL=ClaudeClient.d.ts.map
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

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaudeClient = void 0;
class ClaudeClient {
    apiKey = null;
    secretsService;
    constructor(secretsService) {
        this.secretsService = secretsService;
    }
    async ensureApiKey() {
        if (!this.apiKey) {
            this.apiKey = await this.secretsService.getClaudeApiKey();
        }
        return this.apiKey;
    }
    async generate(request) {
        const apiKey = await this.ensureApiKey();
        // Build messages array
        const messages = request.messages ?? [
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
                const errorJson = JSON.parse(errorText);
                errorMessage = `Claude API error: ${errorJson.error.type} - ${errorJson.error.message}`;
            }
            catch {
                errorMessage = `Claude API error: ${res.status} ${errorText}`;
            }
            throw new Error(errorMessage);
        }
        const data = await res.json();
        // Extract text from content blocks
        const textContent = data.content
            .filter((block) => block.type === "text" && typeof block.text === "string")
            .map(block => block.text)
            .join("\n");
        return textContent;
    }
    async generateWithHistory(messages, options) {
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
        const data = await res.json();
        const textContent = data.content
            .filter((block) => block.type === "text" && typeof block.text === "string")
            .map(block => block.text)
            .join("\n");
        return {
            response: textContent,
            usage: data.usage,
        };
    }
}
exports.ClaudeClient = ClaudeClient;
//# sourceMappingURL=ClaudeClient.js.map
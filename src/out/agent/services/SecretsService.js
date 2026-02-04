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
exports.SecretsService = void 0;
const client_secrets_manager_1 = require("@aws-sdk/client-secrets-manager");
const vscode = __importStar(require("vscode"));
class SecretsService {
    client;
    cachedApiKey = null;
    secretName;
    constructor() {
        const config = vscode.workspace.getConfiguration("pandaClaude");
        const region = config.get("awsRegion", "us-east-2");
        this.secretName = config.get("secretName", "panda-claude-agent/api-key");
        this.client = new client_secrets_manager_1.SecretsManagerClient({ region });
    }
    async getClaudeApiKey() {
        // Return cached key if available
        if (this.cachedApiKey) {
            return this.cachedApiKey;
        }
        try {
            const command = new client_secrets_manager_1.GetSecretValueCommand({
                SecretId: this.secretName,
            });
            const response = await this.client.send(command);
            if (!response.SecretString) {
                throw new Error("Secret value is empty");
            }
            // Parse the secret - supports both JSON and plain string formats
            let apiKey;
            try {
                const secretJson = JSON.parse(response.SecretString);
                apiKey = secretJson.CLAUDE_API_KEY;
            }
            catch {
                // If not JSON, treat as plain string
                apiKey = response.SecretString;
            }
            if (!apiKey) {
                throw new Error("CLAUDE_API_KEY not found in secret");
            }
            // Cache the key
            this.cachedApiKey = apiKey;
            return apiKey;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            // Show user-friendly error
            vscode.window.showErrorMessage(`Failed to retrieve Claude API key from AWS Secrets Manager: ${errorMessage}. ` +
                `Ensure your AWS credentials are configured and the secret "${this.secretName}" exists.`);
            throw new Error(`Failed to retrieve API key: ${errorMessage}`);
        }
    }
    clearCache() {
        this.cachedApiKey = null;
    }
}
exports.SecretsService = SecretsService;
//# sourceMappingURL=SecretsService.js.map
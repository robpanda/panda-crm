import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import * as vscode from "vscode";

interface ClaudeSecretValue {
  CLAUDE_API_KEY: string;
}

export class SecretsService {
  private client: SecretsManagerClient;
  private cachedApiKey: string | null = null;
  private secretName: string;

  constructor() {
    const config = vscode.workspace.getConfiguration("pandaClaude");
    const region = config.get<string>("awsRegion", "us-east-2");
    this.secretName = config.get<string>("secretName", "panda-claude-agent/api-key");

    this.client = new SecretsManagerClient({ region });
  }

  async getClaudeApiKey(): Promise<string> {
    // Return cached key if available
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

      // Parse the secret - supports both JSON and plain string formats
      let apiKey: string;

      try {
        const secretJson = JSON.parse(response.SecretString) as ClaudeSecretValue;
        apiKey = secretJson.CLAUDE_API_KEY;
      } catch {
        // If not JSON, treat as plain string
        apiKey = response.SecretString;
      }

      if (!apiKey) {
        throw new Error("CLAUDE_API_KEY not found in secret");
      }

      // Cache the key
      this.cachedApiKey = apiKey;

      return apiKey;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Show user-friendly error
      vscode.window.showErrorMessage(
        `Failed to retrieve Claude API key from AWS Secrets Manager: ${errorMessage}. ` +
        `Ensure your AWS credentials are configured and the secret "${this.secretName}" exists.`
      );

      throw new Error(`Failed to retrieve API key: ${errorMessage}`);
    }
  }

  clearCache(): void {
    this.cachedApiKey = null;
  }
}

# Panda Claude Agent - VS Code Extension

## Project Overview

This is a VS Code extension that provides an AI-powered coding assistant using Claude (Anthropic's API). It features multi-panel chat support, cross-device conversation sync via AWS S3, and secure API key storage via AWS Secrets Manager.

## Architecture

```
src/
├── extension.ts              # VS Code extension entry point
├── agent/
│   ├── AgentController.ts    # Main controller coordinating all services
│   ├── ClaudeClient.ts       # Claude API client (Messages API)
│   ├── services/
│   │   ├── SecretsService.ts # AWS Secrets Manager integration
│   │   └── MemoryService.ts  # AWS S3 conversation persistence
│   ├── ui/
│   │   └── ChatWebview.ts    # Multi-panel webview UI
│   └── prompts/
│       ├── index.ts          # Barrel exports
│       ├── PromptStore.ts    # Prompt management via VS Code global state
│       ├── system.ts         # System prompt defining agent behavior
│       ├── routing.ts        # Model routing contract
│       ├── interpreter.ts    # Task interpreter with TaskSpec interface
│       └── executor.ts       # Executor mode prompt
├── package.json              # Extension manifest
└── tsconfig.json             # TypeScript configuration
```

## Key Technologies

- **VS Code Extension API**: Webview panels, commands, configuration
- **Claude Messages API**: `https://api.anthropic.com/v1/messages`
- **AWS SDK v3**: `@aws-sdk/client-s3`, `@aws-sdk/client-secrets-manager`
- **TypeScript**: CommonJS modules, ES2022 target

## AWS Resources Required

| Resource | Purpose | Configuration Key |
|----------|---------|-------------------|
| Secrets Manager | Claude API key storage | `pandaClaude.secretName` |
| S3 Bucket | Conversation persistence | `pandaClaude.s3Bucket` |

### AWS Setup Commands

```bash
# Create S3 bucket for conversation sync
aws s3 mb s3://YOUR-BUCKET-NAME --region us-east-2

# Store Claude API key in Secrets Manager
aws secretsmanager create-secret \
  --name "panda-claude-agent/api-key" \
  --secret-string "sk-ant-your-api-key-here" \
  --region us-east-2
```

## VS Code Settings

Configure in VS Code settings (JSON):

```json
{
  "pandaClaude.awsRegion": "us-east-2",
  "pandaClaude.secretName": "panda-claude-agent/api-key",
  "pandaClaude.s3Bucket": "your-bucket-name",
  "pandaClaude.defaultModel": "claude-sonnet-4-20250514"
}
```

## Build & Run

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Launch in VS Code
# Press F5 or Run > Start Debugging
```

## Key Features

### Multi-Panel Support
- Open multiple chat panels simultaneously
- Each panel tracked in `ChatWebview.activePanels` Set
- Panels persist independently

### Cross-Device Sync
- Conversations saved to S3 with workspace-based prefixes
- Sync on panel open and after each message
- Key format: `{workspaceId}/conversation.json`

### Secure API Key Storage
- API key retrieved from AWS Secrets Manager (never stored locally)
- Supports both JSON format (`{"apiKey": "..."}`) and plain string secrets
- Cached in memory during session

## Commands

| Command | Description |
|---------|-------------|
| `panda-crm.openChat` | Open Panda Claude Chat panel |

**Keybinding**: `Cmd+Shift+P` (Mac) / `Ctrl+Shift+P` (Windows/Linux) when editor has focus

## API Client Usage

```typescript
// Generate single response
const response = await claudeClient.generate(prompt);

// Generate with conversation history
const response = await claudeClient.generateWithHistory(messages, systemPrompt);
```

## Prompt System

The agent uses a multi-stage prompt architecture:

1. **System Prompt** (`system.ts`): Defines overall agent behavior and capabilities
2. **Routing Prompt** (`routing.ts`): Determines which model/approach to use
3. **Interpreter Prompt** (`interpreter.ts`): Parses user intent into structured TaskSpec
4. **Executor Prompt** (`executor.ts`): Executes specific coding tasks

## Troubleshooting

### "Could not retrieve API key"
- Verify Secrets Manager secret exists and has correct name
- Check AWS credentials are configured (`aws configure`)
- Ensure IAM permissions include `secretsmanager:GetSecretValue`

### "Failed to save/load conversation"
- Verify S3 bucket exists and is accessible
- Check IAM permissions include `s3:GetObject`, `s3:PutObject`
- Ensure bucket region matches `pandaClaude.awsRegion` setting

### Extension not activating
- Check Output panel > "Panda Claude Agent" for errors
- Verify `npm run compile` completed successfully
- Ensure all dependencies installed (`npm install`)

## Recreating on Different AWS Account

See `PANDA_CLAUDE_AGENT_SETUP_GUIDE.md` for complete instructions including:
- All source code files
- AWS resource creation commands
- Step-by-step setup guide
- Full build instructions

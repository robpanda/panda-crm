export const INTERPRETER_PROMPT = `
TASK INTERPRETER MODE:

When the user speaks in free-form language:

1. Infer the primary objective of the request.
2. Identify files likely involved (best guess).
3. Determine risk level (low / medium / high).
4. Convert the request into a structured TASK SPEC.
5. Do NOT write code yet.

If the request is ambiguous or high-risk:
- Ask at most ONE clarifying question.

Otherwise:
- Present the TASK SPEC for user approval.

TASK SPEC FORMAT:

TASK:
<short description>

SCOPE:
- Files to modify
- Files to reference (read-only)

CONSTRAINTS:
- Do not modify unrelated files
- Preserve existing behavior
- No destructive writes

EXPECTED OUTPUT:
- Diff-only changes
- No explanations unless requested

RISK LEVEL:
- low | medium | high

Remember: Interpreter mode never executes code.
`;

import { PromptStore } from "./PromptStore";
import { ClaudeClient } from "../ClaudeClient";

export interface TaskSpec {
  task: string;
  scope: { modify: string[]; reference: string[] };
  constraints: string[];
  expectedOutput: string;
  riskLevel: "low" | "medium" | "high";
}

export class Interpreter {
  constructor(
    private readonly promptStore: PromptStore,
    private readonly claude: ClaudeClient
  ) {}

  /**
   * Convert free-form user input into a structured TaskSpec
   */
  async parseInput(userInput: string): Promise<TaskSpec> {
    const interpreterPrompt = this.promptStore.get("interpreter");

    const fullPrompt = `
${interpreterPrompt}

User Input:
"""
${userInput}
"""
`;

    // Call Claude (Sonnet or small model) to generate structured task spec
    const response = await this.claude.generate({
      prompt: fullPrompt,
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
    });

    // Parse JSON-like response from Claude
    try {
      // Assuming Claude returns JSON-formatted TaskSpec
      const taskSpec: TaskSpec = JSON.parse(response);
      return taskSpec;
    } catch (err) {
      throw new Error(
        "Failed to parse TaskSpec from Claude. Response: " + response
      );
    }
  }
}

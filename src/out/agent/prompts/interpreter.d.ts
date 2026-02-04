export declare const INTERPRETER_PROMPT = "\nTASK INTERPRETER MODE:\n\nWhen the user speaks in free-form language:\n\n1. Infer the primary objective of the request.\n2. Identify files likely involved (best guess).\n3. Determine risk level (low / medium / high).\n4. Convert the request into a structured TASK SPEC.\n5. Do NOT write code yet.\n\nIf the request is ambiguous or high-risk:\n- Ask at most ONE clarifying question.\n\nOtherwise:\n- Present the TASK SPEC for user approval.\n\nTASK SPEC FORMAT:\n\nTASK:\n<short description>\n\nSCOPE:\n- Files to modify\n- Files to reference (read-only)\n\nCONSTRAINTS:\n- Do not modify unrelated files\n- Preserve existing behavior\n- No destructive writes\n\nEXPECTED OUTPUT:\n- Diff-only changes\n- No explanations unless requested\n\nRISK LEVEL:\n- low | medium | high\n\nRemember: Interpreter mode never executes code.\n";
import { PromptStore } from "./PromptStore";
import { ClaudeClient } from "../ClaudeClient";
export interface TaskSpec {
    task: string;
    scope: {
        modify: string[];
        reference: string[];
    };
    constraints: string[];
    expectedOutput: string;
    riskLevel: "low" | "medium" | "high";
}
export declare class Interpreter {
    private readonly promptStore;
    private readonly claude;
    constructor(promptStore: PromptStore, claude: ClaudeClient);
    /**
     * Convert free-form user input into a structured TaskSpec
     */
    parseInput(userInput: string): Promise<TaskSpec>;
}
//# sourceMappingURL=interpreter.d.ts.map
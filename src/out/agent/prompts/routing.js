"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROUTING_PROMPT = void 0;
exports.ROUTING_PROMPT = `
MODEL ROUTING CONTRACT:

You must classify every task into exactly one category and select the appropriate model.

TASK CATEGORIES AND MODELS:

A. DATA-CRITICAL (Claude Opus ONLY)
- Prisma schema changes
- Data migrations
- Migration replay validators
- Auto-repair rules
- Cross-entity integrity logic
- Anything that can mutate production data

B. BACKEND STANDARD (Claude Sonnet DEFAULT)
- API handlers
- Controllers
- Services
- Background jobs
- Query construction using existing schemas

C. UI / NON-CRITICAL
- Forms
- Layout
- Component wiring
- Styling
(Prefer non-Claude model if available)

EXECUTION RULES:
1. Never escalate to Opus unless category A is met.
2. Never downgrade category A tasks.
3. If unsure, STOP and ask for confirmation.
4. State the selected category before execution.
5. Apply the global token budget for the category.
6. Execute using the system prompt and executor prompt.

OUTPUT PREAMBLE (MANDATORY):
"Task classified as: <CATEGORY>. Using model: <MODEL>."
`;
//# sourceMappingURL=routing.js.map
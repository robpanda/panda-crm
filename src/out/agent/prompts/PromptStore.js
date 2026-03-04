"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PromptStore = void 0;
const system_1 = require("./system");
const routing_1 = require("./routing");
const interpreter_1 = require("./interpreter");
const executor_1 = require("./executor");
class PromptStore {
    context;
    constructor(context) {
        this.context = context;
        this.initializeDefaults();
    }
    initializeDefaults() {
        // Always update prompts to ensure latest versions are used
        this.forceUpdate("system", system_1.SYSTEM_PROMPT);
        this.forceUpdate("routing", routing_1.ROUTING_PROMPT);
        this.forceUpdate("interpreter", interpreter_1.INTERPRETER_PROMPT);
        this.forceUpdate("executor", executor_1.EXECUTOR_PROMPT);
    }
    forceUpdate(key, value) {
        const fullKey = `pandaCrm.prompt.${key}`;
        this.context.globalState.update(fullKey, value);
    }
    get(key) {
        return this.context.globalState.get(`pandaCrm.prompt.${key}`, "");
    }
}
exports.PromptStore = PromptStore;
//# sourceMappingURL=PromptStore.js.map
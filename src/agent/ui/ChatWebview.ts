import * as vscode from "vscode";
import { ClaudeMessage } from "../ClaudeClient";
import { ConversationSummary } from "../services/MemoryService";

export interface WebviewMessage {
  type:
    | "sendMessage"
    | "newConversation"
    | "loadConversation"
    | "deleteConversation"
    | "getConversations"
    | "ready";
  payload?: {
    content?: string;
    conversationId?: string;
  };
}

export interface ExtensionMessage {
  type:
    | "addMessage"
    | "setMessages"
    | "setConversations"
    | "setLoading"
    | "setError"
    | "clearInput";
  payload?: {
    message?: ClaudeMessage;
    messages?: ClaudeMessage[];
    conversations?: ConversationSummary[];
    loading?: boolean;
    error?: string;
  };
}

export class ChatWebview {
  private static panelCount = 0;
  private static activePanels: Set<ChatWebview> = new Set();

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _panelId: number;
  private _disposables: vscode.Disposable[] = [];
  private _messageHandler?: (message: WebviewMessage) => void;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, panelId: number) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._panelId = panelId;

    this._panel.webview.html = this._getHtmlContent();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      (message: WebviewMessage) => {
        if (this._messageHandler) {
          this._messageHandler(message);
        }
      },
      null,
      this._disposables
    );

    ChatWebview.activePanels.add(this);
  }

  public static create(extensionUri: vscode.Uri): ChatWebview {
    ChatWebview.panelCount++;
    const panelId = ChatWebview.panelCount;

    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    const title = panelId === 1
      ? "Panda Claude Agent"
      : `Panda Claude Agent #${panelId}`;

    const panel = vscode.window.createWebviewPanel(
      "pandaClaudeChat",
      title,
      column || vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      }
    );

    return new ChatWebview(panel, extensionUri, panelId);
  }

  public static getActivePanelCount(): number {
    return ChatWebview.activePanels.size;
  }

  public onMessage(handler: (message: WebviewMessage) => void): void {
    this._messageHandler = handler;
  }

  public postMessage(message: ExtensionMessage): void {
    this._panel.webview.postMessage(message);
  }

  public dispose(): void {
    ChatWebview.activePanels.delete(this);
    this._panel.dispose();

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  private _getHtmlContent(): string {
    return /*html*/ `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Panda Claude Agent</title>
  <style>
    :root {
      --bg-primary: var(--vscode-editor-background);
      --bg-secondary: var(--vscode-sideBar-background);
      --bg-input: var(--vscode-input-background);
      --text-primary: var(--vscode-editor-foreground);
      --text-secondary: var(--vscode-descriptionForeground);
      --border-color: var(--vscode-panel-border);
      --accent-color: var(--vscode-button-background);
      --accent-hover: var(--vscode-button-hoverBackground);
      --user-bg: var(--vscode-textBlockQuote-background);
      --assistant-bg: var(--vscode-editor-inactiveSelectionBackground);
      --error-color: var(--vscode-errorForeground);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      background: var(--bg-primary);
      color: var(--text-primary);
      height: 100vh;
      display: flex;
      flex-direction: column;
    }

    .container {
      display: flex;
      height: 100%;
    }

    /* Sidebar */
    .sidebar {
      width: 250px;
      background: var(--bg-secondary);
      border-right: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
    }

    .sidebar-header {
      padding: 16px;
      border-bottom: 1px solid var(--border-color);
    }

    .new-chat-btn {
      width: 100%;
      padding: 10px 16px;
      background: var(--accent-color);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
    }

    .new-chat-btn:hover {
      background: var(--accent-hover);
    }

    .conversations-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }

    .conversation-item {
      padding: 10px 12px;
      border-radius: 4px;
      cursor: pointer;
      margin-bottom: 4px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .conversation-item:hover {
      background: var(--bg-input);
    }

    .conversation-item.active {
      background: var(--accent-color);
    }

    .conversation-title {
      font-size: 13px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
    }

    .conversation-delete {
      opacity: 0;
      background: none;
      border: none;
      color: var(--text-secondary);
      cursor: pointer;
      padding: 4px;
    }

    .conversation-item:hover .conversation-delete {
      opacity: 1;
    }

    /* Main Chat Area */
    .chat-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .chat-header {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-color);
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .model-badge {
      font-size: 11px;
      padding: 2px 8px;
      background: var(--accent-color);
      border-radius: 12px;
      color: var(--vscode-button-foreground);
    }

    .messages-container {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
    }

    .message {
      margin-bottom: 16px;
      display: flex;
      flex-direction: column;
    }

    .message-header {
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 6px;
      color: var(--text-secondary);
    }

    .message-content {
      padding: 12px 16px;
      border-radius: 8px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    .message.user .message-content {
      background: var(--user-bg);
      border: 1px solid var(--border-color);
    }

    .message.assistant .message-content {
      background: var(--assistant-bg);
    }

    .message-content code {
      font-family: var(--vscode-editor-font-family);
      background: var(--bg-secondary);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.9em;
    }

    .message-content pre {
      background: var(--bg-secondary);
      padding: 12px;
      border-radius: 6px;
      overflow-x: auto;
      margin: 8px 0;
    }

    .message-content pre code {
      background: none;
      padding: 0;
    }

    /* Input Area */
    .input-area {
      padding: 16px;
      border-top: 1px solid var(--border-color);
      background: var(--bg-secondary);
    }

    .input-wrapper {
      display: flex;
      gap: 8px;
      align-items: flex-end;
    }

    .input-field {
      flex: 1;
      min-height: 44px;
      max-height: 200px;
      padding: 12px;
      background: var(--bg-input);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      color: var(--text-primary);
      font-family: inherit;
      font-size: inherit;
      resize: none;
      outline: none;
    }

    .input-field:focus {
      border-color: var(--accent-color);
    }

    .send-btn {
      padding: 12px 20px;
      background: var(--accent-color);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 500;
      white-space: nowrap;
    }

    .send-btn:hover {
      background: var(--accent-hover);
    }

    .send-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Loading State */
    .loading-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      color: var(--text-secondary);
    }

    .loading-dots {
      display: flex;
      gap: 4px;
    }

    .loading-dots span {
      width: 6px;
      height: 6px;
      background: var(--text-secondary);
      border-radius: 50%;
      animation: bounce 1.4s infinite ease-in-out both;
    }

    .loading-dots span:nth-child(1) { animation-delay: -0.32s; }
    .loading-dots span:nth-child(2) { animation-delay: -0.16s; }

    @keyframes bounce {
      0%, 80%, 100% { transform: scale(0); }
      40% { transform: scale(1); }
    }

    /* Error State */
    .error-message {
      padding: 12px 16px;
      background: var(--vscode-inputValidation-errorBackground);
      border: 1px solid var(--error-color);
      border-radius: 6px;
      color: var(--error-color);
      margin: 8px 16px;
    }

    /* Empty State */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--text-secondary);
      text-align: center;
      padding: 32px;
    }

    .empty-state h2 {
      margin-bottom: 8px;
      color: var(--text-primary);
    }

    .empty-state p {
      max-width: 400px;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="container">
    <aside class="sidebar">
      <div class="sidebar-header">
        <button class="new-chat-btn" id="newChatBtn">+ New Chat</button>
      </div>
      <div class="conversations-list" id="conversationsList">
        <!-- Conversations will be populated here -->
      </div>
    </aside>

    <main class="chat-area">
      <header class="chat-header">
        <span>Panda Claude Agent</span>
        <span class="model-badge" id="modelBadge">Sonnet</span>
      </header>

      <div class="messages-container" id="messagesContainer">
        <div class="empty-state" id="emptyState">
          <h2>Welcome to Panda Claude Agent</h2>
          <p>Start a conversation to get help with your Panda CRM development. I can help with code, architecture, and debugging.</p>
        </div>
      </div>

      <div class="error-message" id="errorMessage" style="display: none;"></div>

      <div class="input-area">
        <div class="input-wrapper">
          <textarea
            class="input-field"
            id="inputField"
            placeholder="Ask me anything about Panda CRM..."
            rows="1"
          ></textarea>
          <button class="send-btn" id="sendBtn">Send</button>
        </div>
      </div>
    </main>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    // State
    let conversations = [];
    let currentConversationId = null;
    let isLoading = false;

    // Elements
    const conversationsList = document.getElementById('conversationsList');
    const messagesContainer = document.getElementById('messagesContainer');
    const emptyState = document.getElementById('emptyState');
    const errorMessage = document.getElementById('errorMessage');
    const inputField = document.getElementById('inputField');
    const sendBtn = document.getElementById('sendBtn');
    const newChatBtn = document.getElementById('newChatBtn');

    // Auto-resize textarea
    inputField.addEventListener('input', () => {
      inputField.style.height = 'auto';
      inputField.style.height = Math.min(inputField.scrollHeight, 200) + 'px';
    });

    // Send message on Enter (Shift+Enter for new line)
    inputField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    sendBtn.addEventListener('click', sendMessage);
    newChatBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'newConversation' });
    });

    function sendMessage() {
      const content = inputField.value.trim();
      if (!content || isLoading) return;

      vscode.postMessage({
        type: 'sendMessage',
        payload: { content }
      });
    }

    function renderConversations() {
      conversationsList.innerHTML = conversations.map(conv => \`
        <div class="conversation-item \${conv.id === currentConversationId ? 'active' : ''}"
             data-id="\${conv.id}">
          <span class="conversation-title">\${escapeHtml(conv.title)}</span>
          <button class="conversation-delete" data-id="\${conv.id}" title="Delete">×</button>
        </div>
      \`).join('');

      // Add click handlers
      conversationsList.querySelectorAll('.conversation-item').forEach(item => {
        item.addEventListener('click', (e) => {
          if (e.target.classList.contains('conversation-delete')) {
            e.stopPropagation();
            vscode.postMessage({
              type: 'deleteConversation',
              payload: { conversationId: e.target.dataset.id }
            });
          } else {
            vscode.postMessage({
              type: 'loadConversation',
              payload: { conversationId: item.dataset.id }
            });
          }
        });
      });
    }

    function renderMessages(messages) {
      if (!messages || messages.length === 0) {
        emptyState.style.display = 'flex';
        messagesContainer.innerHTML = '';
        messagesContainer.appendChild(emptyState);
        return;
      }

      emptyState.style.display = 'none';
      messagesContainer.innerHTML = messages.map(msg => \`
        <div class="message \${msg.role}">
          <div class="message-header">\${msg.role === 'user' ? 'You' : 'Claude'}</div>
          <div class="message-content">\${formatMessage(msg.content)}</div>
        </div>
      \`).join('');

      // Scroll to bottom
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function addMessage(message) {
      emptyState.style.display = 'none';

      const messageEl = document.createElement('div');
      messageEl.className = \`message \${message.role}\`;
      messageEl.innerHTML = \`
        <div class="message-header">\${message.role === 'user' ? 'You' : 'Claude'}</div>
        <div class="message-content">\${formatMessage(message.content)}</div>
      \`;
      messagesContainer.appendChild(messageEl);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function setLoading(loading) {
      isLoading = loading;
      sendBtn.disabled = loading;

      // Remove existing loading indicator
      const existingLoader = messagesContainer.querySelector('.loading-indicator');
      if (existingLoader) existingLoader.remove();

      if (loading) {
        const loader = document.createElement('div');
        loader.className = 'loading-indicator';
        loader.innerHTML = \`
          <div class="loading-dots">
            <span></span><span></span><span></span>
          </div>
          <span>Claude is thinking...</span>
        \`;
        messagesContainer.appendChild(loader);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
    }

    function setError(error) {
      if (error) {
        errorMessage.textContent = error;
        errorMessage.style.display = 'block';
      } else {
        errorMessage.style.display = 'none';
      }
    }

    function formatMessage(content) {
      // Basic markdown-like formatting
      let formatted = escapeHtml(content);

      // Code blocks
      formatted = formatted.replace(/\`\`\`(\\w*)\\n([\\s\\S]*?)\`\`\`/g, '<pre><code>$2</code></pre>');

      // Inline code
      formatted = formatted.replace(/\`([^\`]+)\`/g, '<code>$1</code>');

      return formatted;
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // Handle messages from extension
    window.addEventListener('message', (event) => {
      const message = event.data;

      switch (message.type) {
        case 'addMessage':
          if (message.payload?.message) {
            addMessage(message.payload.message);
          }
          break;

        case 'setMessages':
          renderMessages(message.payload?.messages || []);
          break;

        case 'setConversations':
          conversations = message.payload?.conversations || [];
          renderConversations();
          break;

        case 'setLoading':
          setLoading(message.payload?.loading || false);
          break;

        case 'setError':
          setError(message.payload?.error);
          break;

        case 'clearInput':
          inputField.value = '';
          inputField.style.height = 'auto';
          break;
      }
    });

    // Initial load
    vscode.postMessage({ type: 'ready' });
    vscode.postMessage({ type: 'getConversations' });
  </script>
</body>
</html>
`;
  }
}

// Embed this in your storefront to add a live chat widget powered by the Antigravity agent
// <script src="https://your-antigravity-endpoint/agent-widget.js"></script>

(function() {
  const AGENT_URL = window.TOOIICY_AGENT_URL || 'http://localhost:3000';

  const styles = `
    .tooiicy-agent-widget {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 400px;
      height: 600px;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      display: flex;
      flex-direction: column;
      background: white;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      z-index: 10000;
    }

    .tooiicy-agent-widget.hidden {
      display: none;
    }

    .tooiicy-agent-header {
      background: #000;
      color: white;
      padding: 16px;
      border-radius: 12px 12px 0 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .tooiicy-agent-header h3 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
    }

    .tooiicy-agent-close {
      background: none;
      border: none;
      color: white;
      cursor: pointer;
      font-size: 18px;
      padding: 0;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .tooiicy-agent-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .tooiicy-agent-message {
      display: flex;
      gap: 8px;
      animation: slideIn 0.3s ease-out;
    }

    .tooiicy-agent-message.user {
      justify-content: flex-end;
    }

    .tooiicy-agent-message-content {
      max-width: 70%;
      padding: 10px 12px;
      border-radius: 8px;
      font-size: 14px;
      line-height: 1.4;
    }

    .tooiicy-agent-message.assistant .tooiicy-agent-message-content {
      background: #f0f0f0;
      color: #333;
    }

    .tooiicy-agent-message.user .tooiicy-agent-message-content {
      background: #000;
      color: white;
    }

    .tooiicy-agent-input {
      padding: 12px;
      border-top: 1px solid #eee;
      display: flex;
      gap: 8px;
    }

    .tooiicy-agent-input input {
      flex: 1;
      border: 1px solid #ddd;
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 14px;
      font-family: inherit;
    }

    .tooiicy-agent-input button {
      background: #000;
      color: white;
      border: none;
      border-radius: 6px;
      padding: 8px 16px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
    }

    .tooiicy-agent-input button:hover {
      background: #333;
    }

    .tooiicy-agent-button {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 56px;
      height: 56px;
      background: #000;
      color: white;
      border: none;
      border-radius: 50%;
      cursor: pointer;
      font-size: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 9999;
    }

    .tooiicy-agent-button:hover {
      background: #333;
    }

    .tooiicy-agent-button.hidden {
      display: none;
    }

    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `;

  function initWidget() {
    // Create style element
    const styleEl = document.createElement('style');
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);

    // Create widget HTML
    const widget = document.createElement('div');
    widget.className = 'tooiicy-agent-widget hidden';
    widget.innerHTML = `
      <div class="tooiicy-agent-header">
        <h3>Tooiicy Support</h3>
        <button class="tooiicy-agent-close">✕</button>
      </div>
      <div class="tooiicy-agent-messages"></div>
      <div class="tooiicy-agent-input">
        <input type="text" placeholder="Ask about sizing, shipping, care..." />
        <button>Send</button>
      </div>
    `;

    const button = document.createElement('button');
    button.className = 'tooiicy-agent-button';
    button.textContent = '💬';

    document.body.appendChild(widget);
    document.body.appendChild(button);

    let conversationHistory = [];

    const messagesDiv = widget.querySelector('.tooiicy-agent-messages');
    const input = widget.querySelector('.tooiicy-agent-input input');
    const sendButton = widget.querySelector('.tooiicy-agent-input button');
    const closeButton = widget.querySelector('.tooiicy-agent-close');

    const toggleWidget = () => {
      widget.classList.toggle('hidden');
      button.classList.toggle('hidden');
    };

    const sendMessage = async () => {
      const message = input.value.trim();
      if (!message) return;

      input.value = '';

      // Add user message
      const userEl = document.createElement('div');
      userEl.className = 'tooiicy-agent-message user';
      userEl.innerHTML = `<div class="tooiicy-agent-message-content">${escapeHtml(message)}</div>`;
      messagesDiv.appendChild(userEl);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;

      try {
        const response = await fetch(`${AGENT_URL}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, history: conversationHistory }),
        });

        const data = await response.json();
        conversationHistory = data.history;

        // Add agent message
        const agentEl = document.createElement('div');
        agentEl.className = 'tooiicy-agent-message assistant';
        agentEl.innerHTML = `<div class="tooiicy-agent-message-content">${escapeHtml(data.reply)}</div>`;
        messagesDiv.appendChild(agentEl);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
      } catch (error) {
        console.error('Error:', error);
        const errorEl = document.createElement('div');
        errorEl.className = 'tooiicy-agent-message assistant';
        errorEl.innerHTML = `<div class="tooiicy-agent-message-content">Sorry, I'm having trouble connecting. Please try again.</div>`;
        messagesDiv.appendChild(errorEl);
      }
    };

    button.addEventListener('click', toggleWidget);
    closeButton.addEventListener('click', toggleWidget);
    sendButton.addEventListener('click', sendMessage);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendMessage();
    });
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWidget);
  } else {
    initWidget();
  }
})();

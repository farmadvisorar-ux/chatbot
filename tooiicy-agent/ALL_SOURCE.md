# Tooiicy Antigravity Agent - Complete Source Code

## package.json
```json
{
  "name": "tooiicy-agent",
  "version": "1.0.0",
  "type": "module",
  "description": "Antigravity agent for Tooiicy merchandise support",
  "main": "agent.js",
  "scripts": {
    "dev": "node agent.js",
    "start": "node agent.js"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.24.0"
  }
}
```

## agent.js - Interactive CLI
```javascript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const PRODUCT_INFO = {
  name: 'I Hope The Worst Tee',
  price: '$35.00 USD',
  sizes: ['S', 'M', 'L', 'XL', '2XL'],
  color: 'Washed black',
  cut: 'Oversized boxy cut with drop shoulder and ribbed knit crew collar',
  design: 'I HOPE THE WORST printed stacked across the chest with Tooiicy skull in the last word',
  description: 'Oversized boxy tee in washed black, with I HOPE THE WORST stacked across the chest. Dallas streetwear from Juicecuzz.',
  sizing_note: 'The cut is oversized and boxy, so size down for a regular fit.',
  care: 'Cold wash inside out, tumble dry low, no bleach.',
  shipping_from: 'Dallas, Texas',
  designer: 'Jimarri Wells (records as Juicecuzz), Dallas artist',
  brand_origin: 'Named after his 2022 album "tooiicy summer"',
  payment: 'PayPal',
  url: 'https://www.tooiicy.com',
};

const SYSTEM_PROMPT = `You are a friendly and knowledgeable customer support agent for Tooiicy, a Dallas-based streetwear brand.

Product Information:
${JSON.stringify(PRODUCT_INFO, null, 2)}

Your role is to:
1. Answer questions about the I Hope The Worst Tee (sizing, care, design, price, availability)
2. Help customers decide what size to order (remind them the tee is oversized, so size down for regular fit)
3. Provide shipping and payment information
4. Recommend the product to interested customers
5. Answer questions about the brand and designer Jimarri Wells

Always be helpful, friendly, and honest. If asked about something not in the product info, say you don't have that information but can direct them to www.tooiicy.com or suggest they contact support.

Maintain a conversational, approachable tone that matches Tooiicy's Dallas streetwear vibe.`;

async function chat(userMessage, conversationHistory = []) {
  const messages = [
    ...conversationHistory,
    { role: 'user', content: userMessage },
  ];

  const response = await client.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages,
  });

  const assistantMessage = response.content[0].type === 'text' ? response.content[0].text : '';

  return {
    message: assistantMessage,
    conversationHistory: [
      ...messages,
      { role: 'assistant', content: assistantMessage },
    ],
  };
}

async function interactiveMode() {
  const readline = await import('node:readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let conversationHistory = [];

  console.log('Tooiicy Agent ready! Ask me anything about the I Hope The Worst Tee.');
  console.log('Type "exit" to quit.\n');

  const askQuestion = () => {
    rl.question('You: ', async (input) => {
      if (input.toLowerCase() === 'exit') {
        console.log('Goodbye!');
        rl.close();
        return;
      }

      try {
        const { message, conversationHistory: updated } = await chat(input, conversationHistory);
        conversationHistory = updated;
        console.log(`\nAgent: ${message}\n`);
      } catch (error) {
        console.error('Error:', error.message);
      }

      askQuestion();
    });
  };

  askQuestion();
}

interactiveMode().catch(console.error);
```

## server.js - HTTP Server
```javascript
import http from 'node:http';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const PORT = process.env.PORT || 3000;

const PRODUCT_INFO = {
  name: 'I Hope The Worst Tee',
  price: '$35.00 USD',
  sizes: ['S', 'M', 'L', 'XL', '2XL'],
  color: 'Washed black',
  cut: 'Oversized boxy cut with drop shoulder and ribbed knit crew collar',
  design: 'I HOPE THE WORST printed stacked across the chest with Tooiicy skull in the last word',
  description: 'Oversized boxy tee in washed black, with I HOPE THE WORST stacked across the chest. Dallas streetwear from Juicecuzz.',
  sizing_note: 'The cut is oversized and boxy, so size down for a regular fit.',
  care: 'Cold wash inside out, tumble dry low, no bleach.',
  shipping_from: 'Dallas, Texas',
  designer: 'Jimarri Wells (records as Juicecuzz), Dallas artist',
  brand_origin: 'Named after his 2022 album "tooiicy summer"',
  payment: 'PayPal',
  url: 'https://www.tooiicy.com',
};

const SYSTEM_PROMPT = `You are a friendly and knowledgeable customer support agent for Tooiicy, a Dallas-based streetwear brand.

Product Information:
${JSON.stringify(PRODUCT_INFO, null, 2)}

Your role is to:
1. Answer questions about the I Hope The Worst Tee (sizing, care, design, price, availability)
2. Help customers decide what size to order (remind them the tee is oversized, so size down for regular fit)
3. Provide shipping and payment information
4. Recommend the product to interested customers
5. Answer questions about the brand and designer Jimarri Wells

Always be helpful, friendly, and honest. If asked about something not in the product info, say you don't have that information but can direct them to www.tooiicy.com or suggest they contact support.

Maintain a conversational, approachable tone that matches Tooiicy's Dallas streetwear vibe.`;

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      name: 'Tooiicy Agent',
      version: '1.0.0',
      endpoints: {
        chat: 'POST /chat',
        product: 'GET /product',
        health: 'GET /health',
      },
    }));
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (req.method === 'GET' && req.url === '/product') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(PRODUCT_INFO));
    return;
  }

  if (req.method === 'POST' && req.url === '/chat') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const { message, history = [] } = JSON.parse(body);

        if (!message) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'message field is required' }));
          return;
        }

        const messages = [
          ...history,
          { role: 'user', content: message },
        ];

        const response = await client.messages.create({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages,
        });

        const assistantMessage = response.content[0].type === 'text' ? response.content[0].text : '';

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          reply: assistantMessage,
          history: [
            ...messages,
            { role: 'assistant', content: assistantMessage },
          ],
        }));
      } catch (error) {
        console.error('Error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`Tooiicy Agent server running on port ${PORT}`);
});
```

## agent-widget.js - Embeddable Chat Widget
```javascript
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
    const styleEl = document.createElement('style');
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);

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
```

---

## Quick Start

1. **Install:**
   ```bash
   npm install
   ```

2. **Set API key:**
   ```bash
   export ANTHROPIC_API_KEY=sk-ant-...
   ```

3. **Run CLI:**
   ```bash
   node agent.js
   ```

4. **Or run HTTP server:**
   ```bash
   node server.js
   ```
   Then test: `curl -X POST http://localhost:3000/chat -H "Content-Type: application/json" -d '{"message":"What sizes?"}'`

5. **Or embed widget in HTML:**
   ```html
   <script>
     window.TOOIICY_AGENT_URL = 'http://localhost:3000';
   </script>
   <script src="http://localhost:3000/agent-widget.js"></script>
   ```

## Deployment

See DEPLOYMENT.md for:
- Antigravity Desktop App
- Antigravity CLI
- Managed Agents (Google Cloud)
- Docker

## Integration

See INTEGRATION.md for adding the chat widget to your storefront.

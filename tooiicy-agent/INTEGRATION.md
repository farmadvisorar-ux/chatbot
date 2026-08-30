# Integrating Tooiicy Agent with Your Storefront

## Quick Start

1. Deploy the agent using one of the methods in DEPLOYMENT.md
2. Get your endpoint URL (e.g., `https://tooiicy-agent.antigravity.app`)
3. Embed in your storefront

## Option A: Add to Existing Storefront

If you already have a website at another URL, add this to your `<head>`:

```html
<script>
  window.TOOIICY_AGENT_URL = 'https://your-agent-endpoint.com';
</script>
<script src="https://your-agent-endpoint.com/agent-widget.js"></script>
```

The chat widget will appear as a floating button in the bottom-right corner.

## Option B: Integrate with live-store Build

Add agent widget to the Vercel storefront:

### In live-store/build.mjs, add to the HTML template:

```javascript
const AGENT_URL = 'https://your-antigravity-endpoint.com';

// In the HTML template, after </body>:
<script>
  window.TOOIICY_AGENT_URL = '${AGENT_URL}';
</script>
<script src="${AGENT_URL}/agent-widget.js"></script>
```

Then rebuild:
```bash
npm run build
```

## Customizing the Widget

### Change the button position:
Edit `agent-widget.js`, modify `.tooiicy-agent-button` CSS:
```css
.tooiicy-agent-button {
  bottom: 20px;    /* Change Y position */
  right: 20px;     /* Change X position */
  /* Or use: left: 20px; instead of right: 20px; */
}
```

### Change colors:
```css
.tooiicy-agent-header {
  background: #000;  /* Change header color */
}

.tooiicy-agent-message.user .tooiicy-agent-message-content {
  background: #000;  /* Change user message color */
}

.tooiicy-agent-message.assistant .tooiicy-agent-message-content {
  background: #f0f0f0;  /* Change assistant message color */
}
```

### Change widget size:
```css
.tooiicy-agent-widget {
  width: 400px;   /* Chat window width */
  height: 600px;  /* Chat window height */
}
```

## Using the API Directly

If you want custom UI, use the API directly:

```javascript
async function chat(userMessage, conversationHistory = []) {
  const response = await fetch('https://your-agent-endpoint.com/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      message: userMessage,
      history: conversationHistory
    })
  });
  
  const { reply, history } = await response.json();
  return { reply, history };
}

// Usage
const { reply, history } = await chat('What sizes do you have?');
console.log(reply);  // Agent's response

// Multi-turn conversation
const { reply: reply2, history: history2 } = await chat(
  'What about 2XL?',
  history  // Pass previous history for context
);
```

## Styling Examples

### Minimal dark theme (already default):
- Black header
- Black user messages, gray assistant messages
- Floating chat bubble

### Light theme:
```css
.tooiicy-agent-widget {
  background: #f8f8f8;
}

.tooiicy-agent-header {
  background: #333;
  color: white;
}

.tooiicy-agent-message.assistant .tooiicy-agent-message-content {
  background: white;
  border: 1px solid #eee;
}
```

### Corner notification style:
```css
.tooiicy-agent-widget {
  width: 350px;
  height: 500px;
  border-radius: 8px;
}

.tooiicy-agent-button {
  width: 50px;
  height: 50px;
}
```

## Analytics Integration

Track customer inquiries by forwarding agent messages to your analytics:

```javascript
// In your analytics tracking code:
const originalFetch = window.fetch;

window.fetch = function(...args) {
  if (args[0].includes('/agent') || args[0].includes('/chat')) {
    // Log agent interaction
    console.log('Customer chatted with agent');
    // Send to your analytics service
  }
  return originalFetch.apply(this, args);
};
```

## Troubleshooting

### Widget doesn't appear
- Check browser console for errors
- Verify `TOOIICY_AGENT_URL` is set correctly
- Ensure CORS is enabled (it is in server.js)

### Agent doesn't respond
- Check API key is valid
- Verify endpoint is reachable: `curl https://your-endpoint.com/health`
- Check browser network tab for errors

### Styling issues
- Use browser dev tools to inspect `.tooiicy-agent-*` elements
- Ensure CSS specificity is high enough to override defaults
- Check for CSS conflicts with your own stylesheets

## Production Checklist

- [ ] Deploy agent to Antigravity
- [ ] Test agent responses
- [ ] Verify CORS settings
- [ ] Add widget to storefront
- [ ] Test on mobile devices
- [ ] Check widget doesn't overlap critical UI
- [ ] Monitor API usage and costs
- [ ] Set up error logging
- [ ] Test conversation memory across page reloads

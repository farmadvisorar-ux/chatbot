# Deploying to Google Antigravity

## Prerequisites

1. Google Antigravity CLI installed (`antigravity` command available)
2. Anthropic API key (get from https://console.anthropic.com)
3. Google Cloud project with Gemini API enabled

## Option 1: Antigravity Desktop App

The simplest way to run the agent locally or on your machine:

1. Open Google Antigravity desktop app
2. Create a new project
3. Add the contents of this directory
4. Set environment variable:
   - `ANTHROPIC_API_KEY` = your-api-key
5. Run `npm install && npm start`

## Option 2: Antigravity CLI Deployment

Deploy as a serverless function:

```bash
# Set your API key
export ANTHROPIC_API_KEY=sk-ant-...

# Deploy
antigravity deploy \
  --name tooiicy-agent \
  --source . \
  --env ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  --runtime node20
```

This creates an endpoint at `https://tooiicy-agent.antigravity.app/` (or similar).

## Option 3: Managed Agents (Gemini API)

For production with Google Cloud integration:

1. Go to Google Cloud Console
2. Create a new Managed Agent in Gemini Enterprise Agent Platform
3. Point to this repository
4. Set `ANTHROPIC_API_KEY` in Cloud environment variables
5. Deploy

## Option 4: Custom Docker Deployment

Build and deploy with Docker:

```dockerfile
FROM node:20
WORKDIR /app
COPY . .
RUN npm install
ENV ANTHROPIC_API_KEY=sk-ant-...
EXPOSE 3000
CMD ["node", "server.js"]
```

Then deploy to your infrastructure (Vercel, Cloud Run, Kubernetes, etc.)

## Integration with Storefront

Once deployed, get your endpoint URL and integrate the widget into your storefront:

### In your HTML head:
```html
<script>
  window.TOOIICY_AGENT_URL = 'https://your-agent-endpoint.com';
</script>
<script src="https://your-agent-endpoint.com/agent-widget.js"></script>
```

### Or directly in live-store/build.mjs:
```javascript
// Add to the HTML template:
`<script>window.TOOIICY_AGENT_URL = '${AGENT_URL}';</script>
 <script src="${AGENT_URL}/agent-widget.js"></script>`
```

## API Endpoints

Once deployed, your agent supports:

- `POST /chat` - Send a message and get a reply
- `GET /product` - Get product information
- `GET /health` - Health check
- `GET /` - Service info

Example usage:
```javascript
const response = await fetch('https://your-agent-endpoint.com/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    message: 'What sizes do you have?',
    history: [] // Previous messages for multi-turn
  })
});
const { reply, history } = await response.json();
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Claude API key |
| `PORT` | No | HTTP port (default: 3000) |
| `NODE_ENV` | No | Set to `production` for production |

## Monitoring

Check agent health:
```bash
curl https://your-agent-endpoint.com/health
```

View server logs in Antigravity dashboard or local console output.

## Costs

- Claude API: ~$0.003 per 1K input tokens, $0.015 per 1K output tokens
- Antigravity execution: included in Gemini API pricing
- Storage: minimal (stateless)

## Support

For questions:
- Antigravity docs: https://ai.google.dev/agents
- Claude API docs: https://docs.anthropic.com
- Tooiicy support: www.tooiicy.com

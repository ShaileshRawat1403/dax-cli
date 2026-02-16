# Subscription Bridge

This bridge gives you the OpenCode-style architecture:
- CLI authenticates with a local/hosted auth flow.
- Your app sends a subscription token to a bridge.
- The bridge forwards the subscription token upstream (or injects fixed auth) and forwards an OpenAI-compatible request.

## 1) Run the bridge

```bash
bun bridges/subscription-bridge/server.ts
```

Defaults:
- `BRIDGE_PORT=8788`
- endpoint: `POST /chat/completions`

## 2) Configure environment

Set these values in `.env`:

```env
# App -> bridge
SUBSCRIPTION_UPSTREAM_CHAT_COMPLETIONS_URL=http://localhost:8788/chat/completions
SUBSCRIPTION_UPSTREAM_BEARER_TOKEN=change_me_bridge_token

# Bridge config
BRIDGE_CLIENT_TOKEN=change_me_bridge_token
UPSTREAM_CHAT_COMPLETIONS_URL=https://your-provider-bridge.example.com/chat/completions
UPSTREAM_FORWARD_SUBSCRIPTION_TOKEN=true
# optional fixed-auth mode instead of token pass-through:
# UPSTREAM_AUTH_BEARER=your_upstream_auth_token_or_api_key
# optional:
# UPSTREAM_AUTH_HEADER_NAME=Authorization
# UPSTREAM_AUTH_HEADER_VALUE=Bearer <exact_value_if_not_using_UPSTREAM_AUTH_BEARER>
```

Important:
- `SUBSCRIPTION_UPSTREAM_BEARER_TOKEN` must match `BRIDGE_CLIENT_TOKEN`.
- Default mode is pass-through: bridge sends `Authorization: Bearer <X-Subscription-Token>` upstream.
- For OpenAI API-key forwarding, set `UPSTREAM_FORWARD_SUBSCRIPTION_TOKEN=false` and configure `UPSTREAM_AUTH_BEARER`.
- For provider-managed subscription mode (no API key), point `UPSTREAM_CHAT_COMPLETIONS_URL` to that provider bridge endpoint.

## 3) Nginx reverse proxy mode

See `bridges/subscription-bridge/nginx.conf.example`.

## 4) Verify

```bash
curl -sS http://localhost:8788/health | jq .
```

Then in CLI:
- `/connect` -> ChatGPT Subscription
- `/provider chatgpt-subscription`

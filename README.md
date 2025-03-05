# hook-relay


## Overview

hook-relay receives webhooks at a server that acts as a single endpoint, and broadcasts these to clients connected via WebSocket. Clients forward the requests to another endpoint (e.g., a development server).

## Use case

### Developing Slack Apps with Multiple Developers

When developing Slack Apps, you can only configure a single endpoint URL. This creates inefficiency when multiple developers need to work simultaneously, as each developer would traditionally need their own Slack App and a proxy solution like ngrok to route requests to their local environment.

With hook-relay, you can maintain just one Slack App and endpoint while allowing multiple developers to connect to it. Each developer can filter for only the events they need, making the development process more efficient and collaborative.

### Handling OAuth Callbacks in Development

When developing OAuth integrations, you need to receive callbacks on your local development server. Unlike webhooks, it's not always clear which client should receive the callback based on its content. 

hook-relay solves this by allowing you to register one-shot callback receivers. This works well for development as long as multiple developers don't need callbacks at exactly the same time.

## Usage

```
$ hook-relay-server --help
Usage: hook-relay-server [options]

Options:
  -V, --version                    output the version number
  --port <number>                  Port to listen on (default: 3000, env: PORT)
  --challenge-passphrase <string>  Passphrase for challenge response (env: CHALLENGE_PASSPHRASE)
  --log-level <string>             Log level (default: "info", env: LOG_LEVEL)
  -h, --help                       display help for command
```

```
$ hook-relay-client --help
Usage: hook-relay-client [options]

Options:
  -V, --version                     output the version number
  --server-endpoint <string>        Server endpoint URL
  --forward-endpoint <string>       Forward endpoint URL
  --path <string>                   Path to use
  --log-level <string>              Log level (default: "info")
  --filter-body-regex <string>      Filter body regex
  --reconnect-interval-ms <number>  Reconnect interval in milliseconds (default: "1000")
  --port <number>                   Port to listen on (default: 3001, env: PORT)
  --challenge-passphrase <string>   Passphrase for challenge response (env: CHALLENGE_PASSPHRASE)
  -h, --help                        display help for command
```

```
# Register a oneshot callback
$ client_id=$(curl -SsfL localhost:3001 | jq -r .clientId) # get client id by HTTP
$ curl -H 'content-type: application/json' \
  -XPOST http://localhost:3000/callback/oneshot/register  \
  -d "{\"path\":\"/auth/redirect\",\"clientId\":\"$client_id\"}"
{"callbackUrl":"http://localhost:3000/callback/oneshot/auth/redirect"}
```

## License

[MIT](LICENSE)

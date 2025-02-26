# hook-relay


## Overview

hook-relay receives webhooks at a server that acts as a single endpoint, and broadcasts these to clients connected via WebSocket. Clients forward the requests to another endpoint (e.g., a development server).

## Use case

### Developing Slack Apps with Multiple Developers

When developing Slack Apps, you can only configure a single endpoint URL. This creates inefficiency when multiple developers need to work simultaneously, as each developer would traditionally need their own Slack App and a proxy solution like ngrok to route requests to their local environment.

With hook-relay, you can maintain just one Slack App and endpoint while allowing multiple developers to connect to it. Each developer can filter for only the events they need, making the development process more efficient and collaborative.

## Usage

```
$ hook-relay-server --help
Usage: hook-relay-server [options]

Options:
  --port <number>       Port to listen on (default: 3000, env: PORT)
  --token <string>      Authentication token (env: AUTH_TOKEN)
  --log-level <string>  Log level (default: "info")
  -h, --help            display help for command
```

```
$ hook-relay-client --help
Usage: hook-relay-client [options]

Options:
  --server-endpoint <string>    Server endpoint URL
  --forward-endpoint <string>   Forward endpoint URL
  --token <string>              Authentication token (env: AUTH_TOKEN)
  --path <string>               Path to use
  --log-level <string>          Log level (default: "info")
  --filter-body-regex <string>  Filter body regex
  -h, --help                    display help for command
```

## License

[MIT](LICENSE)

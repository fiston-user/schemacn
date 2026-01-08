# Contributing

Thanks for helping improve SchemaCN.

## Setup

```bash
npm install
```

## Development

Run the CLI locally:

```bash
node src/cli.js generate --schema /path/to/schema.prisma --out /path/to/app
```

## Notes

- Keep generated templates readable and minimal.
- Avoid adding runtime dependencies to generated code.
- Prefer simple defaults over heavy configuration.

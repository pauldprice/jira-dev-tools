# Performance Optimization

The toolbox now includes performance optimizations for faster startup times.

## Production Mode (Default)

By default, the toolbox runs pre-compiled JavaScript for optimal performance:

```bash
toolbox wizard  # Runs compiled JS - fast startup!
```

### Features:
- Pre-compiled JavaScript (no TypeScript compilation)
- Removed source maps and comments in production
- Optimized Node.js settings
- Automatic build on first run if needed

## Development Mode

For debugging and development, use the `--dev` flag:

```bash
toolbox --dev wizard  # Uses ts-node with full stack traces
```

### Features:
- Direct TypeScript execution with ts-node
- Full source maps and stack traces
- Hot-reloading capabilities
- Better error messages

## Building the Toolbox

### For Development
```bash
npm run build
# or
make build
```

### For Production (Optimized)
```bash
npm run build:prod
# or
make build-prod
```

## Performance Tips

1. **Skip Environment Checks**: Use `--no-check` or `-n` for even faster startup:
   ```bash
   toolbox -n wizard
   ```

2. **Set Environment Variable**: Skip checks globally:
   ```bash
   export TOOLBOX_SKIP_CHECKS=true
   ```

3. **Use Aliases**: Shorter commands start faster:
   ```bash
   toolbox w  # Short for 'wizard'
   ```

## Startup Time Comparison

- **Production mode**: ~0.007 seconds
- **Development mode**: ~1-2 seconds (TypeScript compilation)
- **With --no-check**: Additional ~50% faster

## Build System

The build system includes:
- TypeScript compilation to ES2020
- Shebang fixing for executable scripts
- Automatic chmod +x for tool scripts
- Separate production config (no source maps)

## Troubleshooting

### "No compiled JavaScript found"
The toolbox will automatically build on first run. To manually build:
```bash
npm run build
```

### Development Mode Not Working
Ensure ts-node is installed:
```bash
npm install
```

### Slow Startup in Production
1. Check if dist/ directory exists
2. Rebuild: `npm run build:prod`
3. Use `--no-check` flag

## Future Optimizations

Potential future improvements:
- Bundle with esbuild/webpack for single-file execution
- Native ESM modules when Node.js support improves
- Lazy loading of heavy dependencies
- Pre-compiled native binaries with pkg
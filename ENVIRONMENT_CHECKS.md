# Toolbox Environment Checks

The `toolbox` shell script now performs comprehensive environment checks before launching. Here's what it checks and suggestions for additional checks:

## Current Checks

1. **Node.js Version**
   - Verifies Node.js is installed
   - Checks against `.nvmrc` file (22.14.0)
   - Ensures minimum version (16.0.0) from package.json engines
   - Warns if version mismatch and suggests `nvm use`

2. **npm Installation**
   - Verifies npm is available

3. **Dependencies**
   - Checks if node_modules exists
   - Auto-installs if missing
   - Verifies ts-node and TypeScript are in node_modules

4. **Git Installation**
   - Warns if git is missing (required for release-notes)

5. **Environment Variables**
   - Checks for ANTHROPIC_API_KEY
   - Checks for config files (~/.toolbox/config.json, ~/.toolboxrc.json)
   - Provides helpful guidance on where to set configs

## Performance Optimization

- Use `--no-check` or `-n` flag to skip checks for faster startup
- Set `TOOLBOX_SKIP_CHECKS=true` environment variable for persistent skipping

## Suggested Additional Checks

### 1. **Disk Space**
```bash
# Check available disk space for cache and temp files
AVAILABLE_SPACE=$(df -k . | tail -1 | awk '{print $4}')
MIN_SPACE_KB=100000  # 100MB minimum
if [ "$AVAILABLE_SPACE" -lt "$MIN_SPACE_KB" ]; then
    echo "Warning: Low disk space available"
fi
```

### 2. **Network Connectivity**
```bash
# Check if can reach external APIs
if ! curl -s --head https://api.github.com > /dev/null; then
    echo "Warning: Cannot reach external APIs"
fi
```

### 3. **Chromium for Puppeteer**
```bash
# Check if Chromium is installed for PDF generation
if [ ! -d "$SCRIPT_DIR/node_modules/puppeteer/.local-chromium" ]; then
    echo "Warning: Chromium not installed for PDF generation"
    echo "Run: cd $SCRIPT_DIR && npx puppeteer browsers install chrome"
fi
```

### 4. **Write Permissions**
```bash
# Check write permissions for cache directory
if ! touch "$SCRIPT_DIR/.toolbox_cache/.write_test" 2>/dev/null; then
    echo "Warning: Cannot write to cache directory"
else
    rm -f "$SCRIPT_DIR/.toolbox_cache/.write_test"
fi
```

### 5. **Memory Check**
```bash
# Check available memory (macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
    AVAILABLE_MEM=$(vm_stat | grep "Pages free" | awk '{print $3}' | sed 's/\.//')
    # Check if less than 500MB free
    if [ "$AVAILABLE_MEM" -lt 128000 ]; then
        echo "Warning: Low memory available"
    fi
fi
```

### 6. **Port Availability**
```bash
# Check if default Express port is available (for wizard)
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "Warning: Port 3000 is in use (may affect wizard PDF generation)"
fi
```

### 7. **Config File Validation**
```bash
# Validate JSON config files
if [ -f "$HOME/.toolbox/config.json" ]; then
    if ! python -m json.tool "$HOME/.toolbox/config.json" >/dev/null 2>&1; then
        echo "Warning: Invalid JSON in ~/.toolbox/config.json"
    fi
fi
```

### 8. **Tool-Specific Checks**
- For `release-notes`: Check if in a git repository
- For `bitbucket`: Check if Bitbucket token is configured
- For `analyze-pdf`: Check if file exists and is readable

These checks would make the toolbox more robust but should be balanced against startup time. The `--no-check` flag allows users to skip checks once they know their environment is properly configured.
.PHONY: build build-prod clean install dev help

# Default target
help:
	@echo "JIRA Dev Tools - Build Commands"
	@echo ""
	@echo "  make build      - Build for development (with source maps)"
	@echo "  make build-prod - Build for production (optimized)"
	@echo "  make clean      - Clean build artifacts"
	@echo "  make install    - Install dependencies"
	@echo "  make dev        - Start development mode"
	@echo ""

# Build for development
build:
	npm run build

# Build for production (smaller, faster)
build-prod:
	npm run build:prod

# Clean build artifacts
clean:
	npm run clean

# Install dependencies
install:
	npm install

# Development mode
dev:
	@echo "Use './toolbox --dev <command>' to run commands in development mode"
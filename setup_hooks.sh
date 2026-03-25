#!/bin/bash
# Sets up git hooks for the r65docs project

HOOK_DIR="$(git rev-parse --show-toplevel)/.git/hooks"

cat > "$HOOK_DIR/pre-push" << 'EOF'
#!/bin/bash
echo "Running npm run build before push..."
npm run build
EOF

chmod +x "$HOOK_DIR/pre-push"
echo "Pre-push hook installed."

#!/bin/bash
# Rebuild the R65 compiler wheel and copy it to static/pyodide/
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPILER_DIR="$(dirname "$SCRIPT_DIR")"

echo "Building wheel from $COMPILER_DIR..."
cd "$COMPILER_DIR"
python setup.py bdist_wheel --dist-dir "$SCRIPT_DIR/static/pyodide" 2>&1 | tail -1

echo "Done: $(ls -lh "$SCRIPT_DIR/static/pyodide"/r65-*.whl | awk '{print $NF, $5}')"

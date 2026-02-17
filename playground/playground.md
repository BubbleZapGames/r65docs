# R65 Playground — Design Document

A browser-based R65 compiler playground at `r65lang.dev/playground`, integrated into the existing Docusaurus documentation site. Users write R65 source code and see compiled WLA-DX assembly output — no backend required.

## Goals

- **Zero infrastructure**: Entire compiler runs client-side via Pyodide (CPython compiled to WebAssembly)
- **Integrated experience**: Same Layout, navbar, theme, and dark-mode styling as the docs site
- **Compile-only scope**: No assembler, linker, or emulator — just R65 source to WLA-DX assembly
- **Pre-loaded examples**: Curated snippets so users can explore the language immediately

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Browser                                            │
│                                                     │
│  ┌──────────┐  source   ┌───────────────────────┐   │
│  │CodeMirror│ ────────► │  Pyodide (WASM)       │   │
│  │  Editor  │           │                       │   │
│  └──────────┘  assembly │  CPython 3.11+        │   │
│  ┌──────────┐ ◄──────── │  ├── lark (PyPI)      │   │
│  │ Output   │           │  └── r65 wheel        │   │
│  │ Panel    │           │      (static/pyodide/) │   │
│  └──────────┘           └───────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### Component Breakdown

| Component | Source | Size | Notes |
|-----------|--------|------|-------|
| Pyodide runtime | jsDelivr CDN | ~6-7 MB | Browser-cached after first load |
| R65 compiler | `static/pyodide/r65-0.1.0-py3-none-any.whl` | ~200 KB | Pure Python wheel, served locally |
| lark parser | PyPI via micropip | ~300 KB | Installed at runtime from PyPI |
| CodeMirror 6 | npm | ~300 KB | Rust syntax mode (closest to R65) |

### Why These Choices

**Pyodide over a backend**: The R65 compiler is pure Python with one dependency (lark). Pyodide lets us run CPython in WebAssembly, eliminating server costs, latency, and scaling concerns. The ~6 MB initial download is cached by the browser.

**CodeMirror over Monaco**: Monaco Editor (VS Code's editor) is 2-5 MB and pulls in many features we don't need. CodeMirror 6 is ~300 KB, modular, and has better mobile support. Its Rust syntax mode provides reasonable highlighting for R65 (keywords, strings, comments, operators all overlap).

**Rust syntax mode**: R65's syntax is Rust-derived — `fn`, `let`, `struct`, `enum`, `//` comments, `/* */` blocks, `->` returns, `::` paths all highlight correctly out of the box. A custom R65 grammar can be added later.

## Pyodide Integration

### Loading Strategy

Pyodide is loaded **only on the /playground page**, not site-wide. This avoids penalizing docs page load times.

```javascript
// PyodideProvider.js — dynamic loading
async function initPyodide() {
  // 1. Inject Pyodide script tag
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/pyodide/v0.27.4/full/pyodide.js';
  document.head.appendChild(script);

  await new Promise(resolve => { script.onload = resolve; });

  // 2. Initialize Pyodide runtime
  const pyodide = await loadPyodide();

  // 3. Install lark from PyPI
  await pyodide.loadPackage('micropip');
  const micropip = pyodide.pyimport('micropip');
  await micropip.install('lark');

  // 4. Install R65 compiler from local wheel
  await micropip.install('/pyodide/r65-0.1.0-py3-none-any.whl');

  // 5. Import compiler module
  pyodide.runPython(`
from r65.compiler.main import compile_string
from r65.compiler.errors import CompilerError, format_error
  `);

  return pyodide;
}
```

### Compilation Wrapper

The `compile_string()` function in `r65/compiler/main.py:331` is the ideal entry point:

```python
def compile_string(source: str, filename: str = "<string>") -> str
```

It runs the full pipeline (parse → preprocess → macros → HIR → type check → MIR → codegen) and returns assembly as a string. Exceptions propagate naturally — it does not call `sys.exit()`.

The JavaScript wrapper catches Python exceptions and returns a structured result:

```javascript
// useCompiler.js
function compile(pyodide, source) {
  try {
    const result = pyodide.runPython(`
try:
    output = compile_string(${JSON.stringify(source)}, "playground.r65")
    result = {"success": True, "output": output, "error": None}
except CompilerError as e:
    formatted = format_error(
        e.message,
        source_loc=e.source_loc,
        source_text=${JSON.stringify(source)},
        hint=getattr(e, 'hint', None),
        error_type="error"
    )
    result = {"success": False, "output": None, "error": formatted}
except Exception as e:
    result = {"success": False, "output": None, "error": str(e)}
result
    `);
    return result.toJs({ dict_converter: Object.fromEntries });
  } catch (err) {
    return { success: false, output: null, error: err.message };
  }
}
```

### Error Output

Compiler errors are already formatted in a Rust-style diagnostic format by `format_error()` (`errors.py:357`):

```
error: unexpected token '('
  --> playground.r65:10:5
   |
10 |     fn bad(x:
   |           ^ expected identifier or type
   |
hint: check for missing closing parenthesis
```

This output is displayed directly in a `<pre>` block with CSS colorization:
- `error:` prefix in `#e74c3c` (site primary/red)
- `hint:` prefix in `#3498db` (blue)
- Line numbers and `-->` in `#7f8c8d` (gray)
- Carets (`^`) in `#e74c3c` (red)

## File Structure

### New Files

```
r65docs/
  src/
    pages/
      playground.js                  # Page component (Docusaurus Layout wrapper)
      playground.module.css          # Scoped page styles
    components/
      Playground/
        Editor.js                    # CodeMirror 6 wrapper
        OutputPanel.js               # Assembly output / error display
        Toolbar.js                   # Compile button, examples dropdown, status
        PyodideProvider.js           # Pyodide lifecycle management
        examples.js                  # Example snippet definitions
        useCompiler.js               # React hook: compile source → result
  static/
    pyodide/
      r65-0.1.0-py3-none-any.whl    # Pre-built compiler wheel
```

### Modified Files

**`docusaurus.config.js`** — Add Playground navbar link:
```javascript
navbar: {
  title: 'R65',
  items: [
    { type: 'docSidebar', sidebarId: 'docsSidebar', position: 'left', label: 'Docs' },
    { to: '/playground', label: 'Playground', position: 'left' },  // NEW
    { href: 'https://github.com/BubbleZapGames/r65docs', label: 'GitHub', position: 'right' },
  ],
},
```

**`package.json`** — Add CodeMirror dependencies:
```json
{
  "dependencies": {
    "codemirror": "^6.0.0",
    "@codemirror/lang-rust": "^6.0.0",
    "@codemirror/theme-one-dark": "^6.0.0",
    "@codemirror/view": "^6.0.0",
    "@codemirror/state": "^6.0.0"
  }
}
```

**`.github/workflows/deploy.yml`** — Add wheel build step (see [Build Pipeline](#build-pipeline)).

## UI Layout

### Desktop (>=768px)

```
┌─────────────────────────────────────────────────────┐
│  R65    Docs   Playground                   GitHub  │  ← Navbar
├─────────────────────────────────────────────────────┤
│  [▶ Compile]  [Examples ▾]           ● Ready        │  ← Toolbar
├──────────────────────┬──────────────────────────────┤
│                      │                              │
│   R65 Source         │   WLA-DX Assembly Output     │
│   (CodeMirror)       │   (read-only, monospace)     │
│                      │                              │
│                      │                              │
│                      │                              │
│                      │                              │
│                      │                              │
├──────────────────────┴──────────────────────────────┤
│  Footer                                             │
└─────────────────────────────────────────────────────┘
```

### Mobile (<768px)

Editor and output stack vertically — editor on top (60% height), output below (40% height).

### Styling

The playground inherits the site's existing theme variables from `src/css/custom.css`:

| Element | Dark Mode | Light Mode |
|---------|-----------|------------|
| Page background | `#1a1a2e` (--ifm-background-color) | Default Docusaurus |
| Panel backgrounds | `#16213e` (--ifm-background-surface-color) | Default Docusaurus |
| Compile button | `#e74c3c` (--ifm-color-primary) | `#c0392b` |
| Code font | JetBrains Mono (--ifm-font-family-monospace) | Same |
| Editor theme | CodeMirror oneDark (matches Dracula code blocks) | CodeMirror default |

### Loading State

While Pyodide initializes (~3-5 seconds on first visit, instant from cache):

- Compile button disabled, grayed out
- Status indicator shows progress text cycling through:
  - "Loading Pyodide runtime..."
  - "Installing parser..."
  - "Loading R65 compiler..."
  - "Ready" (green dot)
- Editor is usable immediately — users can type while the compiler loads

### Keyboard Shortcut

**Ctrl+Enter** (Cmd+Enter on Mac) triggers compilation from the editor.

## Example Snippets

Self-contained examples that don't require `include!()` — the playground has no virtual filesystem in v1.

### Starter Examples

**Hello Registers** (default, loaded on page open):
```rust
// R65 Playground — Register binding example
fn add_offset(value @ A: u8, offset @ X: u16) -> u8 {
    let result @ A = A + 1;
    return result;
}
```

**Fibonacci**:
```rust
#[zeropage] static mut FIB_A: u8;
#[zeropage] static mut FIB_B: u8;
#[zeropage] static mut FIB_N: u8;

fn fibonacci(n @ A: u8) -> u8 {
    FIB_A = 0;
    FIB_B = 1;
    FIB_N = n;
    while FIB_N > 0 {
        let temp @ A = FIB_B;
        FIB_B = FIB_A + FIB_B;
        FIB_A = temp;
        FIB_N--;
    }
    return FIB_A;
}
```

**Enum + Struct**:
```rust
enum Direction { North = 0, East, South, West }

struct Entity {
    x: u8,
    y: u8,
    facing: u8,
}

#[ram]
static mut PLAYER: Entity = Entity { x: 128, y: 112, facing: 0 };

fn move_player(dir @ A: u8) {
    if dir == Direction::North as u8 {
        PLAYER.y--;
    } else if dir == Direction::South as u8 {
        PLAYER.y++;
    }
    PLAYER.facing = dir;
}
```

**Interrupt Handler**:
```rust
#[zeropage] static mut FRAME_COUNT: u16;

#[interrupt(nmi)]
fn vblank() {
    FRAME_COUNT++;
}
```

### Sourced from Examples Directory

Larger examples adapted from `examples/`:
- **Quicksort** — adapted from `quicksort_cards.r65` (self-contained, demonstrates recursion, structs, enums)
- **Game World** — adapted from `game_world.r65` (self-contained, demonstrates AI state machines, pathfinding, arrays)

These are trimmed to their most interesting sections to keep compile times fast in the browser.

### Example Data Format

```javascript
// examples.js
export const EXAMPLES = [
  {
    name: 'Hello Registers',
    description: 'Register binding and function basics',
    source: `// R65 Playground — Register binding example\n...`,
  },
  {
    name: 'Fibonacci',
    description: 'Loop-based fibonacci with zeropage variables',
    source: `...`,
  },
  // ...
];
```

## Build Pipeline

### Wheel Build

The R65 compiler is packaged as a standard Python wheel. The existing `setup.py` already defines the package:

```
name: r65
version: 0.1.0
dependencies: lark>=1.1.0
includes: r65/compiler/**, r65/compiler/frontend/*.lark, r65/templates/**
```

Build command:
```bash
pip install wheel
python setup.py bdist_wheel
# Output: dist/r65-0.1.0-py3-none-any.whl
```

The wheel is pure Python (`py3-none-any`) — no native extensions, so it runs directly in Pyodide without compilation.

### CI Integration

Add to `.github/workflows/deploy.yml`:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      # NEW: Checkout R65 compiler repo and build wheel
      - name: Checkout R65 compiler
        uses: actions/checkout@v4
        with:
          repository: BubbleZapGames/R65    # or wherever the compiler lives
          path: r65-compiler

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Build R65 wheel
        run: |
          cd r65-compiler
          pip install wheel
          python setup.py bdist_wheel
          cp dist/r65-*.whl ../static/pyodide/

      # Existing steps continue...
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: build
```

### Local Development

For local testing without CI:

```bash
# From R65 repo root
python setup.py bdist_wheel
cp dist/r65-*.whl r65docs/static/pyodide/

# From r65docs/
npm start
# Visit http://localhost:3000/playground
```

## Component Details

### playground.js — Page Component

Uses Docusaurus `Layout` so the playground gets the navbar, footer, and theme for free:

```jsx
import React from 'react';
import Layout from '@theme/Layout';
import { PyodideProvider } from '../components/Playground/PyodideProvider';
import { Toolbar } from '../components/Playground/Toolbar';
import { Editor } from '../components/Playground/Editor';
import { OutputPanel } from '../components/Playground/OutputPanel';
import styles from './playground.module.css';

export default function PlaygroundPage() {
  return (
    <Layout title="Playground" description="R65 online compiler playground">
      <PyodideProvider>
        <div className={styles.playground}>
          <Toolbar />
          <div className={styles.panels}>
            <Editor />
            <OutputPanel />
          </div>
        </div>
      </PyodideProvider>
    </Layout>
  );
}
```

### PyodideProvider.js — Lifecycle Manager

React context provider managing Pyodide state:

- **States**: `loading` | `ready` | `error`
- **Progress text**: Updates during each init phase
- **Exposes**: `compile(source)` function, `status`, `statusText`
- Initialization fires once via `useEffect` on mount
- Handles errors gracefully (shows banner if Pyodide fails to load)

### Editor.js — CodeMirror Wrapper

- Mounts CodeMirror 6 with Rust language mode
- `oneDark` theme in dark mode, default light theme otherwise
- Respects Docusaurus theme toggle via `useColorMode()` hook
- Emits source text on change (debounced for state updates, not for compilation)
- Binds Ctrl+Enter / Cmd+Enter to compile action

### OutputPanel.js — Assembly / Error Display

- Renders compiler output in a read-only `<pre>` block
- On success: WLA-DX assembly with syntax highlighting (NASM Prism mode, already configured in docusaurus.config.js)
- On error: Rust-style diagnostic with CSS colorization
- Shows placeholder text ("Press Compile or Ctrl+Enter") before first compilation

### Toolbar.js — Controls

- **Compile button**: Red (#e74c3c), disabled during Pyodide init or active compilation
- **Examples dropdown**: `<select>` populated from `examples.js`
- **Status indicator**: Colored dot (gray=loading, green=ready, red=error) + text

## Performance Considerations

| Metric | Expected | Notes |
|--------|----------|-------|
| First load (cold) | 3-5 seconds | Pyodide download (~6 MB), lark install, wheel install |
| Subsequent loads | <1 second | Pyodide cached by browser, micropip caches packages |
| Compilation time | 50-200 ms | Small snippets; R65 compiler is fast for playground-sized code |
| Editor input lag | <16 ms | CodeMirror 6 is highly optimized |

### Caching

- Pyodide runtime: cached by browser via CDN cache headers (jsDelivr uses long-lived caches)
- R65 wheel: cached as a static asset by the Docusaurus build
- lark: cached by micropip in IndexedDB across sessions

## Future Enhancements

These are documented for future reference but are **not part of the initial implementation**.

### Web Worker Compilation

Move Pyodide to a Web Worker so compilation never blocks the UI thread. This matters for large files but is unnecessary for playground-sized snippets.

```javascript
// compiler.worker.js
importScripts('https://cdn.jsdelivr.net/pyodide/v0.27.4/full/pyodide.js');
// ... init pyodide in worker context
self.onmessage = async (e) => {
  const result = compile(e.data.source);
  self.postMessage(result);
};
```

### Output Tabs

Add tabs to the output panel showing different compiler stages:

- **ASM** (default) — WLA-DX assembly output
- **Tokens** — Lexer token stream (`--dump-tokens`)
- **AST** — Parsed syntax tree (`--dump-ast`)
- **HIR** — High-level IR (`--dump-hir`)
- **MIR** — Mid-level IR with CFG (`--dump-mir`)

These map to existing `--dump-*` CLI flags. The `compile_source()` function in `main.py` already supports these; `compile_string()` would need optional parameters or a richer wrapper.

### Draggable Split Pane

Replace the fixed 50/50 flexbox split with a draggable divider, letting users resize editor vs. output. Libraries like `react-split` or a simple mouse-drag handler.

### Optimization Level Selector

Dropdown to select `-O0` / `-O1` / `-O2`, mapping to the compiler's optimization passes. Requires extending `compile_string()` to accept an optimization level parameter.

### URL Sharing

Encode the source code in the URL hash as base64 so users can share playground links:

```
r65lang.dev/playground#base64encodedSource
```

On load, decode the hash and populate the editor. Keeps URLs bookmarkable and shareable without any backend.

### Virtual Filesystem for include!()

Bundle the R65 stdlib as a JSON manifest and mount it in Pyodide's virtual filesystem:

```javascript
// Mount stdlib files into Pyodide's emscripten FS
pyodide.FS.mkdirTree('/stdlib');
for (const [path, content] of Object.entries(stdlibFiles)) {
  pyodide.FS.writeFile(`/stdlib/${path}`, content);
}
```

This would enable examples that use `include!("lib/sneslib.r65")` and give users access to the full standard library. Requires a build step to generate `stdlib.json` from the `stdlib/` directory.

# Setup

This guide covers installing the R65 compiler toolchain and creating your first SNES project.

## Prerequisites

R65 requires:

- **Python 3.8+** (3.10 or later recommended)
- **WLA-DX** assembler and linker (wla-65816, wlalink)
- **Git** (to clone the repository)

Optional:

- **Mesen** or **bsnes** emulator (to run compiled ROMs)
- **make** (to use the generated Makefiles)

---

## Step 1: Install Python

Verify your Python version:

```bash
python3 --version   # Must be 3.8 or higher
```

If Python is not installed or too old:

- **Ubuntu/Debian**: `sudo apt install python3 python3-pip`
- **Fedora**: `sudo dnf install python3 python3-pip`
- **macOS**: `brew install python` or download from [python.org](https://www.python.org/downloads/)
- **Windows**: Download from [python.org](https://www.python.org/downloads/) (check "Add to PATH" during install)

## Step 2: Install WLA-DX

WLA-DX is the assembler and linker that converts R65 compiler output into SNES ROMs.

**macOS (Homebrew):**

```bash
brew install wla-dx
```

**Linux (build from source):**

```bash
git clone https://github.com/vhelin/wla-dx.git
cd wla-dx
mkdir build && cd build
cmake ..
cmake --build . --config Release
sudo cmake --install .
```

**Pre-built binaries:**

Download from the [WLA-DX releases page](https://github.com/vhelin/wla-dx/releases) and place `wla-65816` and `wlalink` on your PATH.

**Verify installation:**

```bash
wla-65816       # Should print version banner (v10.x)
wlalink         # Should print usage info
```

## Step 3: Install R65

Clone the repository and install in development mode:

```bash
git clone https://github.com/neutron-emulation/R65.git
cd R65
pip install -e .
```

This installs three command-line tools:

| Command | Purpose |
|---------|---------|
| `r65c`  | Compiler (R65 source to WLA-DX assembly) |
| `r65x`  | Project tool (scaffolding, asset generation) |

**Verify installation:**

```bash
r65c --help
r65x --help
```

### Development dependencies (optional)

To run the test suite:

```bash
pip install -e ".[dev]"
python -m pytest r65/tests/
```

---

## Step 4: Create a project

Use `r65x init` to scaffold a new SNES project:

```bash
r65x init --platform snes my_game
cd my_game
```

This creates:

```
my_game/
├── src/
│   ├── main.r65            # Entry point
│   └── lib/                # Standard library (copied from stdlib/)
│       ├── 65816.r65
│       ├── sneslib.r65
│       ├── math.r65
│       └── ...
├── build/                  # Compiled output (created on first build)
├── Makefile                # Build system
└── README.md
```

The generated `main.r65` is a minimal SNES program:

```rust
#[snesrom(name="MY_GAME")]

include!("lib/65816.r65")
include!("lib/sneslib.r65")
include!("lib/math.r65")

#[bank(0)]

#[interrupt(nmi)]
fn nmi_handler() {
    clear_nmi!()
}

#[entry]
fn main() -> ! {
    snes_init();
    INIDISP = 0x0;

    loop {

    }
}
```

## Step 5: Build

```bash
make
```

The build pipeline runs three stages:

1. **Compile** — `r65c` translates R65 source to WLA-DX assembly (`.asm`)
2. **Assemble** — `wla-65816` assembles the output into an object file (`.o`)
3. **Link** — `wlalink` links the object into a SNES ROM (`.smc`)

The final ROM is placed in `build/MY_GAME.smc`.

### Build targets

| Target | Description |
|--------|-------------|
| `make` | Build the ROM (default) |
| `make run` | Build and launch in emulator (Mesen, bsnes, or higan) |
| `make clean` | Remove all build artifacts |
| `make syntax` | Compile R65 to assembly only (no ROM) |
| `make debug` | Rebuild from scratch with verbose output |
| `make install-deps` | Install WLA-DX via Homebrew |

## Step 6: Run

Open the ROM in a SNES emulator:

```bash
make run    # Auto-detects Mesen, higan, or bsnes
```

Or open `build/MY_GAME.smc` directly in your emulator of choice.

---

## Next steps

- [Compiler Reference](../platform/compiler.md) — all `r65c` flags, optimization levels, diagnostic dumps, build pipeline, and debugging with Mesen
- [Project Tools Reference](../platform/tools.md) — `r65x` commands for project scaffolding, font generation, data compression, and bitmap-to-tile conversion

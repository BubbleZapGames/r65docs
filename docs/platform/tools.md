---
sidebar_position: 3
title: Tools
description: Useful tools for managing projects
---

# R65 Project Tool (`r65x`)

`r65x` is the R65 project management and asset pipeline tool. It provides project scaffolding, font generation, data compression, and bitmap-to-tile conversion for SNES development.

```bash
r65x --help
r65x <command> --help
```

---

## `r65x init` — Create a new project

Scaffolds a complete SNES project with source files, standard library, Makefile, and documentation.

```bash
r65x init --platform snes my_game
```

**Arguments:**

| Argument | Description |
|----------|-------------|
| `--platform snes` | Target platform (required, currently only `snes`) |
| `directory` | Project directory name to create |

## `r65x fontgen` — Generate SNES font tiles

Renders a TrueType monospace font into SNES tile data with 3-color anti-aliased output (background, edge, solid). Prints an R65 array literal to stdout that can be pasted or redirected into a `.r65` source file.

```bash
# Use default font (DejaVu Sans Mono Bold)
r65x fontgen > src/lib/my_font.r65

# Use a custom font
r65x fontgen --font path/to/font.ttf > src/lib/my_font.r65

# Preview tiles as ASCII art
r65x fontgen --preview
```

**Options:**

| Option | Default | Description |
|--------|---------|-------------|
| `--font PATH` | DejaVu Sans Mono Bold | Path to a `.ttf` font file |
| `--size N` | auto | Font point size (0 = auto-detect best fit for 8x8 tiles) |
| `--color {2,4,8}` | 2 | Bits per pixel: 2 (4 colors), 4 (16 colors), 8 (256 colors) |
| `--low-thresh N` | 20 | Grayscale threshold for anti-aliased edges (0-255) |
| `--high-thresh N` | 80 | Grayscale threshold for solid body (0-255) |
| `--bold` | off | Make font bolder (can be repeated: `--bold --bold`) |
| `--preview` | off | Print ASCII art preview of all tiles to stderr |

**Example workflow:**

```bash
# Generate font and redirect to a source file
r65x fontgen --font /usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf \
    --color 2 > src/lib/my_font.r65

# Include in your program
# include!("lib/my_font.r65")
```

---

## `r65x packer` — Data compression

Encodes and decodes binary files using various SNES-era compression algorithms. Useful for compressing tilesets, tilemaps, and other large data before embedding in ROM.

```bash
# Compress
r65x packer pack data.bin -o data.lz4 -x lz4

# Decompress
r65x packer unpack data.lz4 -o data.bin -x lz4
```

**Arguments:**

| Argument | Description |
|----------|-------------|
| `pack` or `unpack` | Action (compress or decompress) |
| `input.bin` | Input file path |
| `-o`, `--output` | Output file path (required) |
| `-x`, `--encoding` | Compression algorithm (required) |
| `-f`, `--fullsize` | Write full data, ignoring destination file size |

**Supported algorithms:**

| Algorithm | Description |
|-----------|-------------|
| `aplib` | aPLib compression |
| `byte_rle` | Byte-level run-length encoding |
| `hal` | HAL Laboratory compression (Kirby, etc.) |
| `lz1` | LZ variant 1 |
| `lz2` | LZ variant 2 |
| `lz3` | LZ variant 3 |
| `lz4` | LZ variant 4 |
| `lz5` | LZ variant 5 |
| `lz19` | LZ variant 19 |
| `lz77` | Standard LZ77 |
| `rle1` | Run-length encoding variant 1 |
| `rle2` | Run-length encoding variant 2 |

**Example: compress a tileset for ROM inclusion:**

```bash
# Compress tileset
r65x packer pack assets/tiles.bin -o build/tiles.lz5 -x lz5

# Include compressed data in R65 source
# static TILES_LZ5 = include_bytes!("../build/tiles.lz5");
```

The game code is then responsible for decompressing at runtime into VRAM or RAM.

---

## `r65x bmp2chr` — Bitmap to SNES tile conversion

Converts an indexed bitmap image (`.bmp`) into SNES CHR tile data. Supports all SNES color depths and tile formats.

```bash
r65x bmp2chr sprite_sheet.bmp -o sprites.chr -b4
```

**Arguments:**

| Argument | Description |
|----------|-------------|
| `input.bmp` | Input indexed bitmap file |
| `-o`, `--output` | Output `.chr` file path (required) |

**Format options** (pick one):

| Flag | Colors | Description |
|------|--------|-------------|
| `-b2` | 4 | 2bpp planar (backgrounds, fonts) |
| `-b3` | 8 | 3bpp planar |
| `-b4` | 16 | 4bpp planar (sprites, most backgrounds) |
| `-b8` | 256 | 8bpp planar |
| `-l2` | 4 | 2bpp linear |
| `-l4` | 16 | 4bpp linear |
| `-l8` | 256 | 8bpp linear |
| `-m7` | 256 | Mode 7 (8bpp, 1 byte per pixel) |

**Additional options:**

| Flag | Description |
|------|-------------|
| `-p`, `--palette` | Also output a `.pal` color palette file |
| `-t`, `--tilemap` | De-duplicate tiles and output a `.tilemap` file |
| `-f`, `--fullsize` | Write full bitmap data (ignore CHR file size limits) |

**Example: convert a 4bpp sprite sheet with palette:**

```bash
r65x bmp2chr assets/player.bmp -o build/player.chr -b4 --palette
# Produces: build/player.chr and build/player.pal
```

**Example: convert background with tile deduplication:**

```bash
r65x bmp2chr assets/level1_bg.bmp -o build/level1.chr -b2 --tilemap
# Produces: build/level1.chr and build/level1.tilemap
```

**Input requirements:**

- The bitmap must be an indexed-color `.bmp` file (not RGB)
- Tile dimensions are 8x8 pixels; the image dimensions should be multiples of 8
- The number of colors in the palette must match the chosen bit depth (e.g., 16 or fewer colors for `-b4`)

---

## Typical asset pipeline

A common SNES project workflow combines these tools:

```bash
# 1. Create project
r65x init --platform snes my_game
cd my_game

# 2. Convert art assets
r65x bmp2chr assets/sprites.bmp -o build/sprites.chr -b4 --palette
r65x bmp2chr assets/background.bmp -o build/bg.chr -b2 --tilemap

# 3. Compress large assets
r65x packer pack build/bg.chr -o build/bg.lz4 -x lz4

# 4. Generate font
r65x fontgen > src/lib/my_font.r65

# 5. Build ROM
make
```

In the R65 source, reference the converted assets:

```rust
// Include raw CHR data
static SPRITES = include_bytes!("sprites.chr");

// Include compressed data (decompress at runtime)
static BG_TILES_LZ4 = include_bytes!("bg.lz4");
```

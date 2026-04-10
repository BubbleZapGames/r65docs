---
sidebar_position: 6
title: Built-in Library 
description: Built-in Library functions.
---


# Built-in Library Reference

R65 provides built-in functions that the compiler recognizes without any `include!()`. They fall into two categories: **runtime builtins** that emit 65816 instructions, and **compile-time builtins** that are evaluated during compilation and produce constant values.

---

## Runtime Built-ins

These functions emit inline 65816 instructions. They are available everywhere and have zero call overhead (no JSR/RTS).

### Processor Control

#### `NOP()` / `NOP(count)`

No operation. With an argument, repeats `count` times.

```rust
NOP();    // Emits: NOP           (1x, 2 cycles)
NOP(4);   // Emits: NOP NOP NOP NOP (4x, 8 cycles)
```

Used to insert timing delays, typically when waiting for hardware multiplier or divider results.

`NOP` is the only instruction-shaped built-in because its optional repeat
count justifies dedicated compiler support. For other single-instruction
primitives — `WAI`, `STP`, `XBA`, `COP`, `MVN`, `MVP`, `BRK` — use
`asm!()` directly:

```rust
asm!("WAI");          // Halt until next interrupt
asm!("STP");          // Stop processor (fatal halt)
asm!("XBA");          // Swap A/B bytes
asm!("COP #$00");     // Co-processor interrupt
asm!("BRK #$00");     // Debugger/software break
asm!("MVN $00, $7E"); // Block move forward (see stdlib block_move!)
```

For block moves against R65 symbols, prefer the `block_move!` macro in
`stdlib/65816.r65`, which resolves banks from the symbols and handles
DBR save/restore. For stack-overflow detection, see `stack_guard_check!`
in the same file.

---

## Compile-Time Built-ins

These functions are evaluated entirely at compile time. They produce integer literals in the output — no runtime code is generated. They can be used in `const` declarations, `static` array sizes, and inside `const fn` bodies.

### Type Information

#### `size_of(Type) -> u16`

Returns the size of a type in bytes.

```rust
struct Player { x: u8, y: u8, health: u16 }

const PLAYER_SIZE: u16 = size_of(Player);  // 4
```

Works with primitive types, structs, enums, and arrays.

#### `offset_of(StructType, field) -> u16`

Returns the byte offset of a struct field from the start of the struct.

```rust
struct Player { x: u8, y: u8, health: u16 }

const HEALTH_OFFSET: u16 = offset_of(Player, health);  // 2
```

### Conditional Compilation

#### `cfg(condition) -> bool`

Returns `true` if the given configuration flag is active.

```rust
if cfg(snes) {
    // SNES-specific code
}
```

Flags are set via the `--cfg` compiler flag: `r65c game.r65 --cfg snes`.

---

## Compile-Time Math (`fixed_*`)

These functions compute mathematical values at compile time, producing integer constants with no runtime cost. Their primary use case is generating lookup tables (LUTs) in ROM for trigonometry, color palettes, curves, and other precomputed data.

All `fixed_*` functions:
- Are evaluated at compile time only — arguments must be constants
- Can be called directly in `const` declarations
- Can be called inside `const fn` bodies (including loops) for LUT generation
- Produce a compile error if arguments are runtime variables outside a `const fn`

### Trigonometry

#### `fixed_sin(index, table_size, amplitude) -> i16`

Compute `round(sin(2 * pi * index / table_size) * amplitude)`.

Maps a sine wave onto an integer table. `index` selects the position within one full period of `table_size` entries. The result is scaled by `amplitude` and rounded to the nearest integer.

```rust
// Single value
const SIN_45: i16 = fixed_sin(32, 256, 127);  // sin(45deg) * 127 = 90

// Generate a 256-entry sine LUT via const fn
const fn build_sin_table() -> [i16; 256] {
    let mut table: [i16; 256] = [0; 256];
    for i in 0..256 {
        table[i] = fixed_sin(i as u16, 256, 127);
    }
    return table;
}
static SIN_TABLE: [i16; 256] = build_sin_table();
```

**Errors:** `table_size` must not be zero.

**Result clamped to:** -32768..32767 (i16 range).

#### `fixed_cos(index, table_size, amplitude) -> i16`

Compute `round(cos(2 * pi * index / table_size) * amplitude)`.

Identical to `fixed_sin` but for cosine.

```rust
const COS_0: i16 = fixed_cos(0, 256, 127);    // cos(0) * 127 = 127
const COS_90: i16 = fixed_cos(64, 256, 127);   // cos(90deg) * 127 = 0
```

**Errors:** `table_size` must not be zero.

#### `fixed_atan2(y, x, table_size) -> u16`

Compute `atan2(y, x)` mapped to the range `0..table_size`.

Returns an unsigned angle where 0 corresponds to the positive x-axis and values increase counter-clockwise through one full rotation.

```rust
const ANGLE_RIGHT: u16 = fixed_atan2(0, 1, 256);   // 0
const ANGLE_UP: u16 = fixed_atan2(1, 0, 256);       // 64
const ANGLE_LEFT: u16 = fixed_atan2(0, -1, 256);    // 128 (actually ~128)
```

**Errors:** `table_size` must not be zero. Returns 0 when both `y` and `x` are 0.

### Exponential and Logarithmic

#### `fixed_sqrt(value, scale) -> u16`

Compute `round(sqrt(value) * scale)`.

```rust
const SQRT_100: u16 = fixed_sqrt(100, 256);  // sqrt(100) * 256 = 2560
```

**Errors:** `value` must not be negative.

**Result clamped to:** 0..65535 (u16 range).

#### `fixed_log2(value, scale) -> i16`

Compute `round(log2(value) * scale)`.

```rust
const LOG_8: i16 = fixed_log2(8, 256);    // log2(8) * 256 = 768
const LOG_1: i16 = fixed_log2(1, 256);    // log2(1) * 256 = 0
```

**Errors:** `value` must be positive (> 0).

**Result clamped to:** -32768..32767 (i16 range).

#### `fixed_exp2(value, in_scale, out_scale) -> u16`

Compute `round(2^(value / in_scale) * out_scale)`.

The input `value` is first divided by `in_scale` to get the real exponent, then the result is scaled by `out_scale`.

```rust
const EXP_1: u16 = fixed_exp2(256, 256, 256);  // 2^1.0 * 256 = 512
const EXP_0: u16 = fixed_exp2(0, 256, 256);    // 2^0.0 * 256 = 256
```

**Errors:** `in_scale` must not be zero.

**Result clamped to:** 0..65535 (u16 range).

### Interpolation and Clamping

#### `fixed_lerp(a, b, t, t_max) -> i16`

Linear interpolation: `a + (b - a) * t / t_max`.

When `t = 0` the result is `a`, when `t = t_max` the result is `b`, and intermediate values of `t` produce proportional blends.

```rust
const MID: i16 = fixed_lerp(0, 100, 5, 10);    // 50
const START: i16 = fixed_lerp(0, 100, 0, 10);   // 0
const END: i16 = fixed_lerp(0, 100, 10, 10);    // 100

// Generate a brightness ramp
const fn build_ramp() -> [i16; 16] {
    let mut ramp: [i16; 16] = [0; 16];
    for i in 0..16 {
        ramp[i] = fixed_lerp(0, 255, i as u16, 15);
    }
    return ramp;
}
static BRIGHTNESS: [i16; 16] = build_ramp();
```

**Errors:** `t_max` must not be zero.

**Result clamped to:** -32768..32767 (i16 range).

#### `fixed_clamp(value, min, max) -> i16`

Clamp `value` to the range `[min, max]`.

```rust
const CLAMPED: i16 = fixed_clamp(500, 0, 255);   // 255
const SAFE: i16 = fixed_clamp(-10, 0, 100);       // 0
```

**Errors:** `min` must not be greater than `max`.

### Color

#### `fixed_color_bgr(red, green, blue) -> u16`

Convert 8-bit RGB (0-255 per channel) to SNES 15-bit BGR555 format.

The SNES stores colors as a 16-bit word with the layout `0bbbbbgggggrrrrr` (bit 15 is always 0). Each 8-bit channel is truncated to 5 bits by shifting right 3 (`>> 3`).

```rust
const WHITE: u16 = fixed_color_bgr(255, 255, 255);  // 0x7FFF
const BLACK: u16 = fixed_color_bgr(0, 0, 0);        // 0x0000
const RED: u16 = fixed_color_bgr(255, 0, 0);        // 0x001F
const GREEN: u16 = fixed_color_bgr(0, 255, 0);      // 0x03E0
const BLUE: u16 = fixed_color_bgr(0, 0, 255);       // 0x7C00

// Generate a full palette in ROM
const fn build_palette() -> [u16; 4] {
    let mut pal: [u16; 4] = [0; 4];
    pal[0] = fixed_color_bgr(0, 0, 0);        // black
    pal[1] = fixed_color_bgr(255, 255, 255);   // white
    pal[2] = fixed_color_bgr(100, 149, 237);   // cornflower blue
    pal[3] = fixed_color_bgr(255, 200, 50);    // gold
    return pal;
}
static PALETTE: [u16; 4] = build_palette();
```

**Errors:** Each channel must be 0-255. Out-of-range values produce a compile error.

**Note:** Values below 8 in any channel will map to 0 in the 5-bit output (since `7 >> 3 == 0`). This means the lowest 3 bits of each 8-bit channel are lost in the conversion.

---

## Generating Lookup Tables with `const fn`

The most powerful use of `fixed_*` functions is inside `const fn` to generate ROM lookup tables at compile time. This eliminates the need for external tooling or hand-computed data.

### Pattern: Loop-Generated LUT

```rust
const TABLE_SIZE: u16 = 64;

const fn build_sin_cos_table() -> [i16; 128] {
    let mut table: [i16; 128] = [0; 128];
    for i in 0..64 {
        // First half: sine values
        table[i] = fixed_sin(i as u16, TABLE_SIZE, 127);
        // Second half: cosine values
        table[i + 64] = fixed_cos(i as u16, TABLE_SIZE, 127);
    }
    return table;
}

static TRIG_TABLE: [i16; 128] = build_sin_cos_table();
```

### Pattern: Computed Palette

```rust
const fn gradient(start_r: u8, start_g: u8, start_b: u8,
                  end_r: u8, end_g: u8, end_b: u8) -> [u16; 16] {
    let mut pal: [u16; 16] = [0; 16];
    for i in 0..16 {
        let r: u16 = fixed_lerp(start_r as i16, end_r as i16, i as u16, 15) as u16;
        let g: u16 = fixed_lerp(start_g as i16, end_g as i16, i as u16, 15) as u16;
        let b: u16 = fixed_lerp(start_b as i16, end_b as i16, i as u16, 15) as u16;
        pal[i] = fixed_color_bgr(r as u8, g as u8, b as u8);
    }
    return pal;
}

// Blue-to-white gradient palette
static SKY_GRADIENT: [u16; 16] = gradient(0, 0, 128, 200, 220, 255);
```

### Pattern: Distance Table

```rust
const fn build_distance_table() -> [u16; 64] {
    let mut table: [u16; 64] = [0; 64];
    for i in 0..64 {
        // sqrt(i) * 16, scaled fixed-point
        table[i] = fixed_sqrt(i as u16, 16);
    }
    return table;
}
static SQRT_TABLE: [u16; 64] = build_distance_table();
```

---

## Quick Reference

### Runtime (emit instructions)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `NOP()` / `NOP(n)` | 0-1 | void | No-op, optionally repeated |

### Compile-Time Only (produce constants)

| Function | Parameters | Returns | Formula |
|----------|-----------|---------|---------|
| `size_of(T)` | type | u16 | Size in bytes |
| `offset_of(S, f)` | struct, field | u16 | Field byte offset |
| `cfg(flag)` | ident | bool | Configuration check |
| `fixed_sin(i, sz, amp)` | int, int, int | i16 | `round(sin(2*pi*i/sz) * amp)` |
| `fixed_cos(i, sz, amp)` | int, int, int | i16 | `round(cos(2*pi*i/sz) * amp)` |
| `fixed_atan2(y, x, sz)` | int, int, int | u16 | `atan2(y,x)` mapped to `0..sz` |
| `fixed_sqrt(v, scale)` | int, int | u16 | `round(sqrt(v) * scale)` |
| `fixed_log2(v, scale)` | int, int | i16 | `round(log2(v) * scale)` |
| `fixed_exp2(v, in_s, out_s)` | int, int, int | u16 | `round(2^(v/in_s) * out_s)` |
| `fixed_lerp(a, b, t, t_max)` | int, int, int, int | i16 | `a + (b-a)*t/t_max` |
| `fixed_clamp(v, min, max)` | int, int, int | i16 | Clamp `v` to `[min, max]` |
| `fixed_color_bgr(r, g, b)` | u8, u8, u8 | u16 | RGB888 to SNES BGR555 |

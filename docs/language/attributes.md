---
sidebar_position: 12
title: Attributes
description: Complete reference for R65 attributes — storage class, function behavior, interrupt handling, bank placement, and ROM configuration.
---

# Attributes

Attributes are annotations attached to declarations that configure compiler behavior. They appear immediately before the item they apply to, using `#[name]` or `#[name(parameters)]` syntax.

```rust
#[ram]
static mut BUFFER: [u8; 256];

#[preserves(X, Y)]
fn safe_update(value @ A: u8) -> u8 { ... }
```

Attributes do not generate code by themselves — they instruct the compiler how to emit or validate code for the annotated item.

---

## Storage Class Attributes

Storage class attributes apply to `static mut` variables and determine where in the address space the variable is allocated. Immutable statics (`static`) are always placed in ROM and do not require an attribute.

| Attribute | Address Range | Speed |
|-----------|--------------|-------|
| `#[zeropage]` | `$0000–$00FF` | 2–3 cycles |
| `#[lowram]` | `$0000–$1FFF` | 3–4 cycles |
| `#[ram]` | `$7E2000–$7FFFFF` | 4–5 cycles |
| `#[hw(addr)]` | Hardware I/O | 4–6 cycles |
| `#[stack(lo, hi)]` | Reserved region | — |

Every `static mut` must have exactly one storage attribute. The compiler rejects declarations that omit it.

---

### `#[zeropage]`

Places the variable on the direct page (`$0000–$00FF`). Direct-page addressing is the fastest for general-purpose variables.

```rust
#[zeropage]
static mut TEMP: u8;        // Auto-allocated address

#[zeropage(0x42)]
static mut COUNTER: u8;     // Pinned to $0042
```

**Parameters:**

| Form | Effect |
|------|--------|
| `#[zeropage]` | Compiler assigns the next available address |
| `#[zeropage(addr)]` | Pinned to a specific address |
| `#[zeropage(addr, register)]` | Scratch register for compiler temporaries |

The `register` flag designates a variable as a compiler scratch pad. The compiler may read and write it freely for temporaries; the programmer should not assign semantic meaning to the value across function calls.

```rust
#[zeropage(0x10, register)]
static mut SCRATCH0: u8;

#[zeropage(0x11, register)]
static mut SCRATCH1: u8;
```

Zeropage and lowram variables share the same physical memory (`$0000–$1FFF`). A variable at `$0042` is accessible by both zeropage and lowram addressing modes.

---

### `#[lowram]`

Places the variable in low RAM (`$0000–$1FFF`). Use this when you need more than 256 bytes of fast storage.

```rust
#[lowram]
static mut SPRITE_TABLE: [u8; 512];

#[lowram(0x0200)]
static mut SPRITES: [u8; 128];  // Pinned to $0200
```

Lowram variables that fall in the `$0000–$00FF` range are also accessible with direct-page addressing, but the compiler uses absolute addressing for `#[lowram]` allocations. Use `#[zeropage]` when direct-page speed matters.

---

### `#[ram]`

Places the variable in main RAM (`$7E2000–$7FFFFF`). Use this for large buffers and data that does not need fast access.

```rust
#[ram]
static mut TILE_BUFFER: [u8; 4096];

#[ram]
static mut GAME_STATE: GameState;
```

Main RAM is the primary working memory for large game data. It does not support direct-page addressing.

---

### `#[hw(addr)]`

Maps a variable to a specific hardware I/O register. Every read and write is emitted directly — the compiler never caches the value or reorders accesses.

```rust
#[hw(0x4210)]
static mut RDNMI: u8;       // NMI flag / CPU version

#[hw(0x2100)]
static mut INIDISP: u8;     // Display control

#[hw(0x4212)]
static mut HVBJOY: u8;      // H/V blank and joypad status
```

The address parameter is required. `#[hw]` without an address is a compile error.

`#[hw]` variables behave as if every access has the `volatile` qualifier in C — the compiler cannot elide reads or merge writes. This is essential for polling loops:

```rust
// Always reads hardware; compiler cannot optimize this away
loop {
    if HVBJOY & 0x01 != 0 { break; }
}
```

---

### `#[stack(lo, hi)]`

Reserves a region of memory as the hardware stack. The compiler uses this to configure the stack pointer at startup and verify that stack usage does not overflow into other variables.

```rust
#[stack(0x1F00, 0x1FFF)]
```

This does not declare a variable — it marks a region. The compiler ensures no other variables are allocated in the reserved range.

---

## Function Attributes

Function attributes control calling behavior, interrupt handling, bank placement, and register preservation.

---

### `#[entry]`

Marks the program entry point. Exactly one function in a program may be `#[entry]`. The compiler generates the reset vector pointing to this function and emits startup code (stack initialization, `__init_start()` call) before invoking it.

```rust
#[entry]
fn main() -> ! {
    init();
    loop {
        update();
        wait_for_vblank();
    }
}
```

The entry function must return `-> !` because it never returns to a caller.

---

### `#[preserves(...)]`

Declares that a function saves and restores the listed registers. The compiler emits push/pop code at the function entry and exit for each listed register. The caller can rely on these registers being unchanged after the call.

```rust
#[preserves(X, Y)]
fn safe_update(value @ A: u8) -> u8 {
    X = 100;    // Saved at entry, restored at exit
    Y = 200;    // Saved at entry, restored at exit
    return value;
}
```

**Valid registers:** `A`, `X`, `Y`, `STATUS`, `D`, `DBR`

**Invalid registers:** `B` (shares hardware with `A`), `PBR` (read-only), `S` (stack pointer)

By default, all registers are caller-save. `#[preserves]` opts specific registers into callee-save behavior without affecting the rest of the calling convention.

Multiple registers are listed as a comma-separated sequence:

```rust
#[preserves(A, X, Y, D)]
fn full_context_save(value @ A: u8) { ... }
```

---

### `#[interrupt(vector)]`

Declares a function as an interrupt handler. The compiler wraps it with `PHP`/`PLP`, saves and restores all live registers, and emits `RTI` instead of `RTS`/`RTL`.

```rust
#[interrupt(nmi)]
fn vblank_handler() {
    // Transfer OAM, update DMA, etc.
}
```

**Available vectors:**

| Vector | Trigger |
|--------|---------|
| `nmi` | V-blank (non-maskable interrupt) |
| `irq` | Maskable interrupt |
| `brk` | BRK instruction |
| `cop` | COP instruction |
| `abort` | Abort (address bus fault) |

**Parameters:**

| Parameter | Default | Effect |
|-----------|---------|--------|
| `preserve` | `true` | `true` — auto-save/restore all live registers; `false` — manual control |

```rust
// Default: full register preservation
#[interrupt(nmi)]
fn vblank_handler() { ... }

// Manual: programmer responsible for saving registers
#[interrupt(irq, preserve=false)]
fn fast_irq() {
    asm!("PHP");
    // minimal work
    asm!("PLP");
}
```

Use `preserve=false` only when interrupt latency is critical and you are certain which registers need saving.

---

### `#[bank(n)]`

Sets the ROM bank context for subsequent function and immutable static declarations. All declarations after a `#[bank]` directive belong to that bank until the next directive.

```rust
#[bank(0)]
fn main_loop() { }          // Bank 0
fn helper() { }             // Also bank 0 (inherits)

#[bank(1)]
far fn audio_tick() { }     // Bank 1
far fn audio_init() { }     // Also bank 1 (inherits)

#[bank(auto)]
far fn flexible() { }       // Compiler chooses bank
```

**Parameter values:**

| Value | Effect |
|-------|--------|
| `#[bank(n)]` | Assigns bank `n` (0-based integer) |
| `#[bank(auto)]` | Compiler assigns bank automatically |

**Rules:**
- Near functions (`fn`) must be in the same bank as their callers. The compiler rejects cross-bank near calls.
- Far functions (`far fn`) are callable from any bank.
- In `#[bank(auto)]` mode, all functions must be `far fn` and all statics must be `far static`.

---

### `#[mode(databank=...)]`

Controls how the Data Bank Register (DBR) is managed around far function calls. DBR determines which bank is used for absolute-address data accesses.

This attribute applies only to `far fn` functions. It has no effect on near functions.

```rust
#[bank(1)]
#[mode(databank=inline)]
far fn graphics_engine() {
    // DBR is saved, set to bank 1, then restored on return
}
```

**Values:**

| Value | Behavior |
|-------|----------|
| `databank=none` | Default. No DBR management; programmer is responsible |
| `databank=inline` | Callee saves the current DBR, sets DBR to the function's own bank, and restores it on return |
| `databank=caller` | Caller sets DBR before the call; callee does not touch it |

`databank=caller` is useful when making several far calls to the same bank in sequence, avoiding redundant save/restore pairs:

```rust
// Caller sets DBR once for a batch of calls
asm!("PHB", "LDA #$01", "PHA", "PLB");
audio_play();       // #[mode(databank=caller)] — no extra PHB/PLB
audio_stop();       // same
asm!("PLB");
```

---

## ROM Configuration Attributes

### `#[snesrom(...)]`

Configures the SNES ROM header. Must appear once in the program, typically near the entry point. All parameters are named.

```rust
#[snesrom(
    name = "MY GAME",
    version = 0,
    lorom,
    slowrom,
    country = 1,
    cartridge_type = 0,
    sram_size = 0
)]
fn rom_header() { }
```

**Map mode parameters (mutually exclusive):**

| Parameter | Effect |
|-----------|--------|
| `lorom` | LoROM memory map (default) |
| `hirom` | HiROM memory map |
| `exhirom` | Extended HiROM (4MB+) |

**Speed parameters (mutually exclusive):**

| Parameter | Effect |
|-----------|--------|
| `slowrom` | 2.68 MHz (default) |
| `fastrom` | 3.58 MHz (requires FastROM-compatible hardware) |

**Named parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | String (21 chars max) | Game title in ROM header |
| `version` | `u8` | ROM version number |
| `country` | `u8` | Region code (0 = Japan, 1 = North America, …) |
| `id` | String (4 chars) | Maker/game ID code |
| `cartridge_type` | `u8` | Hardware type byte (0 = ROM only) |
| `sram_size` | `u8` | SRAM size code (0 = none; see SNES docs for values) |

See [SNES ROM Header](../platform/snes-rom-header.md) for the full region code and cartridge type tables.

---

## `#[cfg(...)]`

Conditionally includes a declaration based on the build target or feature flags. Currently only the `snes` target is predefined.

```rust
#[cfg(snes)]
static NTSC_CYCLES: u16 = 262;
```

`#[cfg]` can be applied to functions, statics, and type definitions. Items whose condition is false are entirely omitted from the output — they are not type-checked or emitted.

---

## Quick Reference

| Attribute | Applies To | Purpose |
|-----------|-----------|---------|
| `#[zeropage]` | `static mut` | Direct-page allocation (fast) |
| `#[zeropage(addr)]` | `static mut` | Pinned direct-page address |
| `#[zeropage(addr, register)]` | `static mut` | Compiler scratch register |
| `#[lowram]` | `static mut` | Low RAM allocation |
| `#[lowram(addr)]` | `static mut` | Pinned low RAM address |
| `#[ram]` | `static mut` | Main RAM allocation |
| `#[hw(addr)]` | `static mut` | Hardware I/O register (volatile) |
| `#[stack(lo, hi)]` | *(standalone)* | Reserve stack region |
| `#[entry]` | `fn` | Program entry point / reset vector |
| `#[preserves(...)]` | `fn` | Callee-save registers |
| `#[interrupt(vector)]` | `fn` | Interrupt handler |
| `#[interrupt(vector, preserve=false)]` | `fn` | Interrupt handler, manual save |
| `#[bank(n)]` | `fn`, `static` | ROM bank placement |
| `#[bank(auto)]` | `fn`, `static` | Automatic bank placement |
| `#[mode(databank=none)]` | `far fn` | No DBR management (default) |
| `#[mode(databank=inline)]` | `far fn` | Callee saves/sets/restores DBR |
| `#[mode(databank=caller)]` | `far fn` | Caller manages DBR |
| `#[snesrom(...)]` | `fn` | SNES ROM header configuration |
| `#[cfg(target)]` | Any item | Conditional compilation |

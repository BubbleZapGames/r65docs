---
sidebar_position: 15
title: Attributes
description: Complete reference for R65 attributes — storage class, function behavior, interrupt handling, bank placement, struct layout, and ROM configuration.
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
| `#[zeropage]` | `$0000–$00FF` | 3–4 cycles |
| `#[lowram]` | `$0000–$1FFF` | 4–5 cycles |
| `#[ram]` | `$7E2000–$7FFFFF` | 4–5 cycles |
| `#[hw(addr)]` | Hardware I/O | 4–6 cycles |
| `#[stack(lo, hi)]` | Reserved region | — |

A `static mut` may carry at most one storage attribute. **With no attribute it defaults to auto-allocated `#[ram]`** — equivalent to writing `#[ram]` (taking its address yields a far pointer, and access uses long addressing). Add an explicit attribute when you want zeropage/lowram speed or a near pointer.

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

The entry function is conventionally declared `-> !`, since there is no caller to return to. It is not required: if control can reach the end of the entry function, the compiler appends a branch-to-self halt loop.

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

`A` is valid only on a function that returns nothing. The first return value travels in `A`, and the restore at exit would overwrite it with whatever `A` held on entry:

```rust
#[preserves(A)]
fn bad(value @ A: u8) -> u8 { return value; }
// type error: A cannot be in #[preserves(...)] on a function that returns a value
//   The first return value is passed in A, and the restore at exit
//   would overwrite it with the value A held on entry

#[preserves(A)]
fn fine() { X = 1; }        // OK: returns nothing
```

A `-> !` function may also preserve `A`, since it never reaches its epilogue.

By default, all registers are caller-save. `#[preserves]` opts specific registers into callee-save behavior without affecting the rest of the calling convention.

Multiple registers are listed as a comma-separated sequence:

```rust
#[preserves(X, Y, D)]
fn full_context_save(value @ A: u8) { ... }
```

Not allowed on an `extern fn`, which has no body to save and restore in. Use `#[clobbers(...)]` there.

---

### `#[clobbers(...)]`

The opposite of `#[preserves]`: the registers a function may leave changed. A caller that needs one of them saves it around the call.

```rust
#[clobbers(X, DBR)]
extern fn sound_tick();
```

- **`X` and `Y`**: the compiler already works out which of them a function's code writes, so for an ordinary function the list adds nothing. It matters where the compiler cannot look. In a function containing `asm!`, the list speaks for the assembly text, which the compiler otherwise assumes writes both. For an `extern fn` it is the whole story: a bare extern is assumed to keep `X` and `Y`, and an extern that writes them must list them.
- **`D` and `DBR`**: a function normally leaves these as it found them. Listing one means the function does not, and every call saves it before and restores it after. Because only a direct call does that, such a function cannot be used as a value (a function pointer or jump table), be a trait method, combine `DBR` with `#[mode(databank=inline)]`, or be inlined.
- `A` and `B` are always clobbered, so listing them does nothing.

**Invalid:** `STATUS` (every call already clobbers the flags), `PBR`, `S`. The attribute is also invalid on `#[entry]` and `#[interrupt]` functions, and alongside `#[preserves]` of the same register.

---

### `#[interrupt(vector)]`

Declares a function as an interrupt handler. The body runs in the default m8/x16 mode, the compiler saves and restores the registers the body modifies, counting what each function it calls modifies (all of them for `asm!`, a call through a pointer or `*dyn`, or without optimization), and the handler ends in `RTI` instead of `RTS`/`RTL`. The processor status needs no explicit save: `RTI` restores it, mode bits included.

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
| `preserve` | `true` | `true` — save/restore the registers the body modifies; `false` — no saves, manual control |

```rust
// Default: the registers the body modifies are saved
#[interrupt(nmi)]
fn vblank_handler() { ... }

// Manual: no saves; the programmer saves whatever the body touches
#[interrupt(irq, preserve=false)]
fn fast_irq() {
    // minimal work
}
```

Either way the compiler emits the closing `RTI`. Use `preserve=false` only when interrupt latency is critical and you are certain which registers need saving.

---

### `#[bank(n)]`

Sets the ROM bank context for subsequent function and immutable static declarations. All declarations after a `#[bank]` directive belong to that bank until the next directive.

```rust
#[bank(0)]
fn main_loop() { }          // Bank 0
fn helper() { }             // Also bank 0 (inherits)

#[bank(1)]
fn audio_tick() { }         // Bank 1
fn audio_init() { }         // Also bank 1 (inherits)

#[bank(auto)]
fn flexible() { }           // Compiler chooses bank
```

**Parameter values:**

| Value | Effect |
|-------|--------|
| `#[bank(n)]` | Assigns bank `n` (0-based integer) |
| `#[bank(auto)]` | Compiler assigns bank automatically |

**Rules:**
- Functions are far by default and callable from any bank (see [Functions](functions.md#near-vs-far-calls)).
- A `near fn` must be in the same bank as its callers. The compiler rejects cross-bank near calls.
- In `#[bank(auto)]` mode, a function must not be `near fn`, and all immutable (ROM) statics must be `far static`.

---

### `#[mode(databank=...)]`

Controls how the Data Bank Register (DBR) is managed around far function calls. DBR determines which bank is used for absolute-address data accesses.

This attribute applies only to far functions (the default). A `near fn` with a `databank` mode is an error.

```rust
#[bank(1)]
#[mode(databank=inline)]
fn graphics_engine() {
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

Configures the SNES ROM header. It is a standalone attribute — it attaches to nothing — written at most once, typically at the top of the main file. It is optional: without it the compiler emits a default header. All parameters are named.

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

Conditionally includes a declaration based on configuration flags set with `--cfg` (`r65c game.r65 --cfg snes`). One key is predefined: `abi` holds the ABI model chosen with `--abi` (`#[cfg(abi = "FixedStack")]`), and `--cfg` cannot set it. A project created by `r65x init` passes `--cfg snes` from its Makefile. In an expression, use [`cfg!(flag)`](../platform/builtin_library.md#conditional-compilation).

```rust
#[cfg(snes)]
static NTSC_CYCLES: u16 = 262;
```

`#[cfg]` can be applied to functions, statics, type definitions, and **methods inside an `impl` block**. Items whose condition is false are entirely omitted from the output — they are not type-checked or emitted.

```rust
impl Q10 {
    #[cfg(snes)]
    fn mul(self, other: Q10) -> Q10 { /* uses the hardware multiplier */ }
}
```

---

## `#[inline(...)]`

Controls function inlining.

| Form | Meaning |
|------|---------|
| `#[inline]` | Hint. Inlined if the body fits the size budget. |
| `#[inline(always)]` | Directive. Inlined regardless of body size. |
| `#[inline(never)]` | Directive. Never inlined. |

```rust
impl Q10 {
    #[inline(always)]
    fn to_frac(self) -> i16 { return self.0 & Q10_FRAC_MASK; }
}
```

Implicit inlining of unannotated functions happens only at `-O2`.

---

## `#[soa]`

Lays every static of a **struct** out as one array per field — a *structure of arrays* — instead of one array of packed elements. The attribute goes on the struct declaration; every static of that struct is then SoA, whatever its storage class:

```rust
#[soa]
struct Enemy { kind: u8, x: u16, hp: u8 }

#[lowram]
static mut POOL: [Enemy; 16];
//  -> POOL__kind: [u8; 16]
//  -> POOL__x:    [u16; 16]
//  -> POOL__hp:   [u8; 16]
```

The compiler synthesizes one static per top-level field, in declaration order, each inheriting the parent's storage attribute, bank, and mutability. The parent itself occupies no bytes.

**Why.** Indexing an array of structs scales the index by the element size on every access — cheap for a power-of-two stride, but around 57 cycles for an element over 16 bytes. In a field plane the index scales by the *field* size instead, so `POOL[i].hp` addresses `POOL__hp[i]` with no multiply at all. This is the layout hand-written 6502 code has always used for entity pools; `#[soa]` lets you keep the struct syntax.

**Access is unchanged** from the array-of-structs form:

```rust
POOL[i].hp = 100;
let k: u8 = POOL[i].kind;
POOL[i].hp += 1;              // compound assignment
POOL[i].pos.y = 8;            // nested aggregate fields
```

Index a pool with a `u16`. A `u8` index needs an explicit `as u16` — `POOL[i as u16].hp` — until implicit widening is fixed.

**A single instance** is a pool of one. `static mut PLAYER: Player;` over an `#[soa]` struct gets one one-element plane per field, and `PLAYER.hp` is `PLAYER[0].hp`.

**Methods take `self` as the element index**, by value, so a field access inside a method is a single indexed instruction — no pointer, no stack frame:

```rust
impl Enemy {
    fn step(self) { self.x = self.x + 1; self.hp -= 1; }
    fn hurt(self, amount @ Y: u16) { self.hp = self.hp - (amount as u8); }
}

POOL[i].step();               // passes the index
```

`self` is an ordinary `u16`, so `if self == 0`, `other_fn(self)`, and `POOL[self].kind` all work — except on a struct that is a tagged enum's payload, whose `self` is an element rather than a number (see [enums](./enums.md#a-payloads-self-is-not-a-number)). `*self` on an `#[soa]` method is an error — there is no address to take — and a trait declared with `*self` is still implemented with bare `self`, the same rule [newtypes](./new_types.md) follow. Because `self` holds the index for the whole body, an `#[soa]` method may not bind a parameter to `X`.

**Inlined on a constant element.** A method marked `#[inline(always)]` and called on a constant element — `POOL[0].step()`, `PLAYER.step()` — compiles to the same code as writing `POOL[0].x` directly: every field access becomes a fixed address with no index register load. Called on a variable element it is an ordinary indexed access.

**Initializers.** An array literal on an `#[soa]` static is transposed into one array per field. On an immutable static that is one ROM table per field — the natural shape for a per-kind constant table indexed by a tag, where each column is read with the index scaled by that field's width alone:

```rust
#[soa]
struct Area { id: u8, exits: u16, flags: u8 }

static AREAS: [Area; 3] = [
    Area { id: 0, exits: 3, flags: 0x01 },
    Area { id: 1, exits: 1, flags: 0x00 },
    Area { id: 2, exits: 2, flags: 0x04 },
];

let n: u16 = AREAS[i].exits;
```

On a `static mut` each plane is block-copied from its ROM column at startup, as a plain array literal would be. Each element must be a literal of the struct naming every field once. A fill (`[E { .. }; N]`, `[0; N]`) is rejected, and an immutable `#[soa]` static must have a literal.

**Layout.** A field plane's stride is the field's size, except that a 3- or 7-byte field (a `far *T`, for instance) is padded to 4 or 8 — one byte per element buys a power-of-two scale. Auto-allocated planes are placed by the normal allocator and may not be adjacent; an explicitly addressed static lays its planes out consecutively from that address, so the memory map stays writable by hand:

```rust
#[soa]
struct Enemy { kind: u8, x: u16, hp: u8 }

#[zeropage(0x40)]
static mut POOL: [Enemy; 8];
//  -> POOL__kind at $40 (8 bytes), POOL__x at $48 (16), POOL__hp at $58 (8)
```

**Composes with** `#[zeropage]`, `#[lowram]`, `#[ram]`, and `#[bank(n)]` on the static. Does not compose with `#[hw]` or `extern static`.

**Restrictions.** An element has no contiguous base address, so anything that needs one is rejected:

| Construct | Write instead |
|-----------|---------------|
| `&POOL[i]`, `&POOL` | Pass the index |
| `&POOL[i].field`, `&self.field` | Read or write the field directly, or copy it to a local — a plane's next byte is the next element's field |
| a local, parameter, or plain-struct field of the type | Hold a `u16` index |
| `E = POOL[i]` (whole-element copy), `impl Clone` | Copy the fields |
| `fn m(*self)` | `fn m(self)` |
| a second static of the type | Merge the pools — methods hard-code one pool's planes |
| `#[soa]` on a union or a newtype | — |
| a fill initializer `[..; N]` | Write the array literal out, or assign at runtime |
| `static POOL: [E; N];` with no initializer | Add `mut`, or an array literal |
| `*dyn Trait` over an element | Static dispatch only |

Trait impls with static dispatch, methods with arguments, and methods calling other methods on `self` all work. A field may be a [tagged enum](./enums.md#a-field-of-an-soa-struct), which contributes its own tag and payload planes, and an `#[soa]` struct may itself be a tagged enum's [payload](./enums.md#soa-payloads).

`asm!` bodies cannot see the layout — name a field plane (`POOL__hp`) rather than `POOL`. `size_of(Enemy)` still returns the packed sum, which is no longer a stride.

---

## `#[used]`

A function nothing calls is removed by dead function elimination. `#[used]` keeps it, for a caller the compiler cannot see — a debugger's `jump`, as a test does to swap one call for another at a function's entry:

```rust
#[used]
fn boot_harness() -> u8 { return MISSION_HARNESS; }
```

A `#[used]` function is a root like `#[entry]`, so everything it calls is kept too.

On a static, `#[used]` keeps one that no live code refers to. Such a static is otherwise removed with its initializer and ROM data, so it costs no RAM or ROM. A test or debugger that reads a static the program never touches needs the attribute:

```rust
#[used]
#[ram]
static mut PROBE: u16;
```

A static at an explicit address, a `#[hw]` register and a `register` scratch static are always kept.

---

## `#[derive(...)]` — not supported

R65 has no derive macros. The attribute is rejected with a per-trait suggestion of what to write by hand:

```rust
#[derive(Clone, PartialEq)]
struct P { x: u8 }
// error: #[derive(...)] is not supported in R65
// hint: R65 has no derive macros; write these instead:
//     Clone: impl Clone for P {}   // empty body = compiler-generated bitwise copy
//     PartialEq: impl PartialEq for P { fn eq(*self, other: *P) -> bool { ... } }
```

`impl Clone for T {}` with an empty body is the one trait the compiler generates for you. See [Operator Overloading](./operator-overloading.md) for the rest.

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
| `#[preserves(...)]` | `fn` | Callee-save registers (`A` only if nothing is returned) |
| `#[clobbers(...)]` | `fn`, `extern fn` | Registers left changed, saved by the caller |
| `#[interrupt(vector)]` | `fn` | Interrupt handler |
| `#[interrupt(vector, preserve=false)]` | `fn` | Interrupt handler, manual save |
| `#[bank(n)]` | `fn`, `static` | ROM bank placement |
| `#[bank(auto)]` | `fn`, `static` | Automatic bank placement |
| `#[mode(databank=none)]` | `fn` | No DBR management (default) |
| `#[mode(databank=inline)]` | `fn` | Callee saves/sets/restores DBR |
| `#[mode(databank=caller)]` | `fn` | Caller manages DBR |
| `#[snesrom(...)]` | *(standalone)* | SNES ROM header configuration |
| `#[cfg(target)]` | Any item | Conditional compilation |
| `#[inline]` / `#[inline(always)]` / `#[inline(never)]` | `fn`, method | Inlining hint or directive |
| `#[used]` | `fn`, `static` | Keep a function nothing calls, or a static nothing refers to |
| `#[soa]` | `struct` | Store every static of the struct as one array per field |

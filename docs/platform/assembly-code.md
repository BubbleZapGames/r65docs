---
sidebar_position: 7
title: Assembly Interop
description: Mixing R65 with 65816 assembly — inline asm!, memory-mapped hardware registers with #[hw], and linking external .s files with include_asm! and extern.
---

# Assembly Interop

R65 is designed to live alongside hand-written 65816 assembly, not replace it.
There are three ways to reach the metal, in increasing order of scope:

1. **`asm!`** — drop raw instructions inside a function.
2. **`#[hw]`** — bind a variable to a memory-mapped hardware register.
3. **`include_asm!` + `extern`** — assemble an external `.s` file and call into
   it with a type-checked ABI.

---

## `asm!` — Inline Assembly

`asm!` embeds raw 65816 instructions directly into the surrounding function.
Each argument is one instruction; pass several to emit a sequence:

```rust
asm!("WAI");                    // Single instruction
asm!("PHP", "WAI");             // Multiple instructions
asm!("NOP", "NOP", "NOP");      // Three NOPs
```

### Format string substitution

Named parameters let you build instructions at compile time. Placeholders use
`{name}` syntax and resolve to string or integer literals (not identifiers or
expressions):

```rust
asm!("LD{REG} #{VAL}", REG="A", VAL=42);   // → LDA #42
asm!("ST{REG} $2100", REG="X");            // → STX $2100
```

Named arguments apply to every instruction in the same `asm!` invocation.

### Register clobbering

The compiler treats each `asm!` invocation as a **black box that clobbers all
registers**. It will not assume any value survives the block. If you need a
register preserved across inline assembly, save and restore it yourself:

```rust
asm!("PHA");          // save A
asm!("JSR my_routine");
asm!("PLA");          // restore A
```

### Combining with `stringify!` in macros

Because format arguments only accept literals, use `stringify!($param)` to turn
a macro fragment into a string:

```rust
macro_rules! push($reg:reg) {
    asm!("PH{R}", R=stringify!($reg));
}

push!(A);  // PHA
push!(X);  // PHX
```

---

## `#[hw]` — Memory-Mapped Hardware Registers

`#[hw(addr)]` binds a `static mut` to a fixed hardware I/O address. Every read
and write is emitted directly to that address — the compiler **never caches,
eliminates, or reorders** the access. This is the volatile semantics you need
for talking to SNES PPU/APU/DMA registers:

```rust
#[hw(0x2100)]
static mut INIDISP: u8;     // Display control
#[hw(0x4210)]
static mut RDNMI: u8;       // NMI flag / CPU version
#[hw(0x4212)]
static mut HVBJOY: u8;      // H/V blank and joypad status
```

The address parameter is **required** — `#[hw]` without an address is a compile
error.

Because accesses are never optimized away, `#[hw]` variables work correctly in
polling loops where a normal variable read would be hoisted out:

```rust
// Always re-reads the hardware; the loop is never optimized into a single read
loop {
    if HVBJOY & 0x01 != 0 { break; }
}
```

`#[hw]` registers live in bank 0 and produce near pointers when their address
is taken.

---

## `include_asm!` + `extern` — Linking External Assembly

For routines too large or too performance-critical to inline, write them in a
separate `.s` file, pull them into the build with `include_asm!`, and describe
their entry points with `extern` declarations so R65's type checker and code
generator can call them as if they were native functions.

### `include_asm!`

```rust
include_asm!("vendor/sound.s");
```

- The file is assembled **into the current bank/section window**, so the `.s`
  file should not carry its own `.BANK` directives.
- Paths resolve relative to the including `.r65` file, then against the `-I`
  include search paths passed to `r65c` (same rules as `include_bytes!`).

### `extern fn`

`extern fn` declares a routine implemented in assembly. It is **body-less** and
ends in a semicolon — a `{ }` block is a parse error. The parameter and return
syntax is identical to a normal function, so you pick the calling convention
(register-bound, variable-bound, or stack) right in the signature:

```rust
extern fn sound_tick(a @ A: u8) -> u8;        // near: JSR into the current bank
extern far fn sound_play(id @ A: u8);         // far: JSL (24-bit), callable cross-bank
```

- `extern fn` lowers to `JSR symbol` (near, same bank as the caller).
- `extern far fn` lowers to `JSL symbol` (24-bit, callable from any bank).
- Calling a **near** `extern fn` from a different bank is a compile-time error,
  exactly like a near R65 `fn`. Declare it `extern far fn` to call across banks.

By default the compiler assumes the assembly callee **clobbers every register**.
Add `#[preserves(...)]` to assert what the routine actually leaves untouched —
the compiler trusts the annotation and skips the save/restore:

```rust
#[preserves(X, Y)]
extern fn sound_tick(a @ A: u8) -> u8;
```

### `extern static`

`extern static` names data whose storage is owned by the assembly file (a label
defined in the `.s`). It **cannot carry storage attributes** (`#[ram]`,
`#[zeropage]`, etc.) — placement is the assembler's job. Reads and writes
resolve to the bare label:

```rust
extern static SONG_TABLE: [u8; 64];       // immutable table in the .s file
extern static mut SOUND_RAM: [u8; 256];   // mutable region owned by the .s file
```

A type annotation is required; `extern static NAME;` without `: T` is a parse
error, and initializers are not allowed (the assembly file provides the data).

### Putting it together

```rust
include_asm!("game_helpers.s");

extern fn add_asm(a @ A: u8, b @ X: u16) -> u8;
extern far fn audio_tick();
extern static PALETTE: [u8; 32];

fn main() {
    A = add_asm(1, 2);
    audio_tick();
    A = PALETTE[0];
}
```

The matching `game_helpers.s` defines `add_asm`, `audio_tick`, and the
`PALETTE` label. R65 type-checks every call site against the `extern`
signatures and emits the right `JSR`/`JSL` and label references.

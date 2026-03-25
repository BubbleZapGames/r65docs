# FAQ

## What is R65?

### Is R65 a Rust compiler for the SNES?

No. R65 uses Rust-*inspired* syntax but is a purpose-built language for the 65816 processor. It is not a Rust subset, fork, or port. You cannot compile Rust crates with it. The resemblance is intentional. If you know Rust syntax, you can read R65 code but the language semantics are designed around 8-bit/16-bit hardware, not Rust's ownership model.

### What does R65 give me over writing raw 65816 assembly?

Several things that hand-written assembly does not provide:

- **Type checking** catches mode mismatches, bank overflow, and size errors at compile time — before you burn time debugging in an emulator.
- **Automatic SEP/REP management.** The compiler tracks processor mode (m8/m16) and inserts mode switches as needed. No more forgetting a `SEP #$20` after a 16-bit operation.
- **Register allocation with peephole optimization.** 10+ optimization passes: dead store elimination, redundant load tracking, loop rotation, STZ conversion, INC/DEC folding, LICM, count-down loop transformation, and more.
- **Structured control flow.** `if`/`else`, `for`, `while`, `loop`, `match` with range/or patterns, labeled `break`/`continue` — all compiling to zero-overhead assembly.
- **Structs, enums, const fn.** Organize data and compute values at compile time without runtime cost.
- **Automatic branch distance fixup.** No manual short/long branch juggling.

### How does R65 compare to cc65?

| | R65 | cc65 |
|---|---|---|
| **Registers** | First-class globals (`A`, `X`, `Y`, `STATUS`, etc.) | Hidden behind C ABI |
| **Memory model** | Explicit storage classes (`#[zeropage]`, `#[ram]`, `#[hw]`) | Flat with linker scripts |
| **Parameters** | Three mechanisms: register, variable-bound, stack | One calling convention |
| **Runtime** | No heap, no malloc, no runtime overhead | Includes heap/malloc |
| **Target** | Tailored 65816 only (SNES-specific) | ca65 (multi-platform 6502) |
| **Math Support** | Explicit math functions (mul8,div16,mod8) | Built-in operators which implicitly call functions  |

cc65 is better for generic 6502 targets and portable C code. R65 is better for 65816 specific work where you need direct hardware control and want the compiler to catch language specific mistakes.

## What Rust features does R65 have / not have?

### What's supported?

- Majority of the basic Rust syntax
- Structs and Enums (C-style with explicit values)
- Traits with dynamic dispatch (vtable-based, `DBR:Y` self pointer)
- `match` with range patterns (`0..=15`), or patterns (`1 | 2 | 3`), and exhaustiveness checking
- `for`/`while`/`loop` with labeled `break`/`continue`
- `const fn` for compile-time computation
- `macro_rules!` with 6 fragment types
- Explicit type casts via `as`
- `include!()` and `asm!()` for file inclusion and inline assembly

See the [language overview](language-overview.md) for a walkthrough.

### What's intentionally omitted and why?

Every omission has a hardware reason:

| Feature | Why it's omitted |
|---|---|
| **Generics** | Monomorphization would bloat ROM. A 4Mbit SNES cart has 512KB — every duplicated function body costs real space. |
| **Lifetimes & borrowing** | No heap, no allocator, no dangling pointers to dynamic memory. Pointers go to fixed addresses (RAM, ROM, hardware registers). The borrow checker solves a problem that doesn't exist here. |
| **`Option` / `Result`** | Each `Option<u8>` would cost an extra byte + branch. On a slow CPU, that overhead matters. Use return codes or sentinel values. |
| **Closures** | Would require heap allocation or complex stack gymnastics for captures. Not worth the ROM/cycle cost. |
| **Async/await** | The 65816 is single-threaded with hardware interrupts. Use `#[interrupt(nmi)]` handlers instead. |
| **Modules** | Use `include!()` for file organization. A full module system adds compiler complexity without clear hardware benefit. |
| **Bounds checking** | Costs 8–12 cycles per access on a CPU where you get ~60,000 cycles per frame. |
| **Dynamic collections** | No heap. Fixed-size arrays in RAM are all you have. |

### Why no `unsafe`?

All R65 code has direct hardware access by design. The entire language is what Rust calls `unsafe`. There is no safe/unsafe distinction because there is no runtime to protect — you are writing code that runs directly on the metal, touching hardware registers and memory-mapped I/O. An `unsafe` keyword would be meaningless.

## Can I use R65 for real projects?

### How mature is the compiler?

Currently under Alpha status as an initial preview release.

The full pipeline is functional: Source → Lexer → Parser → HIR → Type Check → MIR → CodeGen → WLA-DX assembly.

- **1,794 tests** passing (unit + end-to-end with emulator verification via Mesen)
- Working example ROMs demonstrating sprites, scrolling, DMA, Mode 7, and controller input
- Under active development with regular commits

The compiler is usable for real SNES ROM development today, though new features and optimizations are still being added. No guarantee future builds won't break compatiblity and library api.

### Can I mix R65 with hand-written assembly?

Yes. Two mechanisms:

**Inline assembly** with `asm!()`:
```rust
asm!("WAI");              // Single instruction
asm!("PHP", "WAI");       // Multiple instructions
```

**File inclusion** with `include!()`:
```rust
include!("hardware.r65");  // Textual inclusion (like C's #include)
```

The standard library itself uses `asm!()` extensively — DMA macros, hardware multiply, random number generation. You are not fighting the compiler to use assembly; it is a first-class feature.

### What emulators/debuggers work with R65?

- **Mesen** (recommended): The compiler's `--dbg` flag generates source-level debug symbols.
- **bsnes/higan**: Works for running and debugging ROMs.

See the [tools page](../platform/tools.md) for setup details.

## Language gotchas

### Why can't I multiply/divide with variables using `*` and `/`?

The 65816 has no MUL or DIV instruction. The `*` and `/` operators compile to bit shifts (1–2 cycles), so they only accept power-of-2 constants:

```rust
let result = value * 4;     // Compiles to ASL A, ASL A (2 cycles)
let half = value / 2;       // Compiles to LSR A (1 cycle)
let oops = value * count;   // Compile error: non-constant operand
```

For general multiplication and division, use the stdlib functions:

```rust
let product = mul8(a, b);   // Software multiply (~60 cycles)
let quotient = div8(a, b);  // Software divide (~100 cycles)
```

With `--cfg snes`, `mul8()` uses the SNES hardware multiplier for better performance. See the [math documentation](../platform/math.md) for full details.

### Why are X and Y always 16-bit?

R65 keeps the processor in x16 mode permanently. Mixed 8/16 index modes cause subtle bugs with stack-relative addressing and push/pull operations. The complexity of tracking index register width alongside accumulator width is rarely worth the 1-byte savings on index loads. If you only need 8-bit values in X or Y, the upper byte is simply ignored.

### What's `#[zeropage]` vs `#[ram]` vs `#[lowram]`?

These are storage classes that control where a `static mut` variable lives in memory:

| Storage | Address range | Access cost | Capacity |
|---|---|---|---|
| `#[zeropage]` | `$0000–$00FF` | 2–3 cycles | 256 bytes |
| `#[lowram]` | `$0000–$1FFF` | 3–4 cycles | 8 KB |
| `#[ram]` | `$7E2000–$7FFFFF` | 4–5 cycles | ~120 KB |

Use `#[zeropage]` for hot variables (loop counters, scratch registers). Use `#[ram]` for large buffers. Immutable `static` (no `mut`) goes to ROM automatically — no attribute needed.

```rust
#[zeropage]
static mut FRAME_COUNTER: u16;       // Fast access, limited space

#[ram]
static mut TILEMAP: [u8; 2048];      // Large buffer in main RAM

static LOOKUP_TABLE: [u8; 256] = [/* ... */];  // ROM, no attribute
```

See the [memory model documentation](../hardware/memory-model.md) for the complete picture.

### How do I pass arrays/structs to functions?

By pointer. R65 does not support pass-by-value for composite types — they would need to be copied onto the stack, which is expensive and limited (the 65816 stack is 256 bytes in practice).

```rust
fn clear_buffer(buf: far *u8, len @ X: u16) {
    for i in 0..len {
        buf[i] = 0;
    }
}

fn damage_player(player: far *Player, amount @ A: u8) {
    (*player).health = (*player).health - amount as u16;
}
```

See [functions](../language/functions.md) for more.

## License

### What license is R65?

MIT. Full commercial and open-source use permitted.

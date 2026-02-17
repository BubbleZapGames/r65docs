---
sidebar_position: 1
title: Language Overview
description: A comprehensive overview of the R65 programming language for the 65816 processor.
---

# R65 Language Overview

R65 is a Rust-inspired programming language that compiles to WLA-DX assembly for the 65816 processor, targeting Super Nintendo Entertainment System (SNES) ROM development and reverse engineering. The compiler takes `.r65` source files and produces `.asm` output suitable for assembly with the WLA-DX toolchain.

## Design Philosophy

R65 embraces the limitations of 8-bit/16-bit hardware rather than abstracting them away. The language provides modern type safety and clean syntax while maintaining direct access to the underlying processor architecture.

**Hardware Transparency.** CPU registers (A, X, Y), bank boundaries, and processor modes are first-class language concepts. There is no hidden indirection between your code and the hardware.

**Type Safety.** The compiler catches bank overflow, mode mismatches, and size errors at compile time. All type conversions require explicit `as` casts -- there are no implicit conversions.

**Zero Abstraction Cost.** High-level constructs compile to efficient assembly that matches hand-written code. Register parameters, packed structs, and inline assembly provide full control over generated output.

**Explicit Control.** There is no `unsafe` keyword because all code has direct hardware access. The programmer is responsible for bounds checking, null safety, and memory management.

**Simplicity First.** Complex Rust features that do not map well to hardware are omitted. There are no lifetimes, generics, closures, or module systems.

## Types

R65 provides five primitive types that map directly to hardware capabilities:

```rust
u8    // Unsigned 8-bit  (0 to 255)
i8    // Signed 8-bit    (-128 to 127)
u16   // Unsigned 16-bit (0 to 65535)
i16   // Signed 16-bit   (-32768 to 32767)
bool  // Boolean (stored as u8, 0 or non-zero)
```

All operations wrap on overflow with no runtime checks. Type conversions require explicit `as` casts:

```rust
let wide: u16 = (narrow as u16) + 1;   // Zero-extend u8 to u16
let byte: u8 = word as u8;             // Truncate u16 to u8
let signed: i8 = raw as i8;            // Reinterpret bits
```

Type aliases create alternate names: `type Word = u16;`

For complete type system rules, see [Type System](../language/types.md).

## Hardware Registers

All 65816 processor registers are exposed as global mutable variables:

```rust
A: u8       // Accumulator (u16 when function has @ A: u16 parameter)
X: u16      // X index register (always 16-bit)
Y: u16      // Y index register (always 16-bit)
B: u8       // Accumulator high byte (m8 mode only)
STATUS: u8  // Processor status flags (NVMXDIZC)
D: u16      // Direct Page register
DBR: u8     // Data Bank Register
PBR: u8     // Program Bank Register (read-only)
S: u16      // Stack Pointer
```

All registers are mutable except `PBR` (read-only). The type of `A` depends on the current function's mode: `u8` by default (m8) or `u16` when the function has a `@ A: u16` parameter. `X` and `Y` are always `u16`. `B` is only available in m8 mode.

Register aliasing binds a named variable to a hardware register at zero cost:

```rust
let hitpoints @ A = PLAYER.health;  // A holds hitpoints
hitpoints = hitpoints - 1;           // Modifies A directly
```

## Variables and Constants

Local variables require type annotations or register aliasing:

```rust
let x: u8 = 10;
let mut counter: u16 = 0;
let value @ A: u8 = 42;      // Bound to A register
let index @ X = 0;           // Type inferred from register (u16)
```

Constants and const functions are evaluated at compile time:

```rust
const TILE_SIZE: u8 = 8;
const MASK: u8 = 0x80 | 0x40;

const fn tile_offset(x: u8, y: u8) -> u16 {
    return (y as u16) * 32 + (x as u16);
}
const PLAYER_TILE: u16 = tile_offset(5, 3);
```

## Functions

Functions support three parameter-passing mechanisms:

```rust
// Register parameters (fastest, 0-3 cycles setup)
fn add(left @ A: u8, right @ X: u16) -> u8 { return left; }

// Variable-bound parameters (3-6 cycles)
fn process(temp @ TEMP: u8) -> u8 { return temp + 1; }

// Stack parameters (5-10 cycles, must come first in parameter list)
fn calculate(a: u8, b: u8, hint @ A: u8) -> u8 { return a + b + hint; }
```

X and Y register parameters must be `u16`. Stack parameters must precede register or variable-bound parameters.

Functions return values via implicit A return, explicit register return, or multiple returns:

```rust
fn get_status() -> u8 {
    A = read_hardware();
    // Implicit return of A
}

fn divide(a @ A: u8, b @ X: u8) -> (u8, u8) {
    return A, X;  // Multiple return values
}
let (quotient, remainder) = divide(100, 7);
```

Functions that never return use `-> !`. The `#[preserves(X, Y)]` attribute generates automatic callee-save code for the listed registers.

For complete calling convention details, see [Calling Convention](../language/functions.md).

## Control Flow

R65 supports `if`/`else if`/`else`, `loop`, `while`, `for i in start..end`, `break`, `continue`, labeled loops (`'label: loop { break 'label; }`), and `match` expressions. If-else can be used as an expression.

```rust
if health == 0 {
    game_over();
} else if health < 20 {
    flash_warning();
} else {
    continue_game();
}

loop { wait_vblank(); update(); if done { break; } }

while count > 0 { process(); count -= 1; }

for i in 0..256 { buffer[i] = 0; }

'outer: for y in 0..8 {
    for x in 0..8 {
        if tile[y][x] == target { break 'outer; }
    }
}

let result: u8 = match tile_id {
    0..=15 => 1,      // Inclusive range pattern
    16..32 => 2,       // Exclusive range pattern
    32 | 64 => 3,      // Or-pattern
    _ => 0,            // Wildcard (required for exhaustiveness)
};
```

The compiler selects the optimal match strategy: lookup tables, jump tables, or branch chains.

For complete control flow documentation, see [Control Flow](../language/statements.md).

## Memory Storage Classes

Storage class is determined by mutability and attributes:

| Storage | Attribute | Address Range | Speed |
|---------|-----------|---------------|-------|
| Direct Page | `#[zeropage]` | `$0000-$00FF` | 2-3 cycles |
| Low RAM | `#[lowram]` | `$0000-$1FFF` | 3-4 cycles |
| Main RAM | `#[ram]` | `$7E2000-$7FFFFF` | 4-5 cycles |
| ROM | *(immutable static)* | Bank-dependent | 4-5 cycles |
| Hardware | `#[hw(addr)]` | I/O addresses | 4-6 cycles |

Immutable statics are placed in ROM automatically. Mutable statics require an explicit storage attribute:

```rust
static SINE_TABLE: [u8; 256] = [0; 256];   // Immutable = ROM

#[zeropage(0x10)]
static mut FRAME_COUNTER: u8;               // Explicit zeropage address

#[zeropage]
static mut TEMP: u16;                        // Auto-allocated zeropage

#[ram]
static mut BUFFER: [u8; 4096];              // Main RAM (bank $7E)

#[hw(0x4212)]
static mut HVBJOY: u8;                      // Hardware register (auto-volatile)
```

Hardware-mapped variables (`#[hw]`) are automatically volatile -- every access goes directly to hardware with no caching or reordering.

For complete memory model details, see [Pointers and Memory](../hardware/memory-model.md).

## Structs and Enums

Structs are packed with no padding, fields in declaration order. They cannot be passed by value -- use pointers:

```rust
struct Player { x: u8, y: u8, health: u16 }  // 4 bytes total

#[ram]
static mut PLAYER: Player;
PLAYER.x = 10;

fn damage_player(p: *Player, amount @ A: u8) {
    p.health = p.health - amount as u16;
}
```

Enums are C-style with explicit or auto-incrementing values. No data-carrying variants:

```rust
enum Direction { North = 0, East, South, West }
let dir = Direction::North;
let value: u8 = dir as u8;
```

## Arrays

Arrays are fixed-size with no runtime bounds checking:

```rust
#[ram]
static mut BUFFER: [u8; 256] = [0; 256];
#[ram]
static mut MESSAGE: [u8; 16] = "Hello, World!";  // String literal, zero-padded

BUFFER[X] = 42;
let val: u8 = BUFFER[Y];
```

String literals are only valid in static array initializers. Arrays cannot be passed by value -- use pointer parameters (`*[u8]`).

## Pointers

Near pointers (`*T`) are 16-bit addresses within the current data bank. Far pointers (`far *T`) are 24-bit addresses spanning the full address space:

```rust
let ptr: *u8 = 0x2000;              // Near pointer
let far_ptr: far *u8 = 0x01_2000;   // Far pointer (bank 1)
*ptr = 5;                            // Dereference
ptr[Y] = 42;                        // Indexed access

#[zeropage]
static mut PTR: *Player;
PTR.x = 10;                         // Auto-dereference for struct fields

let p: *Player = &PLAYER;           // Address-of operator
type Handler = fn(u8) -> u8;        // Near function pointer (JSR/RTS)
type FarHandler = far fn(u8) -> u8; // Far function pointer (JSL/RTL)
```

Pointer arithmetic scales by `sizeof(T)`. Zero-page pointers are fastest due to the 65816's indirect addressing modes.

For complete pointer documentation, see [Pointers and Memory](../hardware/memory-model.md).

## Cross-Bank Functions

Functions in other ROM banks use `far fn` and are called via JSL/RTL:

```rust
#[bank(1)]
far fn sound_engine() {
    // Placed in ROM bank 1, callable from any bank
}

#[mode(databank=inline)]
far fn graphics_update() {
    // Compiler generates PHB/PLB to manage Data Bank Register
}
```

Near functions (`fn`) use JSR/RTS and can only call within the same bank. Far functions (`far fn`) use JSL/RTL and are callable from anywhere.

## Interrupt Handlers

```rust
#[interrupt(nmi)]
fn vblank_handler() {
    // Auto-generated: PHP, register saves, body, register restores, PLP, RTI
    update_sprites();
    update_audio();
}

#[interrupt(irq, preserve=false)]
fn fast_irq() {
    // No automatic preservation -- manual control
    asm!("RTI");
}
```

Supported vectors: `nmi`, `irq`, `brk`, `cop`, `abort`. Default `preserve=true` generates automatic save/restore.

For complete interrupt documentation, see [Interrupt Handling](../hardware/interrupts.md).

## Operators

Operators are hardware-aware with restrictions on expensive operations:

```rust
let sum = a + b;          // Addition (2-4 cycles)
let diff = a - b;         // Subtraction (2-4 cycles)
let doubled = a * 2;      // Multiply by 1, 2, 4, or 8 only
let halved = a / 4;       // Divide by 1, 2, 4, or 8 only
let shifted = a << 3;     // Constant shift amounts only
let masked = a & 0x0F;    // Bitwise AND, OR, XOR unrestricted
```

General multiplication, division, modulo, and variable shifts require function calls:

```rust
let product = mul(a, b);    // 20-100+ cycles
let quotient = div(a, b);   // 50-200+ cycles
let remainder = mod(a, b);  // 50-200+ cycles
let dynamic = shl(a, n);    // Variable shift
```

Compound assignment (`+=`, `-=`, `&=`, etc.), postfix increment/decrement (`x++`, `x--`), and short-circuit logical operators (`&&`, `||`) are all supported.

For the complete operator reference, see [Operators](../language/expressions.md).

## Macros

R65 provides a simplified `macro_rules!` system with six fragment types (`expr`, `ident`, `literal`, `ty`, `reg`, `tt`) and comma-separated repetition:

```rust
macro_rules! inc_twice($reg:reg) {
    $reg++;
    $reg++;
}
inc_twice!(X);  // Expands to: X++; X++;

macro_rules! push_all($($reg:reg),*) {
    $( asm!("PH" + $reg); )*
}
push_all!(A, X, Y);
```

Each macro has a single pattern (no multiple arms). Expansion is not hygienic.

For complete macro documentation, see [Macros](../language/macros.md).

## Inline Assembly and File Inclusion

```rust
asm!("WAI");                    // Embed raw 65816 assembly
asm!("PHP", "SEI", "WAI");     // Multiple instructions

include!("hardware_defs.r65");  // Textual inclusion (C-style #include)
```

The compiler treats `asm!()` as a black box and assumes all registers are clobbered. `include!()` paths are relative to the including file; all content shares the global namespace.

## Compiler Usage

```bash
r65c game.r65 -o game.asm       # Compile to WLA-DX assembly
r65c game.r65                    # Compile to stdout
r65c game.r65 -o game.asm -v    # Verbose output
r65c game.r65 --cfg snes         # Enable SNES-specific features (hardware multiplier)
r65x init --platform snes my_project  # Scaffold a new project
```

The compiler pipeline is:

```
Source (.r65) -> Lexer -> Parser -> AST -> HIR -> Type Check -> MIR -> CodeGen -> WLA-DX (.asm)
```

## What R65 Omits from Rust

R65 deliberately omits Rust features that do not map well to 8-bit/16-bit hardware:

- **No lifetimes or borrowing** -- pointers are raw addresses
- **No generics** -- use macros or concrete types
- **No error handling types** -- no `Result`, `Option`, or `panic!()`
- **No closures or async/await** -- use function pointers
- **No module system** -- use `include!()` for file organization
- **No `unsafe` keyword** -- all code has direct hardware access by default
- **No bounds checking** -- array and pointer indexing is unchecked
- **No string types or dynamic collections** -- use fixed-size arrays
- **No advanced enums** -- no data-carrying variants
- **No procedural macros** -- simplified `macro_rules!` only

## Target Platform

- **CPU**: WDC 65816 (16-bit extension of the 6502)
- **Primary Target**: Super Nintendo Entertainment System (SNES)
- **Assembler Backend**: WLA-DX
- **ROM Formats**: LoROM and HiROM

## Further Reading

- [Type System](../language/types.md) -- primitive types, composite types, mode tracking, and cast rules
- [Control Flow](../language/statements.md) -- if/else, loops, match, break/continue, and labels
- [Calling Convention](../language/functions.md) -- parameter passing, return values, stack frames, and cross-bank calls
- [Pointers and Memory](../hardware/memory-model.md) -- pointer types, addressing modes, storage classes, and the SNES memory map
- [Operators](../language/expressions.md) -- operator restrictions, cost model, and built-in functions
- [Macros](../language/macros.md) -- macro definition, fragment types, and repetition
- [Interrupt Handling](../hardware/interrupts.md) -- interrupt vectors, register preservation, and mode transitions
- [SNES ROM Header](../platform/snes-rom-header.md) -- ROM configuration and bank layout

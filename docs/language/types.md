---
sidebar_position: 2
title: Types
description: R65 type system — primitives, composites, pointers, and type checking rules.
---

# Types

R65 provides a minimal type system designed around the 65816 processor's register sizes and addressing modes. All types have fixed, known sizes at compile time. There are no alignment requirements and no runtime bounds checking.

## Primitive Types

### Integer Types

| Type  | Size    | Range                     | Signedness |
|-------|---------|---------------------------|------------|
| `u8`  | 1 byte  | 0 to 255                  | Unsigned   |
| `i8`  | 1 byte  | -128 to 127               | Signed     |
| `u16` | 2 bytes | 0 to 65535                | Unsigned   |
| `i16` | 2 bytes | -32768 to 32767           | Signed     |

All integer arithmetic wraps on overflow. There is no runtime range checking.

```rust
let x: u8 = 255;
x = x + 1;      // Wraps to 0
```

### Boolean Type

| Type   | Size   | Representation          |
|--------|--------|-------------------------|
| `bool` | 1 byte | Stored as `u8` (0 or 1) |

`bool` is a distinct type from `u8` but occupies the same storage. `false` is 0, `true` is 1.

```rust
let flag: bool = true;
let raw: u8 = flag as u8;   // 1
let back: bool = raw as bool; // true (any non-zero value becomes true)
```

## Hardware Register Types

Hardware registers are global variables whose types depend on the current processor mode. See the [Registers](/docs/hardware/registers) section for full documentation.

### Mode-Dependent Registers

The accumulator's type changes based on function mode:

| Register | m8 Mode (default) | m16 Mode (`@ A: u16` param) |
|----------|-------------------|----------------------------|
| `A`      | `u8`              | `u16`                      |
| `B`      | `u8`              | not available (compile error) |

**m8 mode** is the default. A function enters m16 mode only when it declares a `@ A: u16` parameter.

`B` is the hidden high byte of the 16-bit accumulator, accessed internally via the XBA instruction. It is only meaningful in m8 mode; using `B` in a function with `@ A: u16` is a compile error.

### Mode-Independent Registers

These registers have fixed types regardless of processor mode:

| Register | Type  | Notes                          |
|----------|-------|--------------------------------|
| `X`      | `u16` | Index register (always x16)    |
| `Y`      | `u16` | Index register (always x16)    |
| `STATUS` | `u8`  | Processor status (NVMXDIZC)    |
| `D`      | `u16` | Direct Page register           |
| `DBR`    | `u8`  | Data Bank Register             |
| `PBR`    | `u8`  | Program Bank Register (read-only) |
| `S`      | `u16` | Stack Pointer                  |

X and Y are always 16-bit in R65 (x16 mode is assumed). Attempting to bind a parameter with `@ X: u8` or `@ Y: u8` is a compile error.

```rust
fn example(val @ A: u8) {
    // A: u8 (m8 mode)
    // X: u16, Y: u16 (always)
    X = 1000;    // OK
    A = 10;      // OK
}

fn wide(val @ A: u16) {
    // A: u16 (m16 mode)
    // B: not available
    A = 1000;    // OK
    // B = 5;    // ERROR: B not available in m16 mode
}
```

## Composite Types

### Arrays

Fixed-size arrays with elements packed contiguously in memory.

```rust
[T; N]   // Array of N elements of type T
```

| Property       | Value                      |
|----------------|----------------------------|
| Size           | `N * sizeof(T)` bytes      |
| Layout         | Packed, no padding         |
| Bounds checking | None                      |
| Pass semantics | By reference only (use pointers) |

```rust
#[ram]
static mut BUFFER: [u8; 256] = [0; 256];

#[ram]
static mut MESSAGE: [u8; 16] = "Hello, World!";  // String literal, zero-padded
```

Arrays cannot be passed by value to functions. Pass a pointer instead.

Out-of-bounds access is undefined behavior. The compiler performs no runtime checks.

### Structs

Structs are packed aggregates with fields laid out in declaration order. No padding is inserted between fields.

```rust
struct Player {
    x: u8,
    y: u8,
    health: u16,
}
// Total size: 4 bytes (1 + 1 + 2)
```

| Property       | Value                           |
|----------------|---------------------------------|
| Layout         | Packed, declaration order       |
| Size           | Sum of all field sizes          |
| Alignment      | None                            |
| Methods        | None (use free functions)       |
| Pass semantics | By reference only (use pointers) |

Structs cannot be passed by value or directly assigned. Use pointers for indirection.

```rust
#[ram]
static mut PLAYER: Player;

PLAYER.x = 10;
PLAYER.health = 100;

let p = Player { x: 10, y: 20, health: 100 };
```

### Enums

C-style enums with explicit or auto-incrementing discriminant values. No data-carrying variants.

```rust
enum Direction {
    North = 0,
    East,       // 1
    South,      // 2
    West,       // 3
}
```

| Property         | Value                                               |
|------------------|-----------------------------------------------------|
| Representation   | Smallest integer type that fits all discriminants    |
| Size             | `u8` if all values fit in 0..255, otherwise `u16`   |
| Data variants    | Not supported                                       |

Enums can be cast to their underlying integer type with `as`:

```rust
let dir = Direction::North;
let value: u8 = dir as u8;   // 0
```

### Pointers

Pointers are raw memory addresses with no metadata, bounds, or ownership tracking.

#### Near Pointers

```rust
let ptr: *u8 = 0x2000;    // 2 bytes, 16-bit address within current data bank
```

Near pointers address 64KB within the current Data Bank Register (DBR).

#### Far Pointers

```rust
let ptr: far *u8 = 0x01_2000;   // 3 bytes, 24-bit address (includes bank)
```

Far pointers address the full 16MB address space.

#### Pointer to Slice (Unsized Array)

```rust
let ptr: *[u8];   // Near pointer to unsized array
```

`*[T]` points to a contiguous sequence of `T` with unknown length. A pointer to a fixed-size array (`*[T; N]`) coerces implicitly to `*[T]`, enabling generic array parameters:

```rust
fn process(data: *[u8]) { }

static TABLE: [u8; 256] = [0; 256];
process(&TABLE);   // *[u8; 256] coerces to *[u8]
```

#### Pointer Sizes

| Pointer Type  | Size    | Range               |
|---------------|---------|---------------------|
| `*T`          | 2 bytes | 64KB (current bank) |
| `far *T`      | 3 bytes | 16MB (full address space) |
| `*[T]`        | 2 bytes | Same as `*T`        |
| `far *[T]`    | 3 bytes | Same as `far *T`    |

#### Operations

Pointers support dereference, indexing, arithmetic, comparison, and casting:

```rust
*ptr = 42;                  // Dereference (write)
let v = *ptr;               // Dereference (read)
ptr[Y] = 5;                 // Indexed access
ptr = ptr + 10;             // Pointer arithmetic (scaled by sizeof(T))
if ptr as u16 != 0 { }     // Null check (manual)
```

Struct field access through pointers is auto-dereferenced:

```rust
#[zeropage]
static mut PTR: *Player;
PTR.x = 10;    // Equivalent to (*PTR).x = 10
```

### Function Pointers

Function pointers store the address of a callable function.

| Type           | Size    | Calling Convention |
|----------------|---------|-------------------|
| `fn()`         | 2 bytes | Near (JSR/RTS)    |
| `far fn()`     | 3 bytes | Far (JSL/RTL)     |

```rust
fn add(a @ A: u8, b @ X: u16) -> u8 { return A; }

let callback: fn(u8, u16) -> u8 = add;
```

The calling convention (near vs. far) is encoded in the type. A `fn()` and `far fn()` are distinct, incompatible types.

### Tuples

Tuples exist only as multiple return value types. They cannot be stored in variables, passed as parameters, or used in struct fields.

```rust
fn unpack(value: u16) -> (u8, u8) {
    A = value as u8;
    B = (value >> 8) as u8;
    return A, B;
}

let (low, high) = unpack(0x1234);
```

Supported tuple forms and their register mappings:

| Return Type    | Registers Used           | Mode Requirement |
|----------------|--------------------------|------------------|
| `(u8, u8)`     | A, B                     | m8               |
| `(u8, u16)`    | A, X                     | m8               |
| `(u16, u16)`   | A, X                     | m16              |

Tuples are destructured at the call site only. There is no general-purpose tuple type.

### Never Type

The never type `!` indicates a function that never returns. The compiler omits `RTS`/`RTL` generation for such functions.

```rust
fn main_loop() -> ! {
    loop {
        wait_for_vblank();
        update_game();
        render();
    }
}
```

Use `-> !` for the main game loop or any function that intentionally loops forever or halts the processor.

### Type Aliases

Type aliases create alternate names for existing types. They are fully transparent to the type checker.

```rust
type Word = u16;
type Byte = u8;
type Callback = fn(u8) -> u8;

let w: Word = 0x1234;     // Same as: let w: u16 = 0x1234;
```

## Type Sizes Summary

| Type              | Size    |
|-------------------|---------|
| `u8`, `i8`, `bool` | 1 byte  |
| `u16`, `i16`      | 2 bytes |
| `*T`, `*[T]`      | 2 bytes |
| `far *T`, `far *[T]` | 3 bytes |
| `fn()`            | 2 bytes |
| `far fn()`        | 3 bytes |
| `[T; N]`          | `N * sizeof(T)` |
| struct            | Sum of field sizes |
| enum              | `u8` or `u16` (inferred) |

## Type Conversions

All type conversions require the explicit `as` keyword. There are no implicit conversions between types, with the exception of integer promotion in binary expressions (see below).

### Cast Behaviors

| Cast               | Behavior          | Typical Cost  |
|--------------------|-------------------|---------------|
| `u8 as u16`        | Zero-extend       | 2-4 cycles    |
| `i8 as i16`        | Sign-extend       | 4-8 cycles    |
| `u16 as u8`        | Truncate (low byte) | 0-2 cycles |
| `u8 as i8`         | Reinterpret bits  | 0 cycles      |
| `i8 as u8`         | Reinterpret bits  | 0 cycles      |
| `bool as u8`       | `false` = 0, `true` = 1 | 0 cycles |
| `u8 as bool`       | 0 = `false`, non-zero = `true` | 0 cycles |
| `*T as *U`         | Pointer reinterpret | 0 cycles    |
| `*T as u16`        | Pointer to integer | 0 cycles     |
| `u16 as *T`        | Integer to pointer | 0 cycles     |
| `far *T as u16`    | Truncate (drop bank) | 0 cycles   |
| `Enum as u8`/`u16` | Enum to underlying integer | 0 cycles |

```rust
let small: u8 = 42;
let wide: u16 = small as u16;    // Zero-extend: 0x002A
let back: u8 = wide as u8;       // Truncate: 0x2A

let signed: i8 = -5;
let wide_s: i16 = signed as i16; // Sign-extend: 0xFFFB
```

## Type Checking Rules

### Integer Assignment

Integer types are compatible with each other for assignment. Explicit casts are recommended but not strictly required for integer-to-integer assignment:

```rust
let a: u8 = 10;
let b: u16 = 20;

b = a;            // OK: integer types are compatible
a = b;            // OK: truncates (programmer's responsibility)
b = a as u16;     // Preferred: explicit cast makes intent clear
```

Non-integer types (pointers, structs, enums) require exact type matches.

### Implicit Integer Promotion

When a binary operator has mixed-size integer operands, the smaller operand is automatically widened to match the larger:

```rust
let a: u8 = 10;
let b: u16 = 1000;
let c: u16 = a + b;   // a is implicitly promoted to u16
```

This applies to arithmetic (`+`, `-`), bitwise (`&`, `|`, `^`), and comparison (`==`, `<`, etc.) operators.

### Pointer Type Checking

Pointer types must match exactly. Near and far pointers are distinct types, as are pointers to different element types:

```rust
let p1: *u8 = 0x2000;
let p2: *u16 = 0x3000;
let p3: far *u8 = 0x01_2000;

// p1 = p2;    // ERROR: *u8 vs *u16
// p1 = p3;    // ERROR: *u8 vs far *u8

p1 = p2 as *u8;     // OK: explicit cast
p1 = p3 as *u8;     // OK: explicit cast (drops bank byte)
```

### Function Call Type Checking

Argument types must match parameter types exactly. No implicit conversions are performed at call boundaries:

```rust
fn add(a: u8, b: u8) -> u8 { return a + b; }

let x: u8 = 10;
let y: u16 = 20;

add(x, x);          // OK
// add(x, y);       // ERROR: u16 does not match u8
add(x, y as u8);    // OK: explicit cast
```

### Register Alias Type Checking

When binding a variable to a hardware register, the declared type must match the register's current type (determined by the function's mode):

```rust
fn example() {
    let value @ A: u8 = 10;     // OK: A is u8 in m8 mode
    // let value @ A: u16 = 10; // ERROR: A is u8 in m8 mode
}

fn wide(input @ A: u16) {
    let value @ A: u16 = 1000;  // OK: A is u16 in m16 mode
}
```

### Pointer Auto-Dereference

Struct field access through pointers is auto-dereferenced. No explicit `(*ptr).field` syntax is required:

```rust
struct Player { x: u8, y: u8, health: u16 }

#[zeropage]
static mut PTR: *Player;

PTR.x = 10;           // Auto-dereferences: (*PTR).x = 10
let hp = PTR.health;  // Auto-dereferences: (*PTR).health
```

## Type Inference

R65 has very limited type inference.

### What Is Inferred

**Numeric literal types** are inferred from the context in which they appear:

```rust
let x: u8 = 10;     // 10 inferred as u8
let y: u16 = 1000;  // 1000 inferred as u16
```

**Register alias types** are inferred from the register's current type:

```rust
fn example() {
    let value @ A = 10;    // Inferred as u8 (A is u8 in m8 mode)
}

fn wide(input @ A: u16) {
    let value @ A = 1000;  // Inferred as u16 (A is u16 in m16 mode)
}
```

### What Is Not Inferred

- Variable types without a register binding or explicit annotation
- Function return types
- Function parameter types

```rust
// let z = 10;   // ERROR: cannot infer type without annotation
let z: u8 = 10;  // OK: explicit type
```

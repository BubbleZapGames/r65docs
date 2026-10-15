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
let mut x: u8 = 255;
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
    val = 10;      // OK
}

fn wide(val @ A: u16) {
    // A: u16 (m16 mode)
    val = 1000;    // OK
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

static mut MESSAGE: [u8; 16] = "Hello, World!";  // String literal, zero-padded
```

Arrays cannot be passed by value to functions. Pass a pointer instead.

Dynamic array access which is out-of-bounds is undefined behavior. The compiler performs no runtime checks.

**Arrays of `#[soa]` structs** are the one exception to the packed layout. A struct marked [`#[soa]`](./attributes.md#soa) stores every array of it as one array *per field*, so `POOL[i].hp` indexes a `[u8; N]` plane of `hp` values rather than scaling `i` by the element size. The syntax is unchanged; what changes is that an element has no contiguous address, so `&POOL[i]` and whole-element copies are rejected. Arrays of [tagged enums](./enums.md#storage-two-planes) are stored the same way, as a tag plane and a payload plane.

```rust
#[soa]
struct Enemy { kind: u8, hp: u8 }

#[lowram]
static mut POOL: [Enemy; 16];   // POOL__kind: [u8; 16], POOL__hp: [u8; 16]

POOL[i].hp = 100;               // indexes the hp plane directly
```

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
| Methods        | Inherent `impl` blocks, associated consts and functions |
| Pass semantics | By reference only (use pointers) |

Structs cannot be passed by value or copied with a bare `=`. Use pointers for indirection, and `.clone()` to copy -- see [Structs](./structs.md#pass-by-pointer-only).

A struct with a single *positional* field is a [newtype](./new_types.md) instead — a scalar, not an aggregate, passed by value in a register.

```rust
#[ram]
static mut PLAYER: Player;

PLAYER.x = 10;
PLAYER.health = 100;

let p = Player { x: 10, y: 20, health: 100 };
```

### Unions

A union has the same field syntax as a struct, but every field sits at **offset 0** and the union's size is that of its largest field. There is no tag and no record of which field was written last.

```rust
union Pixel {
    raw: u16,       // offset 0
    bytes: [u8; 2], // offset 0
}
// Total size: 2 bytes
```

| Property       | Value                            |
|----------------|----------------------------------|
| Layout         | Every field at offset 0          |
| Size           | Largest field                    |
| Tag            | None                             |
| Pass semantics | By reference only (use pointers) |

Writing one field and reading another reinterprets the same bytes. See [Unions](./unions.md).

### Enums

Fieldless enums are C-style: named integer constants with explicit or auto-incrementing discriminants. A variant may instead carry a declared struct as its payload, making the enum a [tagged enum](./enums.md#tagged-enums).

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
| Methods          | Inherent `impl` blocks; `self` is the discriminant   |
| Data variants    | A declared struct per variant, stored as tag and payload planes — see [Enums](./enums.md#tagged-enums) |

Enums can be cast to their underlying integer type with `as`:

```rust
let dir = Direction::North;
let value: u8 = dir as u8;   // 0
```

### Pointers

Pointers are raw memory addresses with no metadata, bounds, or ownership tracking.

#### Near Pointers

```rust
let ptr: *u8 = 0x2000 as *u8;    // 2 bytes, 16-bit address within current data bank
```

Near pointers address 64KB within the current Data Bank Register (DBR).

#### Far Pointers

```rust
let ptr: far *u8 = 0x01_2000 as far *u8;   // 3 bytes, 24-bit address (includes bank)
```

Far pointers address the full 16MB address space.

#### Pointer to Array

```rust
let ptr: *[u8; 256];   // Near pointer to fixed-size array
```

`*[T; N]` points to a fixed-size array, enabling compile-time bounds checking on constant indices. It implicitly coerces to `*T`, enabling generic array parameters:

```rust
fn process(data: *u8) { }

static TABLE: [u8; 256] = [0; 256];
process(&TABLE);   // *[u8; 256] coerces to *u8
```

#### Pointer Sizes

| Pointer Type  | Size    | Range               |
|---------------|---------|---------------------|
| `*T`          | 2 bytes | 64KB (current bank) |
| `far *T`      | 3 bytes | 16MB (full address space) |

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

### Multiple Return Values

A function can return up to four values by listing their **types** after `->`, separated by commas. You write the types — not register names — and the compiler assigns each value to a hardware register automatically:

```rust
fn unpack(value: u16) -> u8, u8 {
    A = value as u8;
    B = (value >> 8) as u8;
    return A, B;
}

let low, high = unpack(0x1234);
```

**Register assignment.** Values are placed into registers in this order, based on their size and the function's accumulator mode:

| Position | Register | Holds |
|----------|----------|-------|
| 1st      | `A`      | 1 byte in m8, 2 bytes in m16 |
| 2nd      | `B` if it is 8-bit and the function is m8, otherwise `X` | `B`: 1 byte · `X`: 2 bytes |
| 3rd      | `X` (or `Y` if `B` was used) | 2 bytes |
| 4th      | `Y`      | 2 bytes |

Because `X` and `Y` are always 16-bit, the third and fourth values must be 16-bit types. A fourth value is only possible when the second value is 8-bit in m8 mode (which frees the `B` register); otherwise the maximum is three values.

**Common return combinations:**

| Return Type            | Registers   | Mode | Notes |
|------------------------|-------------|------|-------|
| `-> u8, u8`            | A, B        | m8   | `B` avoids a TAX; both bytes stay in the accumulator word |
| `-> u8, u16`           | A, X        | m8   | u8 + u16 |
| `-> u16, u16`          | A, X        | m16  | two 16-bit values (requires an `@ A: u16` parameter) |
| `-> u8, u16, u16`      | A, X, Y     | m8   | three values |
| `-> u8, u8, u16, u16`  | A, B, X, Y  | m8   | four values |

A type that cannot fit its assigned register is a compile error — for example `-> u16, u8` in m8 mode (register `A` holds only one byte) or `-> u8, u8, u8` (the third value maps to the 16-bit `X` register). There is no register-name spelling: `-> rA, rB` is not valid syntax.

Caller captures values with multi-binding — either declaring new variables or assigning to existing ones:

```rust
let a, b = get_pair();      // declare and bind
a, b = get_pair();          // assign to existing variables
```

Multi-return values cannot be stored directly in variables outside of a call site capture. There is no general-purpose tuple type.

### Never Type

The never type `!` indicates a function that never returns. The compiler emits no `RTS`/`RTL`; if control can reach the end of the function or a `return`, it emits a branch-to-self halt loop there instead — there's no valid return address to return to, and a stray return would fall through to whatever bytes follow in ROM. Reaching the end of a `-> !` function is not a compile error.

```rust
fn main_loop() -> ! {
    loop {
        wait_nmi!();
        update_game();
        render();
    }
}
```

Use `-> !` for the main game loop, reset handlers, or any function that intentionally loops forever or halts the processor. Entry functions (`#[entry]`) receive the same halt-loop treatment automatically.

### Type Aliases

Type aliases create alternate names for existing types. They are fully transparent to the type checker. For a name the type checker keeps *distinct*, use a [newtype](./new_types.md).

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
| `*T`              | 2 bytes |
| `far *T`          | 3 bytes |
| `fn()`            | 2 bytes |
| `far fn()`        | 3 bytes |
| `[T; N]`          | `N * sizeof(T)` |
| struct            | Sum of field sizes |
| union             | Largest field |
| enum              | `u8` or `u16` (inferred) |
| newtype           | Its payload's size (1 or 2 bytes) |

## Type Conversions

All type conversions require the explicit `as` keyword. There are no implicit conversions between types, with two exceptions: integer promotion in binary expressions, and a fieldless enum used where an integer of its width is expected (see [Type Checking Rules](#type-checking-rules)). This is the one cast table; other pages link here.

### Cast Behaviors

| Cast               | Behavior          | Typical Cost  |
|--------------------|-------------------|---------------|
| `u8 as u16`        | Zero-extend       | 2-4 cycles    |
| `i8 as i16`        | Sign-extend       | 4-8 cycles    |
| `u16 as u8`        | Truncate (low byte) | 0-2 cycles |
| `u8 as i8`         | Reinterpret bits  | 0 cycles      |
| `i8 as u8`         | Reinterpret bits  | 0 cycles      |
| `bool as u8`       | `false` = 0, `true` = 1 | 0 cycles |
| `u8 as bool`       | 0 = `false`, non-zero = `true` (normalized to 0/1) | ~6 cycles |
| `*T as *U`         | Pointer reinterpret | 0 cycles    |
| `*T as u16`        | Pointer to integer | 0 cycles     |
| `u16 as *T`        | Integer to pointer | 0 cycles     |
| `far *T as u16`    | Truncate (drop bank) | 0 cycles   |
| `Enum as u8`/`u16` | Enum to underlying integer | 0 cycles |
| `u8 as Enum`/`u16 as Enum` | Reinterpret as the discriminant, no range check | 0 cycles |
| `Newtype as T`     | Unwrap to the payload | 0 cycles |
| `T as Newtype`     | Wrap, truncating if the payload is narrower | 0 cycles |
| `Newtype as Newtype` | Through the payloads, truncating if narrower | 0 cycles |

```rust
let small: u8 = 42;
let wide: u16 = small as u16;    // Zero-extend: 0x002A
let back: u8 = wide as u8;       // Truncate: 0x2A

let signed: i8 = -5;
let wide_s: i16 = signed as i16; // Sign-extend: 0xFFFB
```

## Type Checking Rules

### Integer Assignment

Assigning between integer types of different widths or signedness requires `as`. Narrowing is never implicit — truncation must be visible in the source:

```rust
let mut a: u8 = 10;
let mut b: u16 = 20;

b = a as u16;     // OK: zero-extend
a = b as u8;      // OK: truncate (programmer's responsibility)
// a = b;         // ERROR: u16 does not match u8
```

A fieldless enum is accepted wherever an integer of its width is (see [Enums](./enums.md#representation)). Other non-integer types (pointers, structs, unions, tagged enums) require exact type matches.

### Newtypes: Transparent In, Opaque Out

A [newtype](./new_types.md) accepts its payload implicitly but never flows back out as one. Getting the payload out takes `.0` or an explicit `as`:

```rust
struct TileId(u8);

let t: TileId = 5;      // OK: the payload flows in
let n: u8 = t;          // error: a newtype does not flow out implicitly
let n: u8 = t.0;        // OK
let n: u8 = t as u8;    // OK
```

Two different newtypes never mix under an operator, even with identical payloads, though `as` still converts between them through the payloads.

### Implicit Integer Promotion

When a binary operator has mixed-size integer operands, the smaller operand is automatically widened to match the larger:

```rust
let a: u8 = 10;
let b: u16 = 1000;
let c: u16 = a + b;   // a is implicitly promoted to u16
```

This applies to arithmetic (`+`, `-`), bitwise (`&`, `|`, `^`), and comparison (`==`, `<`, etc.) operators. An ordering comparison (`<`, `<=`, `>`, `>=`) between a signed and an unsigned operand is an error instead; cast one side with `as`.

### Pointer Type Checking

Pointer types must match exactly. Near and far pointers are distinct types, as are pointers to different element types:

```rust
let mut p1: *u8 = 0x2000 as *u8;
let p2: *u16 = 0x3000 as *u16;
let p3: far *u8 = 0x01_2000 as far *u8;

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

R65 has limited, local type inference.

### What Is Inferred

**Numeric literal types** are inferred from the context in which they appear:

```rust
let x: u8 = 10;     // 10 inferred as u8
let y: u16 = 1000;  // 1000 inferred as u16
```

**Local variable types** are taken from the initializer when the annotation is omitted. A bare integer literal gets the smallest type that holds it — `u8`, then `u16` for non-negative values, `i8`, then `i16` for negative ones:

```rust
let a = 10;          // u8
let b = 1000;        // u16
let c = -5;          // i8
let d = SCORE + 1;   // the type of SCORE + 1
let p = &BUFFER;     // the pointer type of &BUFFER
```

Annotate when you want a wider type than the literal suggests: `let n = 10;` is a `u8` and wraps at 255.

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

- The type of a variable declared without an initializer — `let mut t: u8;` needs its annotation
- Function return types
- Function parameter types
- Static and constant types

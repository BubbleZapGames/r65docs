---
sidebar_position: 1
title: "Lexical Structure"
description: "R65 tokens, keywords, comments, and literals."
---

# Lexical Structure

This page defines the fundamental lexical elements of R65: the tokens that make up the source language, including comments, keywords, literals, and identifiers.

## Comments

R65 supports two comment styles, matching C and Rust conventions.

### Line Comments

A line comment begins with `//` and extends to the end of the line.

```rust
// This is a line comment
let x: u8 = 10; // inline comment
```

### Block Comments

A block comment begins with `/*` and ends with `*/`. Block comments **do not nest**.

```rust
/* This is a block comment */

/*
 * Multi-line block comments
 * are also valid.
 */

/* Nesting /* is NOT supported */ -- this ends the comment here */
```

### No Doc Comments

R65 does not support Rust-style doc comments (`///` or `//!`). The sequences `///` and `//!` are treated as ordinary line comments.

## Keywords

R65 reserves **57 keywords** organized into five categories. All keywords are case-sensitive and must be lowercase, with the sole exception of `Self`.

### Implemented Keywords (22)

These keywords are actively used in the grammar:

| Keyword | Purpose |
|---------|---------|
| `fn` | Function definition |
| `let` | Variable binding |
| `mut` | Mutable modifier |
| `const` | Compile-time constant |
| `static` | Static variable |
| `if` | Conditional branch |
| `else` | Conditional alternative |
| `loop` | Infinite loop |
| `while` | Conditional loop |
| `for` | Range-based for loop |
| `in` | For loop range keyword |
| `match` | Pattern matching expression |
| `break` | Exit loop |
| `continue` | Skip to next iteration |
| `return` | Return from function |
| `struct` | Structure definition |
| `enum` | Enumeration definition |
| `type` | Type alias |
| `include` | File inclusion (`include!()`) |
| `asm` | Inline assembly (`asm!()`) |
| `as` | Type casting |
| `macro_rules` | Macro definition |

### Built-in Hardware Instructions (4)

These identifiers are recognized as built-in functions because they map to special 65816 hardware instructions:

| Keyword | Purpose |
|---------|---------|
| `mvn` | Block move next (forward copy) |
| `mvp` | Block move previous (backward copy) |
| `wai` | Wait for interrupt |
| `stp` | Stop processor |

### Reserved Rust Keywords (17)

These keywords are reserved for Rust compatibility and future use. Using them as identifiers is a compile error:

`impl`, `trait`, `where`, `use`, `pub`, `mod`, `crate`, `self`, `Self`, `super`, `async`, `await`, `move`, `ref`, `dyn`, `extern`, `unsafe`

### Strict Reserved Keywords (13)

Reserved by Rust for future language expansion. R65 reserves them for compatibility:

`abstract`, `become`, `box`, `do`, `final`, `macro`, `override`, `priv`, `typeof`, `unsized`, `virtual`, `yield`, `try`

### Special Modifier (1)

| Keyword | Purpose |
|---------|---------|
| `far` | Far function (`far fn`) or far pointer (`far *T`) modifier |

### Case Sensitivity

All keywords must be lowercase, except `Self`:

```rust
fn main() { }   // OK: 'fn' is a keyword
Fn main() { }   // ERROR: 'Fn' is not a keyword (treated as identifier)
FN main() { }   // ERROR: 'FN' is not a keyword
```

Keywords use word boundaries and do not match inside longer identifiers. `implementation` is a valid identifier even though it starts with `impl`.

## Numeric Literals

### Decimal Literals

Decimal integer literals consist of one or more ASCII digits (`0`-`9`):

```rust
0
42
255
65535
```

### Hexadecimal Literals

Hexadecimal literals begin with `0x` or `0X`, followed by hex digits (`0`-`9`, `a`-`f`, `A`-`F`):

```rust
0xFF
0x2100
0x7E2000
0x00
```

Underscores can be used as visual separators in addresses:

```rust
0x7E_2000   // Bank $7E, offset $2000
0x01_8000   // Bank 1, offset $8000
```

### Binary Literals

Binary literals begin with `0b` or `0B`, followed by binary digits (`0` and `1`):

```rust
0b10110100
0b0000_0001
0b1111_1111
```

### Literal Type Inference

Numeric literals have no intrinsic type. Their type is inferred from context:

```rust
let x: u8 = 255;      // 255 is u8
let y: u16 = 1000;    // 1000 is u16
let z: u16 = 0xFF;    // 0xFF is u16

let w = 10;  // ERROR: cannot infer type without annotation
```

A compile-time error is produced if the literal value does not fit in the target type (e.g., `let x: u8 = 256;`).

## String Literals

String literals are enclosed in double quotes and may **only** appear in static array initializers. R65 does not have a string type.

```rust
#[ram]
static mut MESSAGE: [u8; 16] = "Hello, World!";
```

### Character Set

String literals support extended ASCII (bytes `0x00` through `0xFF`). UTF-8 multi-byte sequences are rejected at compile time.

### Escape Sequences

| Sequence | Meaning |
|----------|---------|
| `\0` | Null byte (`0x00`) |
| `\n` | Newline (`0x0A`) |
| `\r` | Carriage return (`0x0D`) |
| `\t` | Tab (`0x09`) |
| `\\` | Backslash |
| `\"` | Double quote |

### Padding and Null Termination

When a string literal is shorter than the declared array size, the remaining bytes are zero-padded. Null termination is **not** automatic; add an explicit `\0` if needed:

```rust
#[ram]
static mut NAME: [u8; 8] = "Hi\0";  // [0x48, 0x69, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
```

### Restriction

String literals cannot appear in `let` bindings, function parameters, or expressions. They are exclusively for initializing static byte arrays.

## Boolean Literals

The two boolean literals are `true` and `false`. They have type `bool`, which is stored as a single byte (`u8`):

```rust
let flag: bool = true;
let done: bool = false;
```

`true` converts to `1` and `false` converts to `0` when cast with `as u8`.

## Hardware Register Names

The 65816 processor registers are exposed as special global identifiers. Register names **must be uppercase**; lowercase versions are valid user-defined variable names.

| Register | Type | Description |
|----------|------|-------------|
| `A` | `u8` or `u16` | Accumulator (size depends on function mode) |
| `B` | `u8` | Accumulator high byte (m8 mode only) |
| `X` | `u16` | X index register (always 16-bit) |
| `Y` | `u16` | Y index register (always 16-bit) |
| `STATUS` | `u8` | Processor status flags (N V M X D I Z C) |
| `D` | `u16` | Direct Page register |
| `DBR` | `u8` | Data Bank Register |
| `PBR` | `u8` | Program Bank Register (read-only) |
| `S` | `u16` | Stack Pointer |

### Case Rules

```rust
A = 10;           // OK: hardware register A
let a: u8 = 5;   // OK: variable 'a' (lowercase)

X = 100;          // OK: hardware register X
let x: u8 = 10;  // OK: variable 'x' (lowercase)

STATUS.Carry = true;  // OK: STATUS register property
let status: u8 = 0;   // OK: variable 'status' (lowercase)
```

Multi-character register names in the wrong case (`dbr`, `pbr`, `status`) produce a helpful error suggesting the uppercase form.

## Identifiers

Identifiers begin with a letter or underscore, followed by letters, digits, or underscores:

```
[a-zA-Z_][a-zA-Z0-9_]*
```

Identifiers are case-sensitive. Reserved keywords and hardware register names (when uppercase) cannot be used as identifiers.

```rust
let my_var: u8 = 10;       // OK
let _temp: u16 = 0;        // OK: leading underscore
let player_health: u8 = 0; // OK
let BUFFER_SIZE: u16 = 256; // OK: uppercase identifiers are allowed (these are not registers)
```

## Operators and Punctuation

R65 uses the following operator and punctuation tokens:

| Token | Meaning |
|-------|---------|
| `+` `-` `*` `/` `%` | Arithmetic |
| `&` `\|` `^` `~` | Bitwise |
| `<<` `>>` | Shift |
| `==` `!=` `<` `>` `<=` `>=` | Comparison |
| `&&` `\|\|` `!` | Logical |
| `=` | Assignment |
| `+=` `-=` `*=` `/=` `&=` `\|=` `^=` `<<=` `>>=` | Compound assignment |
| `++` `--` | Postfix increment/decrement |
| `@` | Register/variable binding |
| `->` | Return type arrow |
| `..` | Range (in `for` loops and `match`) |
| `..=` | Inclusive range (in `match`) |
| `(` `)` `{` `}` `[` `]` | Grouping/delimiters |
| `;` `:` `,` `.` `#` `'` | Punctuation |

## Whitespace

Spaces, tabs, and newlines serve as token separators and are otherwise insignificant. R65 is not whitespace-sensitive; indentation is a stylistic choice.

---
sidebar_position: 1
title: "Lexical Structure"
description: "R65 tokens, keywords, comments, and literals."
---

# Lexical Structure

This page defines the fundamental lexical elements of R65: the tokens that make up the source language, including comments, keywords, literals, and identifiers.

## Comments

R65 supports Rust-style comments in six forms: plain line/block comments and four doc-comment variants. All are UTF-8 safe and span from their opening delimiter to the matching terminator.

| Syntax | Kind | Attaches to | Notes |
|--------|------|-------------|-------|
| `//` | Line comment | — | Ignored by the compiler |
| `/* … */` | Block comment | — | Non-nesting; ignored by the compiler |
| `///` | Outer doc comment | Following declaration | Stored on the AST/HIR node's `doc` field |
| `/** … */` | Block outer doc | Following declaration | Stored on the AST/HIR node's `doc` field |
| `//!` | Inner doc comment | Enclosing file | Stored on `Program.doc` |
| `/*! … */` | Block inner doc | Enclosing file | Stored on `Program.doc` |

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

### Doc Comments

Doc comments are preserved by the lexer and attached to the following declaration (outer) or the enclosing file (inner). They are otherwise inert — the compiler does not currently emit documentation artifacts from them, but the text is available on AST and HIR nodes for tooling (formatters, generated reference pages, IDE hovers).

**Outer doc comments** attach to the declaration that immediately follows them and may be stacked across multiple lines:

```rust
/// Increment the player's score by `amount` and cap at 9999.
///
/// Called once per pickup frame.
fn add_score(amount @ A: u8) {
    // ...
}

/** Block form of the outer doc comment.
 *  Useful when you want consistent multi-line formatting.
 */
struct Player {
    x: u8,
    y: u8,
}
```

Valid attachment sites include `fn`, `static`, `const`, `struct`, `enum`, `trait`, and `impl` declarations.

**Inner doc comments** document the enclosing file and must appear **at the top of the file**, before any declarations:

```rust
//! Sprite-animation helpers.
//!
//! This module owns the per-frame OAM shadow buffer and exposes
//! `flush_oam_dma()` for the NMI handler to call.

fn flush_oam_dma() { /* ... */ }
```

Block form:

```rust
/*! Math routines for fixed-point 8.8 arithmetic.
    Use these in preference to the raw `mul8` / `div8` builtins
    when you need saturation semantics.
*/
```

### Doc-Comment Edge Cases

- **Four or more slashes is not a doc comment.** `////` is a regular line comment (negative lookahead rejects a trailing `/`). Use this when you want a visual separator without attaching text to a declaration.
- **`/**/` and `/***/` are regular block comments**, not doc comments — the block-doc grammar requires at least one content character between `/**` and `*/`.
- **Dangling outer doc comments are an error.** If a `///` or `/** */` does not precede a declaration, parsing fails.
- **Inner doc comments only at file scope.** `//!` and `/*! */` are not valid inside function bodies or declarations — they only attach to the program root.

## Keywords

R65 reserves **57 keywords** organized into five categories. All keywords are case-sensitive and must be lowercase, with the sole exception of `Self`.

### Implemented Keywords (26)

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
| `trait` | Trait definition |
| `impl` | Inherent or trait implementation block (`impl Foo { ... }`, `impl Trait for Foo { ... }`) |
| `self` | Self parameter in trait methods (`*self`, `far *self`, `near *self`) |
| `dyn` | Dynamic dispatch pointer type (`*dyn Trait`) |
| `include` | File inclusion (`include!()`) |
| `asm` | Inline assembly (`asm!()`) |
| `as` | Type casting |
| `macro_rules` | Macro definition |

### Hardware Instructions


Use `asm!("WAI")`, `asm!("STP")`, `asm!("XBA")`, `asm!("MVN ...")`, `asm!("COP ...")`, `asm!("BRK ...")` directly, or reach for the `stdlib/65816.r65` macros (`block_move!`, `stack_guard_check!`, etc.) when you want a typed wrapper. `NOP()` is still provided as a built-in because of its optional repeat-count argument.


### Reserved Rust Keywords (13)

These keywords are reserved for Rust compatibility and future use. Using them as identifiers is a compile error:

`where`, `use`, `pub`, `mod`, `crate`, `Self`, `super`, `async`, `await`, `move`, `ref`, `extern`, `unsafe`

### Strict Reserved Keywords (13)

Reserved by Rust for future language expansion. R65 reserves them for compatibility:

`abstract`, `become`, `box`, `do`, `final`, `macro`, `override`, `priv`, `typeof`, `unsized`, `virtual`, `yield`, `try`

### Special Modifiers (2)

| Keyword | Purpose |
|---------|---------|
| `far` | 24-bit addressing: far function (`far fn`) is callable cross-bank via JSL/RTL, far pointer (`far *T`) stores a 3-byte address (bank + 16-bit offset), far self parameter (`far *self`) lets a trait method receive a receiver in a different bank than the caller. Required whenever the referent may live outside the current DBR. Pass `#[bank(n)]` or `#[bank(auto)]` on a `far fn` to pin or auto-place it |
| `near` | 16-bit addressing (explicit opt-in to the default): near function (`near fn`) uses JSR/RTS within the current bank, near pointer (`near *T`) stores a 2-byte address relative to DBR. The default when neither `far` nor `near` is specified, but writing it explicitly is useful to override an outer `far` context or to document intent |

Both modifiers appear in the same positions: before `fn` on function declarations, before `*T` on pointer types, before `self` on trait method receivers (`*self`, `far *self`, `near *self`), and before `static` on globals to pin the declaration to a specific addressing mode.

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

String literals are enclosed in double quotes. R65 does not have a string type — literals always lower to raw byte sequences.

**Two valid contexts:**

1. **Static array initializer** — sizes to the array, zero-pads the remainder:

   ```rust
   #[ram]
   static mut MESSAGE: [u8; 16] = "Hello, World!";
   ```

2. **Inline `*u8` pointer** — the compiler emits an anonymous ROM data section for the bytes and the literal evaluates to a near pointer into it. Works in `let` bindings, function arguments, and any expression position where `*u8` is the expected type:

   ```rust
   let ptr: *u8 = "Hello";        // ptr → ROM bytes [72,101,108,108,111]

   fn print_msg(s: *u8) { /* ... */ }
   print_msg("Hello, World!");    // string literal as function arg
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

### String Array Restrictions


- **Element type must be `u8`.** `[u16; N]` or other element types are rejected.
- **Near pointers only.** Inline literals always land in ROM and are referenced via a 16-bit pointer; assigning to `far *u8` is rejected. Cross-bank access must go through an explicit `static` declaration with an appropriate `#[bank(...)]` attribute.
- **One bank per literal.** An inline string literal cannot exceed `LOROM_BANK_SIZE` (32 KB) — it must fit in a single ROM bank.
- **Extended ASCII only.** Bytes `0x00`–`0xFF` are allowed; UTF-8 multi-byte sequences are rejected at compile time.

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

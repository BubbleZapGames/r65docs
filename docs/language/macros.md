---
sidebar_position: 11
title: "Macros"
description: "R65 macro system, fragment types, multiple arms, repetition, inline assembly, and built-in macros."
---

# Macros

R65 provides a simplified macro system inspired by Rust's `macro_rules!`, designed for the constraints and use cases of 65816 development. The system covers the most common macro patterns with a fraction of Rust's complexity.

## macro_rules! Syntax

### Definition

Single-arm shorthand:

```rust
macro_rules! name($param1:fragment, $param2:fragment) {
    // body using $param1 and $param2
}
```

Multi-arm (Rust-style), with arms separated by `;` (the trailing `;` is optional):

```rust
macro_rules! name {
    ($param:fragment)           => { /* body for one argument */ };
    ($a:fragment, $b:fragment)  => { /* body for two arguments */ };
}
```

The shorthand is exactly a single-arm macro. See [Multiple Arms](#multiple-arms).

### Invocation

```rust
name!(arg1, arg2);
```

### Example

```rust
macro_rules! inc_twice($reg:reg) {
    $reg++;
    $reg++;
}

fn main() {
    inc_twice!(X);
    // Expands to:
    // X++;
    // X++;
}
```

### Key Properties

- **Shorthand or multiple arms**: A macro is either the concise `name(params) { body }` shorthand (one pattern) or a Rust-style multi-arm `name { (pat) => { body }; ... }`. See [Multiple Arms](#multiple-arms).
- **No hygiene**: Like C macros, generated names can collide with names in the calling scope. Programmer responsibility.
- **AST-level expansion**: Macros are expanded after parsing, operating on AST nodes rather than raw tokens.
- **Global scope**: All macros are visible globally after their definition.
- **Definition order required**: A macro must be defined before any invocation.
- **Maximum recursion depth**: 64 levels of nested expansion. Exceeding this is a compile error.

## Fragment Types

Fragment specifiers determine what kind of syntax a parameter can match. R65 supports 6 fragment types.

### `expr` -- Expressions

Matches any valid R65 expression. Expressions are automatically parenthesized during expansion to preserve operator precedence.

```rust
macro_rules! double($val:expr) {
    ($val) + ($val)
}

double!(5)           // Expands to: (5) + (5)
double!(x + 1)       // Expands to: (x + 1) + (x + 1)
```

Expressions are evaluated each time they appear in the body. For side-effect-free expressions only, or bind to a local variable first.

### `ident` -- Identifiers

Matches a single identifier (variable name, function name, type name, etc.):

```rust
macro_rules! declare_counter($name:ident) {
    #[zeropage]
    static mut $name: u8 = 0;
}

declare_counter!(FRAME_COUNT);
// Expands to:
// #[zeropage]
// static mut FRAME_COUNT: u8 = 0;
```

### `literal` -- Literal Values

Matches numeric, boolean, or string literals:

```rust
macro_rules! repeat_byte($count:literal, $value:literal) {
    [$value; $count]
}

repeat_byte!(16, 0xFF)  // Expands to: [0xFF; 16]
```

### `ty` -- Types

Matches type expressions:

```rust
macro_rules! declare_buffer($name:ident, $element:ty, $size:literal) {
    #[ram]
    static mut $name: [$element; $size];
}

declare_buffer!(SPRITE_DATA, u16, 128);
// Expands to:
// #[ram]
// static mut SPRITE_DATA: [u16; 128];
```

### `reg` -- Hardware Registers

Matches hardware register names: `A`, `X`, or `Y`.

```rust
macro_rules! save_and_clear($reg:reg) {
    let saved = $reg;
    $reg = 0;
}

save_and_clear!(X);
// Expands to:
// let saved = X;
// X = 0;
```

### `tt` -- Token Tree

Matches any single token or a balanced group (`(...)`, `[...]`, or `{...}`). Use as a catch-all or for passing code blocks:

```rust
macro_rules! time_it($body:tt) {
    let start = TIMER;
    $body
    let elapsed = TIMER - start;
}

time_it!({ process_frame(); });
// Expands to:
// let start = TIMER;
// { process_frame(); }
// let elapsed = TIMER - start;
```

## Repetition

R65 macros support a single repetition form: `$(...),*` (comma-separated, zero or more).

### Basic Repetition

```rust
macro_rules! sum($($val:expr),*) {
    A = 0;
    $(A = A + $val;)*
}

sum!(1, 2, 3);
// Expands to:
// A = 0;
// A = A + 1;
// A = A + 2;
// A = A + 3;

sum!();
// Expands to:
// A = 0;
// (empty repetition)
```

### Multiple Captures

Multiple parameters can be captured together within a single repetition:

```rust
macro_rules! init_vars($($name:ident = $value:expr),*) {
    $(let mut $name = $value;)*
}

init_vars!(x = 10, y = 20, z = 30);
// Expands to:
// let mut x = 10;
// let mut y = 20;
// let mut z = 30;
```

### Separator Limitation

The separator is always comma. Other separators (`; `, `:`, etc.) and unseparated repetition (`$($x)*`) are not supported:

```rust
// Supported
$($x:expr),*     // Comma-separated

// NOT Supported
$($x:expr);*     // Semicolon-separated
$($x:expr)*      // No separator
```

## Multiple Arms

A macro may define several arms, each with its own pattern and body. At a call site
the compiler picks the **first arm that matches** the arguments, scanning top to bottom.

```rust
macro_rules! use_var {
    ($name:ident)              => { $name = 0; };
    ($name:ident, $v:literal)  => { $name = $v; };
}

fn main() {
    use_var!(score);       // arm 1 -> score = 0;
    use_var!(score, 5);    // arm 2 -> score = 5;
}
```

Arms are separated by `;`; the semicolon after the last arm is optional. Each arm body
is wrapped in `{ }` after the `=>`, and each arm may use its own fragment types and
`$(...),*` repetition.

### How an Arm Is Selected

An arm matches when **both** hold:

1. **Argument count** fits the arm's parameters (exact for fixed arms; "at least the
   leading count" for an arm ending in `$(...),*`).
2. **Fragment type** of each argument is compatible with the corresponding parameter.
   This lets arms of the *same* arity be distinguished:

   ```rust
   macro_rules! load {
       ($r:reg)     => { A = $r; };   // load!(X)   -> A = X;
       ($v:literal) => { A = $v; };   // load!(42)  -> A = 42;
       ($n:ident)   => { A = $n; };   // load!(foo) -> A = foo;
   }
   ```

   Classification follows the lexer: `reg` matches a hardware register, `literal` a
   single integer/string/char/boolean literal, `ident` a non-register identifier, `ty`
   a type, and `expr`/`tt` anything.

Because the first compatible arm wins, **order specific arms before catch-all arms**.
An `($x:expr)` or `($x:tt)` arm matches any single argument, so place it last:

```rust
macro_rules! describe {
    ($r:reg)  => { /* register case */ };
    ($x:expr) => { /* everything else */ };   // catch-all goes last
}
```

If no arm matches, compilation fails with an error listing every arm's signature.

### Relationship to the Shorthand

The shorthand `macro_rules! name(params) { body }` is exactly a single-arm macro. Because
fragment types are only consulted to choose *between* arms, a single-arm macro matches on
argument count alone (its fragment types are documentation only). This keeps every
existing single-arm macro behaving exactly as before.

## Expression Parenthesization

When `$e:expr` parameters are substituted into the expansion body, they are automatically wrapped in parentheses. This prevents operator precedence issues:

```rust
macro_rules! double($e:expr) {
    $e * 2
}

double!(1 + 2)
// Without parenthesization: 1 + 2 * 2 = 5 (wrong)
// With parenthesization:    (1 + 2) * 2 = 6 (correct)
```

## Built-in Macros

### stringify!

Converts arguments into a string literal at compile time:

```rust
stringify!(Hello)               // "Hello"
stringify!(Hello World 123)     // "Hello World 123"
stringify!()                    // ""
```

Arguments are treated as literal tokens, not evaluated. Special characters (quotes, backslashes) are escaped automatically.

`stringify!` is useful with `asm!` format strings for generating register-specific instructions in macros:

```rust
macro_rules! push($reg:reg) {
    asm!("PH{R}", R=stringify!($reg));
}

push!(A);  // Generates: PHA
push!(X);  // Generates: PHX
```

### compile_error!

Causes compilation to fail with a custom error message:

```rust
compile_error!("This platform is not supported");
```

Useful in macros for guarding against invalid usage.

### const_assert!

Evaluates a constant expression at compile time and emits an error if it evaluates to false:

```rust
const_assert!(BUFFER_SIZE <= 256);
const_assert!(TILE_WIDTH * TILE_HEIGHT == 64);
```

Both the expression and its operands must be compile-time constants.

## Inline Assembly

### asm! Syntax

The `asm!` statement embeds raw 65816 assembly instructions:

```rust
asm!("WAI");                    // Single instruction
asm!("PHP", "WAI");             // Multiple instructions
asm!("NOP", "NOP", "NOP");     // Three NOPs
```

### Format String Substitution

Named parameters allow compile-time construction of assembly instructions:

```rust
asm!("LD{REG} #{VAL}", REG="A", VAL=42);  // Generates: LDA #42
asm!("ST{REG} $2100", REG="X");            // Generates: STX $2100
```

- Placeholders use `{name}` syntax.
- Values must be string literals or integer literals (not identifiers or expressions).
- Named arguments apply to all instructions in the `asm!` invocation.

### Register Clobbering

The compiler treats every `asm!` invocation as a black box that may modify all registers. If you need register values to survive across inline assembly, save and restore them explicitly.

### Combining with stringify! in Macros

```rust
macro_rules! push($reg:reg) {
    asm!("PH{R}", R=stringify!($reg));
}

macro_rules! pull($reg:reg) {
    asm!("PL{R}", R=stringify!($reg));
}

push!(A);  // PHA
push!(X);  // PHX
pull!(A);  // PLA
```

Use `stringify!($param)` rather than `$param` directly, because format arguments only accept literals.

## File Inclusion

### include! Syntax

```rust
include!("hardware.r65")
```

`include!` performs textual inclusion at the point of invocation, analogous to C's `#include`. The path is relative to the file containing the `include!` directive.

### Rules

- Included files share the global namespace. There is no module system.
- Circular inclusions are a compile error.
- The included file is parsed and expanded as if its contents were written inline at the inclusion point.

## Method Macros

Macros can be defined inside `impl` blocks for structs, creating **method macros** that are scoped to that struct type. The macro body can use `self` to refer to the receiver:

```rust
impl Console {
    macro_rules! print($fmt:literal, $($args:expr),*) {
        format!(__buf, $fmt, $($args),*);
        self.print(&__buf as far *u8);
    }
}
```

Invoke with dot notation and `!`:

```rust
my_console.print!("Score: {u16}", score);
```

When the macro is expanded, every `self` token in the body is replaced with the receiver expression (here, `my_console`). The result is then expanded as a normal macro. Method macros are only callable on instances of the struct they are defined on.

See [Structs — Method Macros](structs.md#method-macros) for more examples.

## Scope and Visibility

### Global Scope

All macros are globally visible after their definition point. There are no visibility modifiers:

```rust
// In header.r65
macro_rules! common($x:expr) { $x + 1 }

// In main.r65
include!("header.r65")
let y = common!(5);  // Works
```

### Definition Order

Macros must be defined before use:

```rust
foo!(5);  // ERROR: macro 'foo' not defined

macro_rules! foo($x:expr) { $x }

foo!(5);  // OK
```

### Shadowing

Later definitions shadow earlier ones:

```rust
macro_rules! greet() { "Hello" }
let a = greet!();  // "Hello"

macro_rules! greet() { "Hi" }
let b = greet!();  // "Hi"
```

## Hygiene (None)

R65 macros have no hygiene. Names generated by macros can collide with names in the calling scope:

```rust
macro_rules! with_temp($body:tt) {
    let temp = 0;
    $body
}

fn example() {
    let temp = 42;
    with_temp!({ temp = temp + 1; });  // Collision: which 'temp'?
}
```

### Mitigation Strategies

1. Use unlikely prefixed names: `let __macro_temp = 0;`
2. Use block scope to isolate names: `{ let temp = 0; $body }`
3. Accept the name as a parameter: `$temp_name:ident`

## Limitations

| Feature | Rust | R65 |
|---------|------|-----|
| Multiple patterns | Yes (`=>` arms) | Yes (`=>` arms), or single-pattern shorthand |
| Arm selection | Full pattern matching | Argument count + fragment type |
| Repetition quantifiers | `*`, `+`, `?` | `*` only |
| Repetition separators | Any token | Comma only |
| Fragment types | 10+ | 6 |
| Hygiene | Yes | No |
| Recursion limit | Configurable | 64 levels |
| Procedural macros | Yes | No |
| `$crate` | Yes | No (no module system) |
| Identifier concatenation | No (C has `##`) | No |

## Common Patterns

### Hardware Register Setup

```rust
macro_rules! setup_dma($channel:literal, $src:expr, $dst:expr, $size:expr) {
    DMASRC[$channel] = $src;
    DMADST[$channel] = $dst;
    DMASIZE[$channel] = $size;
    DMACTL[$channel] = 0x01;
}

setup_dma!(0, SPRITE_DATA, 0x0000, 512);
```

### Assert (Debug)

```rust
macro_rules! assert($cond:expr) {
    if !($cond) {
        asm!("BRK");  // Trigger debugger
    }
}

assert!(health <= 100);
```

### Variadic Debug Output

```rust
#[hw(0x21FC)]
static mut DEBUG_PORT: u8;

macro_rules! debug_bytes($($val:expr),*) {
    $(DEBUG_PORT = $val;)*
}

debug_bytes!(0xDE, 0xAD, 0xBE, 0xEF);
```

### Loop Unrolling

```rust
macro_rules! unroll4($body:tt) {
    $body
    $body
    $body
    $body
}

unroll4!({ A = *PTR; PTR++; *DST = A; DST++; });
```

### Register Preservation Wrapper

```rust
macro_rules! preserve_a($body:tt) {
    {
        let __saved_a = A;
        $body
        A = __saved_a;
    }
}

preserve_a!({
    A = 0;
    call_external();
});
// A is restored after the block
```

---
sidebar_position: 3
title: Expressions
description: R65 operators, precedence, type casts, and expression evaluation.
---

# Expressions

R65 provides operators and functions that clearly distinguish between hardware-supported operations (fast) and software-implemented operations (slow).

- **Operators** (`+`, `-`, `*`, `/`, `<<`, `>>`, etc.) map directly to 65816 instructions or short instruction sequences. Cost: 2--10 cycles.
- **Functions** (`mul()`, `div()`, `mod()`, `shl()`, `shr()`) are software subroutines for operations the hardware cannot perform in a fixed number of instructions. Cost: 20--200+ cycles.

All arithmetic is **unchecked**. Overflow wraps, underflow wraps, and division by zero is undefined behavior. There are no runtime checks.

---

## Operator Summary

| Category | Operators | Restrictions | Cycles |
|---|---|---|---|
| Arithmetic | `+`, `-` | None | 2--4 |
| Multiply | `*` | Right operand must be constant 1, 2, 4, or 8 | 2--6 |
| Divide | `/` | Right operand must be constant 1, 2, 4, or 8 | 2--6 |
| Left shift | `<<` | Right operand must be a compile-time constant | 2 per bit |
| Right shift | `>>` | Right operand must be a compile-time constant | 2 per bit |
| Bitwise | `&`, `\|`, `^`, `~` | None | 2--4 |
| Comparison | `==`, `!=`, `<`, `>`, `<=`, `>=` | None | 4--6 (unsigned), 8--15 (signed) |
| Logical | `&&`, `\|\|`, `!` | Operands must be `bool` | 4--8 |
| Unary minus | `-` (prefix) | None | 4--6 |
| Bitwise NOT | `~` | None | 2--4 |
| Compound assign | `+=`, `-=`, `&=`, `\|=`, `^=`, `<<=`, `>>=` | Inherit base operator restrictions | Same as base |
| Multiply assign | `*=` | Right operand must be constant 1, 2, 4, or 8 | 2--6 |
| Divide assign | `/=` | Right operand must be constant 1, 2, 4, or 8 | 2--6 |
| Increment | `x++` | Postfix only, statement-only | 2--6 |
| Decrement | `x--` | Postfix only, statement-only | 2--6 |
| Type cast | `as` | See [Type Casts](#type-casts) | 0--8 |

---

## Arithmetic

### Addition and Subtraction

`+` and `-` have no restrictions. They accept any integer operands and wrap on overflow.

```rust
let sum: u8 = a + b;       // CLC; ADC (2-4 cycles)
let diff: u8 = a - b;      // SEC; SBC (2-4 cycles)

// Overflow wraps silently
let x: u8 = 255 + 1;       // result: 0
let y: u8 = 0 - 1;         // result: 255
```

The compiler optimizes `a + 1` and `a - 1` to `INC` / `DEC` instructions when possible.

### Restricted Multiply

The `*` operator only accepts the constants **1, 2, 4, or 8** as the right operand. The compiler translates these to shift instructions.

```rust
let x: u8 = a * 2;     // ASL           (2 cycles)
let y: u8 = a * 4;     // ASL; ASL      (4 cycles)
let z: u8 = a * 8;     // ASL; ASL; ASL (6 cycles)

let w: u8 = a * 3;     // COMPILE ERROR: use mul(a, 3)
let v: u8 = a * b;     // COMPILE ERROR: use mul(a, b)
```

For general multiplication, use the `mul()` function.

### Restricted Divide

The `/` operator only accepts the constants **1, 2, 4, or 8** as the right operand. The compiler translates these to logical right shifts (`LSR`).

```rust
let x: u8 = a / 2;     // LSR           (2 cycles)
let y: u8 = a / 4;     // LSR; LSR      (4 cycles)
let z: u8 = a / 8;     // LSR; LSR; LSR (6 cycles)

let w: u8 = a / 3;     // COMPILE ERROR: use div(a, 3)
let v: u8 = a / b;     // COMPILE ERROR: use div(a, b)
```

Both signed and unsigned division use logical right shift. Arithmetic right shift (sign-preserving) is not currently implemented for the `/` operator.

For general division, use the `div()` function.

:::note
The `%` (modulo) operator is parsed but **not supported** at code generation. Use the `mod()` function instead. For power-of-2 modulo, prefer bitwise AND: `a & 0xFF` is equivalent to `mod(a, 256)`.
:::

---

## Shift Operators

### Left Shift and Right Shift

`<<` and `>>` require the shift amount to be a **compile-time constant**. Each bit of shift compiles to one `ASL` (left) or `LSR` (right) instruction.

```rust
let x: u8 = a << 3;    // ASL; ASL; ASL (6 cycles)
let y: u8 = a >> 2;    // LSR; LSR      (4 cycles)

let z: u8 = a << n;    // COMPILE ERROR: use shl(a, n)
let w: u8 = a >> n;    // COMPILE ERROR: use shr(a, n)
```

`>>` always performs a **logical shift** (fills with zeros), regardless of whether the operand is signed or unsigned. Shifting by an amount greater than or equal to the bit width is undefined behavior.

For variable shift amounts, use the `shl()` and `shr()` functions.

---

## Bitwise Operators

`&`, `|`, `^`, and `~` have no restrictions and map directly to 65816 instructions (`AND`, `ORA`, `EOR`).

```rust
let masked: u8 = value & 0x0F;     // AND: mask low nibble
let combined: u8 = high | low;     // ORA: combine bit fields
let toggled: u8 = flags ^ 0x80;    // EOR: toggle bit 7
let inverted: u8 = ~value;         // EOR #$FF: flip all bits
```

**Common idioms:**

```rust
let low_nibble = value & 0x0F;     // Extract low 4 bits
let is_set = flags & 0x80;         // Test bit 7
let wrapped = index & 0xFF;        // Modulo 256 (faster than mod())
let aligned = addr & 0xFFF0;       // Align to 16-byte boundary
flags = flags | 0x01;              // Set bit 0
flags = flags & ~0x01;             // Clear bit 0
flags = flags ^ 0x80;              // Toggle bit 7
```

---

## Comparison Operators

All six comparison operators produce `bool` results. Both operands must be the same type.

| Operator | Meaning | Unsigned Cycles | Signed Cycles |
|---|---|---|---|
| `==` | Equal | 4--6 | 4--6 |
| `!=` | Not equal | 4--6 | 4--6 |
| `<` | Less than | 4--6 | 8--15 |
| `>` | Greater than | 4--6 | 8--15 |
| `<=` | Less than or equal | 4--6 | 8--15 |
| `>=` | Greater than or equal | 4--6 | 8--15 |

Unsigned comparisons use `CMP` followed by a branch on carry (`BCC`/`BCS`). Signed comparisons require additional logic to handle the overflow flag, which makes them significantly more expensive.

```rust
if x == 0 { }          // CMP #0; BNE skip
if x < 100 { }         // CMP #100; BCS skip (unsigned)
if (x: i8) < 0 { }     // Signed comparison (more complex codegen)
```

---

## Logical Operators

`&&`, `||`, and `!` require `bool` operands and produce `bool` results.

`&&` and `||` use **short-circuit evaluation**: the right operand is not evaluated if the left operand determines the result.

```rust
if a > 0 && b < 100 {
    // b < 100 is only evaluated if a > 0 is true
}

if ready || timeout {
    // timeout is only evaluated if ready is false
}

let inverted: bool = !flag;    // EOR #$01 (flips bit 0)
```

---

## Unary Operators

### Unary Minus

`-expr` performs two's complement negation. The result type matches the operand type.

```rust
let neg: i8 = -value;
// Compiles to: EOR #$FF; INC A (4-6 cycles)
```

Negating zero produces zero. Negating the minimum signed value (`-128` for `i8`) wraps back to itself.

### Bitwise NOT

`~expr` flips all bits. The result type matches the operand type.

```rust
let inv: u8 = ~value;
// Compiles to: EOR #$FF (2-4 cycles)

let inv16: u16 = ~value16;
// Compiles to: EOR #$FFFF (2-4 cycles)
```

---

## Compound Assignment

All arithmetic and bitwise operators support compound assignment forms. These desugar to `a = a op b` and inherit the restrictions of the base operator.

```rust
a += 5;         // a = a + 5
a -= 1;         // a = a - 1
a &= 0x0F;      // a = a & 0x0F
a |= 0x80;      // a = a | 0x80
a ^= mask;      // a = a ^ mask
a <<= 3;        // a = a << 3 (constant required)
a >>= 1;        // a = a >> 1 (constant required)
a *= 2;         // a = a * 2 (must be 1, 2, 4, or 8)
a /= 4;         // a = a / 4 (must be 1, 2, 4, or 8)

a *= b;         // COMPILE ERROR: variable multiply
a /= b;         // COMPILE ERROR: variable divide
a %= b;         // COMPILE ERROR: % not supported at codegen
```

The compiler generates optimized memory operations where possible:

```rust
A += 1;         // INC A (2 cycles)
COUNTER += 1;   // INC COUNTER (5-6 cycles)
```

---

## Increment and Decrement

`x++` and `x--` are **postfix-only**, **statement-only** operators. They cannot be used inside expressions.

```rust
counter++;      // Desugars to: counter += 1
counter--;      // Desugars to: counter -= 1
```

Hardware registers compile to single-instruction forms:

```rust
X++;    // INX (2 cycles)
Y++;    // INY (2 cycles)
A++;    // INC A (2 cycles)
X--;    // DEX (2 cycles)
Y--;    // DEY (2 cycles)
A--;    // DEC A (2 cycles)
```

These operators work with any lvalue: variables, registers, array elements, and struct fields.

```rust
buffer[i]++;
player.health--;
```

:::note
There is no prefix form (`++x`, `--x`). Since increment and decrement are statement-only and do not return values, the prefix form would be redundant.
:::

---

## String Concatenation

When the `+` operator has a string literal as either operand, it performs **compile-time string concatenation** instead of arithmetic. This only works in static initializers (constant expressions).

```rust
static mut HELLO: [u8; 16] = "Hello, " + "World";     // "Hello, World"
static mut COUNT: [u8; 16] = "Count: " + 42;           // "Count: 42"
static mut ABC: [u8; 16] = "A" + "B" + "C";            // "ABC"
```

String concatenation has zero runtime cost.

---

## Type Casts

The `as` keyword performs explicit type conversions. No implicit conversions occur in R65 (except integer promotion in binary expressions).

### Cast Behavior

| Cast | Behavior | Cost |
|---|---|---|
| `u8 as u16` | Zero-extend (high byte = 0) | 2--4 cycles |
| `i8 as i16` | Sign-extend (high byte = sign bit) | 4--8 cycles |
| `u16 as u8` | Truncate (keep low byte) | 0--2 cycles |
| `u8 as i8` | Reinterpret bits (no codegen) | 0 cycles |
| `i8 as u8` | Reinterpret bits (no codegen) | 0 cycles |
| `bool as u8` | `false` = 0, `true` = 1 | 0 cycles |
| `u8 as bool` | 0 = `false`, non-zero = `true` | 0 cycles |
| `*T as *U` | Pointer reinterpret | 0 cycles |
| `*T as u16` | Pointer to integer | 0 cycles |
| `u16 as *T` | Integer to pointer | 0 cycles |
| `far *T as u16` | Far pointer truncated to 16-bit | 0--2 cycles |
| `Enum as u8` | Enum to underlying integer | 0 cycles |

### Examples

```rust
// Zero-extend: u8 to u16
let wide: u16 = (narrow as u16) + offset;

// Sign-extend: i8 to i16
let signed_wide: i16 = (signed_byte as i16);

// Truncate: u16 to u8
let low_byte: u8 = word as u8;

// Reinterpret: unsigned to signed (no code generated)
let signed: i8 = unsigned_val as i8;

// Pointer cast
let byte_ptr: *u8 = word_ptr as *u8;
let addr: u16 = ptr as u16;

// Enum to integer
let dir_value: u8 = Direction::North as u8;
```

---

## Operator Precedence

Operators are listed from highest precedence (evaluated first) to lowest. Operators at the same precedence level associate left to right, except assignment operators which associate right to left.

| Precedence | Category | Operators |
|---|---|---|
| 1 (highest) | Unary | `-` (negate), `~`, `!` |
| 2 | Multiplicative | `*`, `/` |
| 3 | Additive | `+`, `-` |
| 4 | Shift | `<<`, `>>` |
| 5 | Comparison | `<`, `<=`, `>`, `>=` |
| 6 | Equality | `==`, `!=` |
| 7 | Bitwise AND | `&` |
| 8 | Bitwise XOR | `^` |
| 9 | Bitwise OR | `\|` |
| 10 | Logical AND | `&&` |
| 11 | Logical OR | `\|\|` |
| 12 (lowest) | Assignment | `=`, `+=`, `-=`, `*=`, `/=`, `&=`, `\|=`, `^=`, `<<=`, `>>=` |

Use parentheses to override precedence:

```rust
let x = (a + b) * 2;       // Addition first, then multiply
let y = a & (b | c);       // OR first, then AND
let z = (flags & 0x80) != 0;  // Mask first, then compare
```

Function calls (`mul()`, `div()`, etc.) have higher precedence than all operators, as with any function call expression.

---

## Software Functions for Expensive Operations

When an operation cannot be expressed with the restricted operators, use the corresponding built-in function.

### Summary

| Function | Operation | Cost |
|---|---|---|
| `mul(a, b)` | General multiplication | 20--100+ cycles |
| `div(a, b)` | General division | 50--200+ cycles |
| `mod(a, b)` | Remainder after division | 50--200+ cycles |
| `shl(a, n)` | Variable left shift | ~8 + 6n cycles |
| `shr(a, n)` | Variable right shift | ~8 + 6n cycles |

All functions require both operands to be the same type (except the shift amount for `shl`/`shr`, which is `u8`).

### mul()

General-purpose multiplication. Both operands must be the same integer type. The result is truncated to the operand size.

```rust
let area: u8 = mul(width, height);
let offset: u16 = mul(y as u16, 320 as u16);
```

With `--cfg snes`, 8-bit multiplication uses the SNES hardware multiplier for faster results.

### div()

General-purpose division. Division by zero is undefined behavior.

```rust
let avg: u8 = div(sum, count);
let tiles: u8 = div(pixels, 7);
```

### mod()

Returns the remainder after division. Division by zero is undefined behavior.

```rust
let remainder: u8 = mod(distance, tile_size);
let wrapped: u16 = mod(index, buffer_size);

// Prefer bitwise AND for power-of-2 modulo:
let wrapped: u8 = index & 0xFF;    // Same as mod(index, 256), much faster
```

### shl() and shr()

Variable shift amounts. The shift amount is `u8` and can be a runtime value.

```rust
let shifted: u8 = shl(value, bit_pos);     // Variable left shift
let extracted: u8 = shr(flags, offset);     // Variable right shift
```

For signed operands, `shr()` performs an arithmetic right shift (preserves the sign bit). For unsigned operands, it performs a logical right shift (fills with zeros).

:::tip
If the shift amount is a compile-time constant, prefer the `<<` and `>>` operators. They compile to inline instructions and avoid the subroutine call overhead.
:::

---

## Fast vs. Slow: Choosing the Right Operation

```rust
// FAST: operator compiles to 1-3 instructions
let doubled: u8 = value * 2;           // ASL (2 cycles)
let halved: u8 = value / 2;            // LSR (2 cycles)
let shifted: u8 = value << 5;          // 5x ASL (10 cycles)
let masked: u8 = value & 0x1F;         // AND #$1F (2-4 cycles)

// SLOW: function compiles to a subroutine call
let product: u8 = mul(value, 7);       // JSR __mul_u8 (20-100+ cycles)
let quotient: u8 = div(value, 3);      // JSR __div_u8 (50-200+ cycles)
let remainder: u8 = mod(value, 5);     // JSR __mod_u8 (50-200+ cycles)
let shifted: u8 = shl(value, amount);  // JSR __shl_u8 (~8 + 6*amount cycles)
```

**Guidelines:**

1. Use operators whenever possible -- they are always faster than function equivalents.
2. Use `a * 2` / `a * 4` / `a * 8` instead of `mul(a, 2)` / `mul(a, 4)` / `mul(a, 8)`.
3. Use `a & mask` instead of `mod(a, power_of_2)` for power-of-2 modulo.
4. Avoid `div()` and `mod()` in tight loops. Pre-compute values or use lookup tables.
5. Favor 8-bit operations over 16-bit when possible -- they are faster in m8 mode.
6. Use `a += 1` or `a++` instead of `a = a + 1` -- the compiler emits `INC`/`INX`/`INY`.

---

## Overflow and Wrapping

All operations wrap silently. There are no overflow traps, checked arithmetic, or saturating operations.

```rust
let x: u8 = 255 + 1;       // 0 (wraps)
let y: u8 = 0 - 1;         // 255 (wraps)
let z: i8 = 127 + 1;       // -128 (wraps)
let w: u8 = mul(200, 2);   // 144 (400 truncated to u8)
```

Division by zero is undefined behavior at runtime. Constant division by zero is caught at compile time.

```rust
let x: u8 = div(10, 0);    // Undefined behavior (no runtime check)
let y: u8 = 10 / 0;        // Compile error (constant expression)
```

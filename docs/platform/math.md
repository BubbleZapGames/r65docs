---
sidebar_position: 5
title: Math Library
description: Standard library math functions and 32-bit integer types for the 65816.
---

# Math Library

R65 provides a standard math library for operations that exceed the 65816's native capabilities: scalar math functions (`math.r65`), an unsigned 32-bit integer type (`U32.r65`), a signed 32-bit integer type (`I32.r65`), a 32-bit floating-point type (`F32.r65`), and two fixed-point types — signed `Q10.r65` (10.6) and unsigned `Q8.r65` (8.8).

```rust
include!("lib/sneslib.r65")  // Required: hardware register definitions
include!("lib/math.r65")     // Scalar math functions
include!("lib/U32.r65")      // Unsigned 32-bit integer
include!("lib/I32.r65")      // Signed 32-bit integer
include!("lib/F32.r65")      // 32-bit floating point
include!("lib/Q10.r65")      // Signed 10.6 fixed point
include!("lib/Q8.r65")       // Unsigned 8.8 fixed point
```

:::note
`r65x init` copies only `sneslib.r65`, `math.r65`, and `65816.r65` into a new project's `src/lib/`. Copy the other files across from `stdlib/` yourself, or add `stdlib/` to the include path with `r65c -I path/to/stdlib`.
:::

## Scalar Math Functions

`math.r65` provides multiplication, division, modulo, and variable shift operations. All are `far fn`.

On SNES targets (`#[cfg(snes)]`) multiplication and division use the hardware math units. Only `mul8`, `mul16`, and `div8` have software fallbacks; `div16`, `mod16`, and `mod8` are **SNES-only**, and the non-SNES build offers `mod_shift` in their place.

### Multiplication

| Function | Signature | Description |
|----------|-----------|-------------|
| `mul8` | `(multA @ A: u8, multB @ B: u8) -> u16` | 8x8 unsigned multiply, 16-bit product |
| `mul16` | `(multA @ A: u16, multB: u16) -> u16` | 16x16 unsigned multiply, low 16 bits of the product |

On SNES, these use the hardware multiplication unit (`WRMPYA`/`WRMPYB`) and complete in ~8 cycles. Software fallbacks use shift-and-add (~150-300 cycles).

### Division and Modulo

| Function | Signature | Description |
|----------|-----------|-------------|
| `div16` | `(dividend @ A: u16, divisor: u8) -> u16` | 16-bit / 8-bit unsigned division. **SNES only** |
| `div8` | `(dividend @ A: u8, divisor @ X: u16) -> u8` | 8-bit / 8-bit unsigned division |
| `mod16` | `(dividend @ A: u16, divisor: u8) -> u16` | 16-bit % 8-bit unsigned modulo. **SNES only** |
| `mod8` | `(dividend @ A: u8, divisor @ X: u16) -> u8` | 8-bit % 8-bit unsigned modulo. **SNES only** |
| `mod_shift` | `(dividend @ A: u8, divisor: u8) -> u8` | 8-bit modulo by shift-and-subtract. **Non-SNES only** |

On SNES, these use the hardware division unit (`WRDIVL`/`WRDIVH`/`WRDIVB`) and take ~30 cycles. Only `div8` has a software fallback (restoring division, ~200-400 cycles); a non-SNES build that needs a modulo uses `mod_shift`.

### Variable Shifts

| Function | Signature | Description |
|----------|-----------|-------------|
| `shl8` | `(value @ A: u8, amount @ X: u16) -> u8` | 8-bit left shift by variable amount |
| `shr8` | `(value @ A: u8, amount @ X: u16) -> u8` | 8-bit logical right shift |
| `shri8` | `(value @ A: u8, amount @ X: u16) -> u8` | 8-bit arithmetic right shift (sign-preserving) |
| `shl16` | `(value @ A: u16, amount @ X: u16) -> u16` | 16-bit left shift by variable amount |
| `shr16` | `(value @ A: u16, amount @ X: u16) -> u16` | 16-bit logical right shift |

These are software loop implementations. Cost scales linearly with the shift amount.

## U32 — Unsigned 32-bit Integer

A 4-byte packed struct stored as two 16-bit words in little-endian order:

```rust
struct U32 {
    lo: u16,    // Offset 0: Low 16 bits
    hi: u16     // Offset 2: High 16 bits
}
```

All methods take a `far *self` pointer (the `far` is on each method's `self`, not the `impl` block). Operations modify the value in place.

### Literal Initialization

The `U32!` macro initializes a U32 from a compile-time constant, automatically splitting it into `lo`/`hi` halves:

```rust
#[ram] static mut SCORE: U32 = U32!(100000);   // lo=0x86A0, hi=0x0001
#[ram] static mut MAX: U32 = U32!(0xFFFFFFFF);  // lo=0xFFFF, hi=0xFFFF
#[ram] static mut ZERO: U32 = U32!(0);          // lo=0x0000, hi=0x0000
```

This is equivalent to writing the struct literal manually:

```rust
#[ram] static mut SCORE: U32 = U32 { lo: 0x86A0, hi: 0x0001 };
```

### Conversion

| Method | Signature | Description |
|--------|-----------|-------------|
| `from_u16` | `(far *self, value @ X: u16)` | Initialize from u16 (zero-extends high word) |
| `to_u16` | `(far *self) -> u16` | Truncate to u16 (returns low word only) |
| `copy` | `(far *self, src: far *U32)` | Copy value from another U32 |

### Arithmetic

| Method | Signature | Description |
|--------|-----------|-------------|
| `+=` | `(far *self, other: far *U32)` | `self += other` with overflow wrapping (`impl AddAssign`) |
| `-=` | `(far *self, other: far *U32)` | `self -= other` with underflow wrapping (`impl SubAssign`) |
| `*=` | `(far *self, other: far *U32)` | `self *= other` (32x32, low 32 bits kept) (`impl MulAssign`) |
| `/=` | `(far *self, other: far *U32)` | `self /= other` (yields `0xFFFFFFFF` on divide by zero) (`impl DivAssign`) |
| `mod` | `(far *self, other: far *U32)` | `self %= other` (unchanged on divide by zero) |
| `add_u16` | `(far *self, value @ A: u16)` | `self += value` (u16 operand, zero-extends) |
| `sub_u16` | `(far *self, value @ A: u16)` | `self -= value` (u16 operand, zero-extends) |
| `mul_u16` | `(far *self, value @ A: u16)` | `self *= value` (u16 operand, low 32 bits kept) |
| `div_u16` | `(far *self, value @ A: u16)` | `self /= value` (u16 operand; returns `0xFFFFFFFF` on divide by zero) |
| `mod_u16` | `(far *self, value @ A: u16)` | `self %= value` (u16 operand, zero-extends; unchanged on divide by zero) |

Whole-`U32` arithmetic is reached through the compound-assignment **operators**, not through named methods — `U32` implements `AddAssign`, `SubAssign`, `MulAssign`, and `DivAssign`. `mod` is the one named method, because there is no `%=` operator trait.

```rust
SCORE += BONUS;      // impl AddAssign
SCORE /= DIVISOR;    // impl DivAssign
SCORE.mod(&MODULUS);
```

### Comparison

| Method | Signature | Description |
|--------|-----------|-------------|
| `cmp` | `(far *self, other: far *U32) -> i8` | Returns `1` if self > other, `0` if equal, `-1` if self < other |

### Bitwise Shifts

| Method | Signature | Description |
|--------|-----------|-------------|
| `shl` | `(far *self, count @ X: u16)` | Shift left by n bits in place |
| `shr` | `(far *self, count @ X: u16)` | Logical shift right by n bits in place |

### SNES Hardware Division

Available only with `#[cfg(snes)]`. Uses the hardware division unit for faster small-divisor operations.

| Method | Signature | Description |
|--------|-----------|-------------|
| `div_u8` | `(far *self, divisor @ X: u16) -> u8` | Divide by 8-bit value, returns remainder |
| `mod_u8` | `(far *self, divisor @ X: u16)` | Modulo by 8-bit value |

## I32 — Signed 32-bit Integer

Same memory layout as U32, using two's complement representation:

```rust
struct I32 {
    lo: u16,    // Offset 0: Low 16 bits
    hi: u16     // Offset 2: High 16 bits (bit 15 = sign bit)
}
```

Range: `-2,147,483,648` to `2,147,483,647`.

### Literal Initialization

The `I32!` macro initializes an I32 from a compile-time constant, handling two's complement automatically:

```rust
#[ram] static mut OFFSET: I32 = I32!(-42);      // lo=0xFFD6, hi=0xFFFF
#[ram] static mut GRAVITY: I32 = I32!(-256);     // lo=0xFF00, hi=0xFFFF
#[ram] static mut POSITIVE: I32 = I32!(1000);    // lo=0x03E8, hi=0x0000
```

### Conversion

| Method | Signature | Description |
|--------|-----------|-------------|
| `from_i16` | `(far *self, value: u16)` | Initialize from i16 (sign-extends high word) |
| `from_u16` | `(far *self, value: u16)` | Initialize from u16 (zero-extends, positive values only) |
| `to_i16` | `(far *self) -> i16` | Truncate to i16 (returns low word only) |
| `copy` | `(far *self, src: far *I32)` | Copy value from another I32 |

### Sign Operations

| Method | Signature | Description |
|--------|-----------|-------------|
| `is_negative` | `(far *self) -> bool` | Returns `true` if sign bit is set |
| `neg` | `(far *self)` | Negate in place (two's complement: `~self + 1`) |
| `abs` | `(far *self)` | Absolute value: negates if negative |

### Arithmetic

| Method | Signature | Description |
|--------|-----------|-------------|
| `+=` | `(far *self, other: far *I32)` | `self += other` (two's complement addition) (`impl AddAssign`) |
| `-=` | `(far *self, other: far *I32)` | `self -= other` (two's complement subtraction) (`impl SubAssign`) |
| `*=` | `(far *self, other: far *I32)` | `self *= other` (signed, low 32 bits kept) (`impl MulAssign`) |
| `/=` | `(far *self, other: far *I32)` | `self /= other` (rounds toward zero; yields `MIN_I32` on divide by zero) (`impl DivAssign`) |
| `mod` | `(far *self, other: far *I32)` | `self %= other` (remainder sign matches dividend; unchanged on divide by zero) |
| `add_i16` | `(far *self, value @ A: u16)` | `self += value` (i16 operand, sign-extends) |
| `sub_i16` | `(far *self, value @ A: u16)` | `self -= value` (i16 operand, sign-extends) |
| `mul_i16` | `(far *self, value @ A: u16)` | `self *= value` (i16 operand, low 32 bits kept) |
| `div_i16` | `(far *self, value @ A: u16)` | `self /= value` (i16 operand; returns `MIN_I32` on divide by zero) |
| `mod_i16` | `(far *self, value @ A: u16)` | `self %= value` (i16 operand, sign-extends; unchanged on divide by zero) |

As with `U32`, whole-`I32` arithmetic goes through `+=`, `-=`, `*=`, and `/=`; `mod` is the one named method.

### Comparison

| Method | Signature | Description |
|--------|-----------|-------------|
| `cmp` | `(far *self, other: far *I32) -> i8` | Signed comparison: `1` if self > other, `0` if equal, `-1` if self < other |

### Bitwise Shifts

| Method | Signature | Description |
|--------|-----------|-------------|
| `shl` | `(far *self, count @ X: u16)` | Shift left by n bits in place |
| `sar` | `(far *self, count @ X: u16)` | Arithmetic shift right (preserves sign bit) |

### SNES Hardware Division

Available only with `#[cfg(snes)]`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `div_i8` | `(far *self, divisor @ X: u16) -> i8` | Divide by signed 8-bit value, returns remainder |
| `mod_i8` | `(far *self, divisor @ X: u16)` | Modulo by signed 8-bit value |

## F32 — 32-bit Floating Point

A 32-bit floating-point type using the Woz/Rankin format (Dr. Dobb's Journal,
1976) adapted for the 65816. Precision is ~6–7 significant decimal digits with a
range of roughly 10<sup>-38</sup> to 10<sup>38</sup>.

```rust
struct F32 {
    mant_lo: u16,   // Offset 0: mantissa low 16 bits
    exp_hi: u16     // Offset 2: low byte = mantissa high (sign + 7 bits),
                    //           high byte = exponent (excess-128 biased)
}
```

Internally the value is a 1-byte excess-128 exponent plus a 24-bit two's
complement mantissa; zero is represented by an exponent byte of `0`.

### Values and Constants

There is no decimal-literal macro for `F32`. You obtain values three ways:

```rust
// 1. At runtime, from a signed integer:
V.from_i16(7 as i16);                                  // V = 7.0

// 2. From a pre-defined constant (used as an operand):
RADIUS *= F32_PI;                                      // multiply by 3.14159

// 3. From raw components, for a static initializer or custom constant:
#[ram] static mut HALF: F32 = F32_RAW!(0x80, 0x40, 0x0000);   // 0.5
```

`F32_RAW!(exp, mant_hi, mant_lo)` builds a value from its encoded bytes. The
library predefines these constants:

| Constant | Value | | Constant | Value |
|----------|-------|---|----------|-------|
| `F32_ZERO` | `0.0` | | `F32_TEN` | `10.0` |
| `F32_ONE` | `1.0` | | `F32_HUNDRED` | `100.0` |
| `F32_NEG_ONE` | `-1.0` | | `F32_PI` | `3.14159` |
| `F32_HALF` | `0.5` | | `F32_E` | `2.71828` |
| `F32_TWO` | `2.0` | | &nbsp; | &nbsp; |

:::note
A constant is a `const F32` — usable as an **operand** (`x += F32_ONE`) but not
as a whole value. A `static mut` initializer must therefore use `F32_RAW!`, not
a named constant.
:::

### Conversion

| Method | Signature | Description |
|--------|-----------|-------------|
| `from_i16` | `(far *self, value: u16)` | Set from a signed 16-bit integer |
| `to_i16` | `(far *self) -> i16` | Truncate toward zero to a signed 16-bit integer |
| `copy` | `(far *self, src: far *F32)` | Copy value from another F32 |

### Sign and Tests

| Method | Signature | Description |
|--------|-----------|-------------|
| `is_zero` | `(far *self) -> bool` | Returns `true` if the value is zero |
| `is_negative` | `(far *self) -> bool` | Returns `true` if the sign bit is set |
| `neg` | `(far *self)` | Negate in place |
| `abs` | `(far *self)` | Absolute value in place |

### Arithmetic and Comparison

`F32` exposes arithmetic through the [operators](#operators) — there are no named
`add`/`sub` methods. Both operands must be `F32` (a value, a static, or a
constant):

```rust
V += W;            // add
V -= W;            // subtract
V *= W;            // multiply
V /= F32_TWO;      // divide (any operand — no power-of-2 restriction)

if V < W { ... }   // also ==  !=  <=  >  >=
```

For an explicit three-way result, `cmp(far *self, other: far *F32) -> i8` returns
the sign of `self - other` (negative, `0`, or positive).

## Q10 — Signed 10.6 Fixed Point

`Q10.r65` is a 16-bit signed fixed-point type: 10 integer bits (−512 to +511) and 6 fractional bits, so a precision of 1/64.

`Q10` is a [newtype](../language/new_types.md) over `i16` — a distinct type at compile time, an ordinary 16-bit value at runtime. The generated code is identical to using a bare `i16`, and it passes and returns **by value** in a register.

```rust
struct Q10(i16);
```

The distinction is one-directional. A `Q10` will not pass where an `i16` is wanted and will not mix with another newtype, so a scaled value cannot silently be consumed as a raw count. An `i16` flowing the other way, *into* a `Q10`, is accepted — wrap deliberately at the point a raw number becomes a fixed-point one.

### Constants

| Constant | Value | Meaning |
|----------|-------|---------|
| `Q10_ONE` | `64` | 1.0 |
| `Q10_HALF` | `32` | 0.5 |
| `Q10_1_64TH` | `1` | The smallest representable step |
| `Q10_FRAC_MASK` | `0x3F` (`i16`) | Selects the fraction bits. A plain `i16`: it is a mask, not a value |

### Associated Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `Q10::from_int` | `(n: i16) -> Q10` | Whole number to fixed point |
| `Q10::from` | `(n: i16, f: u8) -> Q10` | Integer part plus a 0–63 fraction |
| `Q10::lerp` | `(a: Q10, b: Q10, t: Q10) -> Q10` | Linear interpolation, `t` in 0.0–1.0. **SNES only** |

### Methods

All take `self` by value.

| Method | Signature | Description |
|--------|-----------|-------------|
| `to_int` | `(self) -> i16` | Integer part, rounding toward negative infinity |
| `to_frac` | `(self) -> i16` | Fraction bits, 0–63 |
| `round` | `(self) -> i16` | Nearest whole number, ties up |
| `mul` | `(self, other: Q10) -> Q10` | Scaling multiply, `(a * b) >> 6`. **SNES only** |
| `div` | `(self, other: Q10) -> Q10` | Scaling divide. Saturates to ±511.984 on divide by zero |
| `div_u8` | `(self, d: u8) -> Q10` | Divide by a small whole number. **SNES only** |
| `abs` | `(self) -> Q10` | Absolute value |
| `to_string` | `(self, buf: far *u8) -> u16` | Decimal text into `buf`; returns the byte count |

### The `clamp!` Macro

`Q10` also defines a method macro:

```rust
VELOCITY = VELOCITY.clamp!(Q10::from_int(-4), Q10::from_int(4));
```

### Why `mul` and `div` Are Methods

`Q10` inherits `+`, `-`, and the comparisons from its `i16` payload, and those are correct as-is. Multiply and divide are **not**: a raw `a * b` lands 64× too high, and a raw `a / b` cancels the scale entirely.

They stay named methods because a newtype cannot override an inherited operator. An `impl MulAssign for Q10` compiles but never dispatches — `a *= b` still lowers to the payload's multiply.

```rust
#[ram]
static mut VELOCITY: Q10;

fn step() {
    let player_x: Q10 = Q10::from_int(100);   // 100.0
    VELOCITY = Q10::from(0, 32);              // 0.5 (32/64)

    let next: Q10 = player_x + VELOCITY;      // + and < inherited from i16
    let scaled: Q10 = next.mul(VELOCITY);     // scaling multiply
    let whole: i16 = next.round();
}
```

## Q8 — Unsigned 8.8 Fixed Point

`Q8.r65` is a 16-bit **unsigned** fixed-point type: 8 integer bits (0–255) and 8 fractional bits, so a precision of 1/256. Like `Q10` it is a newtype, here over `u16`.

```rust
struct Q8(u16);
```

| Constant | Value | Meaning |
|----------|-------|---------|
| `Q8_ONE` | `256` | 1.0 |
| `Q8_HALF` | `128` | 0.5 |
| `Q8_1_256TH` | `1` | The smallest representable step |
| `Q8_FRAC_MASK` | `0x00FF` (`u16`) | Selects the fraction bits |

| Function / Method | Signature | Description |
|-------------------|-----------|-------------|
| `Q8::from_int` | `(n: u8) -> Q8` | Whole number to fixed point |
| `Q8::from` | `(n: u8, f: u8) -> Q8` | Integer part plus a 0–255 fraction |
| `Q8::lerp` | `(a: Q8, b: Q8, t: Q8) -> Q8` | Linear interpolation. **SNES only** |
| `to_int` | `(self) -> u8` | Integer part, truncating |
| `to_frac` | `(self) -> u8` | Fraction bits, 0–255 |
| `round` | `(self) -> u8` | Nearest whole number, **saturating at 255** rather than wrapping |
| `mul` | `(self, other: Q8) -> Q8` | Scaling multiply. **SNES only** |
| `div` | `(self, other: Q8) -> Q8` | Scaling divide |
| `div_u8` | `(self, d: u8) -> Q8` | Divide by a small whole number. **SNES only** |
| `to_string` | `(self, buf: far *u8) -> u16` | Decimal text into `buf`; the fraction is truncated, not rounded |

`Q8` defines `clamp!` as well. There is no `abs` — the type is unsigned.

:::caution
`Q10` and `Q8` both define a `clamp!` method macro. When both are included, `.clamp!()` on a `let` local whose type the compiler cannot resolve falls back to name lookup and reports `ambiguous method macro 'clamp' — defined in: Q10, Q8`. Calling it on a typed `static` resolves fine.
:::

## Strings and `format!`

`U32`, `I32`, `F32`, `Q10`, and `Q8` all provide `to_string(buf, ...) -> u16`, so all five are reachable from `format!`:

```rust
let q: Q10 = Q10::from(3, 16);
format!(BUF, "v={s}!", q);      // newtype: by value

format!(BUF, "score {s}", &SCORE);   // U32/I32/F32: by pointer
```

`to_string` writes **no NUL terminator** — the returned count is what delimits the string. `format!` appends a single NUL once the whole result is assembled. A direct caller that wants a C string writes the NUL itself at the returned offset.

## Operators

`U32`, `I32`, and `F32` work with the arithmetic and comparison operators
directly, so you rarely need to call the methods above by name. Both sides must
be the same type (a `U32` with a `U32`, an `F32` with an `F32`). For `F32` the
operators are the *only* arithmetic surface — it has no named `add`/`sub`
methods:

- **Arithmetic:** `+=`, `-=`, `*=`, `/=`
- **Comparison:** `==`, `!=`, `<`, `<=`, `>`, `>=`

```rust
SCORE += BONUS;
if PLAYER_SCORE >= HIGH_SCORE {
    new_record();
}
```

To combine a 32-bit value with a `u16` (for example, add a small constant), keep
the `_u16`/`_i16` methods — operators only work between two values of the same
type. `%`, `<<`, and `>>` likewise have no operator form; use `mod`, `shl`, and
`shr`.

Copy a value with `Clone` instead of a bare `=` (structs are never assigned by
value):

```rust
let snapshot = SCORE.clone();      // new copy
HIGH_SCORE.clone_from(&SCORE);     // copy into an existing value
```

See [Operator Overloading](../language/operator-overloading.md) for the full rules.

## Examples

### Basic Arithmetic

```rust
#[ram] static mut SCORE: U32 = U32!(0);
#[ram] static mut BONUS: U32 = U32!(10000);

fn add_points(amount @ A: u16) {
    SCORE.add_u16(amount);   // u16 operand → method
}

fn award_bonus() {
    SCORE += BONUS;          // U32 + U32 → operator
}
```

### Signed Computation

```rust
#[ram] static mut VELOCITY: I32 = I32!(0);
#[ram] static mut POSITION: I32 = I32!(10000);

fn apply_gravity() {
    VELOCITY.sub_i16(256);    // scalar operand → method
    POSITION += VELOCITY;     // I32 + I32 → operator
}

fn reverse_direction() {
    VELOCITY.neg();
}
```

### Comparison and Branching

```rust
#[ram] static mut PLAYER_SCORE: U32 = U32!(0);
#[ram] static mut HIGH_SCORE: U32 = U32!(100000);

fn check_high_score(result @ A: u8) -> u8 {
    if PLAYER_SCORE > HIGH_SCORE {
        // New high score!
        HIGH_SCORE.clone_from(&PLAYER_SCORE);
        return 1;
    }
    return 0;
}
```

### Converting Between Sizes

```rust
#[ram] static mut TOTAL_DAMAGE: I32 = I32!(0);

fn apply_damage(amount @ X: u16) {
    TOTAL_DAMAGE.from_i16(amount as i16);

    // Clamp to u16 range for display
    let display_damage @ A: u16 = TOTAL_DAMAGE.to_i16() as u16;
}
```

### Multiplication and Division

```rust
#[ram] static mut TILE_OFFSET: U32;

fn compute_tile_address(row @ A: u16) {
    TILE_OFFSET.from_u16(row);
    TILE_OFFSET.mul_u16(64);  // row * 64, handles overflow
}
```

### Floating-Point Physics

```rust
#[ram] static mut VELOCITY: F32 = F32_RAW!(0x00, 0x00, 0x0000);   // 0.0
#[ram] static mut POSITION: F32 = F32_RAW!(0x00, 0x00, 0x0000);   // 0.0
#[ram] static mut GRAVITY:  F32 = F32_RAW!(0x80, 0x40, 0x0000);   // 0.5

fn physics_step() {
    VELOCITY += GRAVITY;        // accelerate downward
    POSITION += VELOCITY;       // integrate position

    if POSITION < F32_ZERO {    // hit the floor — bounce
        POSITION.from_i16(0 as i16);
        VELOCITY.neg();
    }
}
```

### Complete Example: Frame Counter and FPS Calculation

This example demonstrates most U32/I32 features in a practical scenario — tracking elapsed frames and computing frames per second.

```rust
include!("lib/sneslib.r65")
include!("lib/U32.r65")

const FRAMES_PER_SECOND: u16 = 60;
const FRAMES_PER_MINUTE: u16 = 3600;  // 60 * 60

// Frame counter starts at 0
#[ram]
static mut FRAME_COUNT: U32 = U32!(0);


// NMI fires every frame (~60Hz)
#[interrupt(nmi)]
fn vblank_handler() {
    FRAME_COUNT.add_u16(1);
}

// Calculate seconds elapsed since start
fn get_elapsed_seconds(result @ A: u16) -> u16 {
    // Clone the frame count so the original is not modified
    let mut seconds_elapsed = FRAME_COUNT.clone();

    // Divide by 60 to get seconds
    seconds_elapsed.div_u16(FRAMES_PER_SECOND);

    // Return as u16 (truncate if > 65535 seconds)
    return seconds_elapsed.to_u16();
}

// Calculate minutes and remaining seconds
fn get_time_display(minutes @ A: u16, seconds @ X: u16) -> u16, u16 {
    // Total minutes
    let mut minutes_elapsed = FRAME_COUNT.clone();
    minutes_elapsed.div_u16(FRAMES_PER_MINUTE);

    // Remaining seconds: (frame_count / 60) % 60
    let mut seconds_elapsed = FRAME_COUNT.clone();
    seconds_elapsed.div_u16(FRAMES_PER_SECOND);
    seconds_elapsed.mod_u16(FRAMES_PER_SECOND);

    return minutes_elapsed.to_u16(), seconds_elapsed.to_u16();
}

// Check if a specific milestone frame has been reached
fn check_milestone(milestone_frames: u16, result: u8) -> u8 {
    let mut milestone: U32;
    milestone.from_u16(milestone_frames);

    if FRAME_COUNT >= milestone {
        return 1;  // Milestone reached
    }
    return 0;
}

// Reset frame counter for new level/session
fn reset_timer() {
    FRAME_COUNT.from_u16(0);
}
```

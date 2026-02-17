---
sidebar_position: 3
title: Math Library
description: Standard library math functions and 32-bit integer types for the 65816.
---

# Math Library

R65 provides a standard math library for operations that exceed the 65816's native capabilities. The library includes scalar math functions (`math.r65`), an unsigned 32-bit integer type (`U32.r65`), and a signed 32-bit integer type (`I32.r65`).

```rust
include!("lib/sneslib.r65")  // Required: hardware register definitions
include!("lib/math.r65")     // Scalar math functions
include!("lib/U32.r65")      // Unsigned 32-bit integer
include!("lib/I32.r65")      // Signed 32-bit integer
```

## Scalar Math Functions

`math.r65` provides multiplication, division, modulo, and variable shift operations. On SNES targets (`#[cfg(snes)]`), multiplication and division use the hardware math units. On other targets, software fallbacks are used.

### Multiplication

| Function | Signature | Description |
|----------|-----------|-------------|
| `mul8` | `(multA @ A: u8, multB @ B: u8) -> (u8, u8)` | 8x8 unsigned multiply, returns (low, high) |
| `mul16` | `(multA @ A: u8, multB: u16) -> u16` | 8x16 unsigned multiply, returns 16-bit result |

On SNES, these use the hardware multiplication unit (`WRMPYA`/`WRMPYB`) and complete in ~8 cycles. Software fallbacks use shift-and-add (~150-300 cycles).

### Division and Modulo

| Function | Signature | Description |
|----------|-----------|-------------|
| `div16` | `(dividend @ A: u16, divisor: u8) -> u16` | 16-bit / 8-bit unsigned division |
| `div8` | `(dividend @ A: u8, divisor @ X: u16) -> u8` | 8-bit / 8-bit unsigned division |
| `mod8` | `(dividend @ A: u8, divisor @ X: u16) -> u8` | 8-bit % 8-bit unsigned modulo |

On SNES, these use the hardware division unit (`WRDIVL`/`WRDIVH`/`WRDIVB`) and take ~30 cycles. Software fallbacks use restoring division (~200-400 cycles).

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

All methods use `impl far` with a `far *self` pointer. Operations modify the value in place.

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
| `add` | `(far *self, other: far *U32)` | `self += other` with overflow wrapping |
| `sub` | `(far *self, other: far *U32)` | `self -= other` with underflow wrapping |
| `mul` | `(far *self, other: far *U32)` | `self *= other` (32x32, low 32 bits kept) |
| `div` | `(far *self, other: far *U32)` | `self /= other` (returns `0xFFFFFFFF` on divide by zero) |
| `mod` | `(far *self, other: far *U32)` | `self %= other` (unchanged on divide by zero) |

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
| `from_i16` | `(far *self, value @ X: u16)` | Initialize from i16 (sign-extends high word) |
| `from_u16` | `(far *self, value @ X: u16)` | Initialize from u16 (zero-extends, positive values only) |
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
| `add` | `(far *self, other: far *I32)` | `self += other` (two's complement addition) |
| `sub` | `(far *self, other: far *I32)` | `self -= other` (two's complement subtraction) |
| `mul` | `(far *self, other: far *I32)` | `self *= other` (signed, low 32 bits kept) |
| `div` | `(far *self, other: far *I32)` | `self /= other` (rounds toward zero; returns `MIN_I32` on divide by zero) |
| `mod` | `(far *self, other: far *I32)` | `self %= other` (remainder sign matches dividend; unchanged on divide by zero) |

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

## Examples

### Basic Arithmetic

```rust
#[ram] static mut SCORE: U32 = U32!(0);
#[ram] static mut POINTS: U32;

fn add_points(amount @ X: u16) {
    POINTS.from_u16(amount);
    SCORE.add(&POINTS);
}
```

### Signed Computation

```rust
#[ram] static mut VELOCITY: I32 = I32!(0);
#[ram] static mut GRAVITY: I32 = I32!(-256);
#[ram] static mut POSITION: I32 = I32!(0);

fn apply_gravity() {
    VELOCITY.add(&GRAVITY);
    POSITION.add(&VELOCITY);
}

fn reverse_direction() {
    VELOCITY.neg();
}
```

### Comparison and Branching

```rust
#[ram] static mut A_VAL: U32;
#[ram] static mut B_VAL: U32;

fn is_greater(result @ A: u8) -> u8 {
    let cmp_result @ A = A_VAL.cmp(&B_VAL);
    if cmp_result == 1 {
        return 1;
    }
    return 0;
}
```

### Converting Between Sizes

```rust
#[ram] static mut BIG: I32;

fn load_and_clamp(input @ X: u16) {
    BIG.from_i16(input as i16);

    // Use the low 16 bits after computation
    let small @ A: u16 = BIG.to_i16() as u16;
}
```

### Absolute Value and Sign Handling

```rust
#[ram] static mut DISTANCE: I32;
#[ram] static mut TEMP: I32;

fn get_abs_distance(dx @ X: u16) {
    DISTANCE.from_i16(dx as i16);
    DISTANCE.abs();
}
```

### Multiplication with Overflow

```rust
#[ram] static mut RESULT: U32;
#[ram] static mut FACTOR: U32;

fn compute_tile_offset(row @ X: u16) {
    RESULT.from_u16(row);
    FACTOR.from_u16(64);
    RESULT.mul(&FACTOR);  // row * 64, full 32-bit result
}
```

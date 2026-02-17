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
| `add_u16` | `(far *self, value @ A: u16)` | `self += value` (u16 operand, zero-extends) |
| `sub_u16` | `(far *self, value @ A: u16)` | `self -= value` (u16 operand, zero-extends) |
| `mul_u16` | `(far *self, value @ A: u16)` | `self *= value` (u16 operand, low 32 bits kept) |
| `div_u16` | `(far *self, value @ A: u16)` | `self /= value` (u16 operand; returns `0xFFFFFFFF` on divide by zero) |
| `mod_u16` | `(far *self, value @ A: u16)` | `self %= value` (u16 operand, zero-extends; unchanged on divide by zero) |

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
| `add_i16` | `(far *self, value @ A: u16)` | `self += value` (i16 operand, sign-extends) |
| `sub_i16` | `(far *self, value @ A: u16)` | `self -= value` (i16 operand, sign-extends) |
| `mul_i16` | `(far *self, value @ A: u16)` | `self *= value` (i16 operand, low 32 bits kept) |
| `div_i16` | `(far *self, value @ A: u16)` | `self /= value` (i16 operand; returns `MIN_I32` on divide by zero) |
| `mod_i16` | `(far *self, value @ A: u16)` | `self %= value` (i16 operand, sign-extends; unchanged on divide by zero) |

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
#[ram] static mut BONUS: U32 = U32!(10000);

fn add_points(amount @ A: u16) {
    SCORE.add_u16(amount);
}

fn award_bonus() {
    SCORE.add(&BONUS);
}
```

### Signed Computation

```rust
#[ram] static mut VELOCITY: I32 = I32!(0);
#[ram] static mut POSITION: I32 = I32!(10000);

fn apply_gravity() {
    VELOCITY.add_i16(-256);
    POSITION.add(&VELOCITY);
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
    let cmp_result @ A = PLAYER_SCORE.cmp(&HIGH_SCORE);
    if cmp_result == 1 {
        // New high score!
        HIGH_SCORE.copy(&PLAYER_SCORE);
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
    let mut seconds_elapsed: U32;

    // Copy frame count to avoid modifying it
    seconds_elapsed.copy(&FRAME_COUNT);

    // Divide by 60 to get seconds
    seconds_elapsed.div_u16(FRAMES_PER_SECOND);

    // Return as u16 (truncate if > 65535 seconds)
    return seconds_elapsed.to_u16();
}

// Calculate minutes and remaining seconds
fn get_time_display(minutes @ A: u16, seconds @ X: u16) -> u16, u16 {
    let mut minutes_elapsed: U32;
    let mut seconds_elapsed: U32;

    // Calculate total minutes
    minutes_elapsed.copy(&FRAME_COUNT);
    minutes_elapsed.div_u16(FRAMES_PER_MINUTE);

    // Calculate remaining seconds (frame_count / 60) % 60
    seconds_elapsed.copy(&FRAME_COUNT);
    seconds_elapsed.div_u16(FRAMES_PER_SECOND);
    seconds_elapsed.mod_u16(FRAMES_PER_SECOND);

    return minutes_elapsed.to_u16(), seconds_elapsed.to_u16();
}

// Check if a specific milestone frame has been reached
fn check_milestone(milestone_frames: u16, result: u8) -> u8 {
    let mut milestone: U32;
    milestone.from_u16(milestone_frames);

    let cmp = FRAME_COUNT.cmp(&milestone);
    if cmp >= 0 {
        return 1;  // Milestone reached
    }
    return 0;
}

// Reset frame counter for new level/session
fn reset_timer() {
    FRAME_COUNT.from_u16(0);
}
```

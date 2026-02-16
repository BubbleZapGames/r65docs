---
sidebar_position: 3
title: "Processor Modes"
description: "65816 processor mode system — automatic mode inference and transitions."
---

# Processor Modes

The 65816 processor has two mode bits in the STATUS register that control the size of the accumulator and index registers. R65 manages these modes automatically based on function parameter types, eliminating an entire class of bugs common in hand-written 65816 assembly.

## Mode Bits

### M Bit (Bit 5) -- Accumulator Size

The M bit controls the size of the accumulator:

| M Bit | Mode | A Register | Effect |
|-------|------|------------|--------|
| 1 | m8 (default) | 8-bit (`u8`) | `LDA`/`STA` operate on 1 byte |
| 0 | m16 | 16-bit (`u16`) | `LDA`/`STA` operate on 2 bytes |

### X Bit (Bit 4) -- Index Register Size

The X bit controls the size of the X and Y index registers. **R65 always operates in x16 mode** (X bit = 0). X and Y are always 16-bit (`u16`).

| X Bit | Mode | X/Y Registers |
|-------|------|---------------|
| 0 | x16 (always) | 16-bit (`u16`) |
| 1 | x8 (never used) | 8-bit -- R65 never uses this mode |

## Automatic Mode Inference

R65 infers the accumulator mode from function parameter types. There is no manual mode annotation for CPU mode.

### Default Mode: m8

All functions default to m8 mode (8-bit accumulator). This applies when no `@ A: u16` parameter is present:

```rust
fn process(value @ A: u8) -> u8 {
    // m8 mode: A is u8
    return A + 1;
}

fn helper() {
    // m8 mode: no @ A parameter at all
}

fn indexed(idx @ X: u16) {
    // m8 mode: X is always u16, but this does not affect A mode
}
```

### m16 Mode: Inferred from `@ A: u16`

When a function has a parameter bound to A with type `u16`, the function enters m16 mode:

```rust
fn process16(value @ A: u16) -> u16 {
    // m16 mode: A is u16
    return A + 1;
}

fn wide_ops(data @ A: u16, idx @ X: u16) {
    // m16 mode: inferred from @ A: u16
}
```

### X/Y Parameter Validation

X and Y register parameters **must** be `u16`. Attempting to use `u8` is a compile error:

```rust
fn good(idx @ X: u16) { }         // OK: X is always u16
fn also_good(y @ Y: u16) { }      // OK: Y is always u16

fn bad(idx @ X: u8) { }           // ERROR: X/Y registers are always 16-bit
fn also_bad(y @ Y: u8) { }        // ERROR
```

## Code Generation

### m8 Function Prologue

Functions in m8 mode (the default) need no mode switch:

```
function_name:
    .ACCU 8            ; Tell assembler A is 8-bit
    .INDEX 16          ; Tell assembler X/Y are 16-bit
    ; ... function body ...
    RTS
```

### m16 Function Prologue

Functions in m16 mode emit a `REP #$20` to switch to 16-bit accumulator:

```
function_name:
    .ACCU 16           ; Tell assembler A is 16-bit
    .INDEX 16          ; Tell assembler X/Y are 16-bit
    REP #$20           ; Set 16-bit accumulator mode
    ; ... function body ...
    SEP #$20           ; Restore 8-bit accumulator mode
    RTS
```

The `SEP #$20` before the return restores m8 mode for the caller.

### Cross-Mode Calls

When an m8 function calls an m16 function (or vice versa), the **callee** handles the transition. The caller does not need to change mode before or after the call:

```rust
fn caller() {
    // caller is m8 (default)
    let result = wide_add(0x1234);
    // caller is still m8 after the call
}

fn wide_add(value @ A: u16) -> u16 {
    // callee switches to m16 (REP #$20 in prologue)
    return A + 1;
    // callee restores m8 (SEP #$20 before RTS)
}
```

The compiler ensures that every function returns in the same mode it was called with.

## Data Bank Management

The `#[mode]` attribute is used **only** for data bank register (DBR) management. It does not control CPU accumulator/index mode.

### databank=none (Default)

No DBR management. The function uses whatever DBR the caller has set:

```rust
fn local_work() { }  // Uses caller's DBR
```

### databank=inline

The callee saves DBR at entry, sets it to the function's bank, and restores it before returning:

```rust
#[mode(databank=inline)]
#[bank(2)]
far fn graphics_helper() {
    // DBR automatically set to bank 2
}
```

Generated code:

```
graphics_helper:
    PHB              ; Save caller's DBR
    LDA #$02
    PHA
    PLB              ; Set DBR to bank 2
    ; ... function body ...
    PLB              ; Restore caller's DBR
    RTL
```

### databank=caller

The caller is responsible for setting DBR before the call. Useful for batching multiple far calls to the same bank:

```rust
#[mode(databank=caller)]
#[bank(2)]
far fn helper1() { }

#[mode(databank=caller)]
#[bank(2)]
far fn helper2() { }

fn caller() {
    // Set DBR to bank 2 once for multiple calls
    asm!("PHB", "LDA #$02", "PHA", "PLB");
    helper1();
    helper2();
    asm!("PLB");
}
```

## Interrupt Handlers

Interrupt handlers execute in the default mode (m8, x16) regardless of what mode the interrupted code was in:

```rust
#[interrupt(nmi)]
fn vblank_handler() {
    // Always enters in m8/x16 mode
    // RTI restores the interrupted code's STATUS (including M and X flags)
}
```

The interrupt prologue saves STATUS via `PHP`, and `RTI` restores it. The handler body executes in the default mode.

## Design Rationale

### Why Always x16?

1. **Simplicity**: One less mode to track and manage.
2. **Performance**: 16-bit index registers are more useful for SNES development (64KB bank addressing).
3. **Safety**: Prevents mode mismatch bugs between caller and callee X/Y expectations.
4. **Compatibility**: Most SNES code uses x16 mode.

### Why Infer A Mode from Parameters?

1. **Ergonomics**: No need for explicit mode annotations on every function.
2. **Type safety**: The mode is tied to the actual parameter type, so mode and type cannot disagree.
3. **Automatic transitions**: The compiler inserts REP/SEP instructions, eliminating a common source of assembly bugs.
4. **Fewer errors**: Manual mode management in 65816 assembly is the single most common source of subtle bugs.

### Why Restrict #[mode] to DBR Only?

CPU mode (m8/m16) is an **orthogonal concern** from data bank management. The `#[mode]` attribute handles only DBR because:

1. CPU mode is fully determined by parameter types (no annotation needed).
2. DBR management is only relevant for cross-bank (`far fn`) calls.
3. The `databank=caller` optimization allows batching multiple far calls efficiently.

## Summary

| Aspect | Rule |
|--------|------|
| Accumulator mode | Inferred from `@ A` parameter type |
| Index mode | Always x16 (16-bit X/Y) |
| Default mode | m8 (8-bit A), x16 (16-bit X/Y) |
| Mode transitions | Automatic (compiler inserts REP/SEP) |
| X/Y parameters | Must be `u16` (compile error for `u8`) |
| `#[mode]` attribute | Controls DBR management only (`databank=none\|inline\|caller`) |
| Interrupt handlers | Enter in default mode; `RTI` restores interrupted mode |

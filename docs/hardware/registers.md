---
sidebar_position: 1
title: "Hardware Registers"
description: "65816 CPU registers exposed in R65 — A, B, X, Y, STATUS, and more."
---

# Hardware Registers

R65 exposes all 65816 processor registers as global mutable variables. These are not memory locations; they are hardware registers that map directly to CPU state.

## Register Summary

| Register | Type | Mutability | Description |
|----------|------|------------|-------------|
| `A` | `u8` (default) or `u16` | Read/Write | Accumulator |
| `B` | `u8` | Read/Write | Accumulator high byte (m8 mode only) |
| `X` | `u16` | Read/Write | X index register (always 16-bit) |
| `Y` | `u16` | Read/Write | Y index register (always 16-bit) |
| `STATUS` | `u8` | Read/Write | Processor status flags |
| `D` | `u16` | Read/Write | Direct Page register |
| `DBR` | `u8` | Read/Write | Data Bank Register |
| `PBR` | `u8` | Read-only | Program Bank Register |
| `S` | `u16` | Read/Write | Stack Pointer |

## A -- Accumulator

The accumulator is the primary register for arithmetic and data movement. Its type depends on the function's processor mode:

- **m8 mode** (default): `A` has type `u8` (8-bit)
- **m16 mode** (when function has `@ A: u16` parameter): `A` has type `u16` (16-bit)

```rust
// m8 mode (default)
fn process(value @ A: u8) -> u8 {
    A = A + 1;        // 8-bit operation
    return A;
}

// m16 mode (inferred from parameter type)
fn process16(value @ A: u16) -> u16 {
    A = A + 1;        // 16-bit operation
    return A;
}
```

Most functions operate in m8 mode. The compiler automatically inserts `REP #$20` / `SEP #$20` instructions when switching between modes.

### Implicit Return

Functions with a declared return type implicitly return the value in `A` if no explicit `return` statement is present:

```rust
fn get_value() -> u8 {
    A = 42;
    // Implicitly returns A
}
```

## B -- Accumulator High Byte

The B register is the **hidden high byte** of the 65816's 16-bit accumulator. It is only available in m8 mode (the default).

### Hardware Background

In m8 mode, the 16-bit accumulator (sometimes called "C") is split into two 8-bit halves:
- **A** (low byte, bits 0-7): directly accessible
- **B** (high byte, bits 8-15): accessible via the XBA instruction

In m16 mode, B is not a separate register; it is part of the 16-bit A. Using B in a function that takes `@ A: u16` is a compile error.

### XBA Instruction

R65 accesses B through the 65816 XBA (Exchange B and A) instruction, which swaps the two halves of the 16-bit accumulator. Cost: 3 cycles.

### Parameter Passing

B can be used as a function parameter in m8 mode:

```rust
fn pack_word(low @ A: u8, high @ B: u8) -> u16 {
    return (low as u16) | ((high as u16) << 8);
}
```

### Return Values

B can be returned alone or with other registers:

```rust
fn unpack_word(value: u16) -> (u8, u8) {
    A = value as u8;
    B = (value >> 8) as u8;
    return A, B;
}
```

When a function returns only B (without A), the callee does **not** restore A. The caller is responsible for preserving A if needed.

### Register Aliasing

```rust
let high_byte @ B = 0x12;
high_byte = high_byte & 0xF0;
```

### Batched XBA Optimization

The compiler minimizes XBA instructions by batching consecutive B operations:

```rust
B = 0x12;       // XBA (enter B context)
B = B + 1;      // No XBA needed
B = B & 0xF0;   // No XBA needed
A = 0x34;       // XBA (exit B context)
```

Only two XBA instructions are emitted, not one per B operation.

### Preservation

B **cannot** appear in `#[preserves(...)]` attributes. B is the high byte of the same hardware register as A; preserving one without the other is meaningless.

```rust
#[preserves(B)]  // ERROR: B not allowed in preserves
fn bad() { }
```

## X and Y -- Index Registers

X and Y are always 16-bit (`u16`) in R65. The compiler always operates in x16 mode. Attempting to bind X or Y to a `u8` parameter is a compile error.

```rust
fn indexed(idx @ X: u16, offset @ Y: u16) {
    // X and Y are always u16
}

fn bad(idx @ X: u8) { }  // ERROR: X must be u16
```

### Common Uses

- Array indexing: `buffer[X]`
- Loop counters: `for i in 0..count { X = i; ... }`
- Pointer indexing: `PTR[Y]` (compiles to `LDA ($zp),Y`)

## STATUS -- Processor Status

The STATUS register (the 65816 P register) is an 8-bit register containing processor flags. R65 provides property-style access to individual flags.

### Flag Layout

```
Bit:  7    6    5    4    3    2    1    0
Flag: N    V    M    X    D    I    Z    C
      |    |    |    |    |    |    |    |
      |    |    |    |    |    |    |    +-- Carry
      |    |    |    |    |    |    +------- Zero
      |    |    |    |    |    +------------ IRQ Disable
      |    |    |    |    +----------------- Decimal Mode
      |    |    |    +---------------------- Index Register Size
      |    |    +--------------------------- Accumulator Size
      |    +-------------------------------- Overflow
      +------------------------------------- Negative
```

### Flag Properties

| Property | Bit | Branch Instruction | Set/Clear Instruction | Writable |
|----------|-----|--------------------|-----------------------|----------|
| `STATUS.Carry` | 0 | `BCS` / `BCC` | `SEC` / `CLC` | Yes |
| `STATUS.Zero` | 1 | `BEQ` / `BNE` | (set by CPU) | No |
| `STATUS.Irq` | 2 | (bit test) | `SEI` / `CLI` | Yes |
| `STATUS.Decimal` | 3 | (bit test) | `SED` / `CLD` | Yes |
| `STATUS.XY16` | 4 | (bit test) | `REP #$10` / `SEP #$10` | Yes |
| `STATUS.A16` | 5 | (bit test) | `REP #$20` / `SEP #$20` | Yes |
| `STATUS.Overflow` | 6 | `BVS` / `BVC` | (set by CPU) | No |
| `STATUS.Negative` | 7 | `BMI` / `BPL` | (set by CPU) | No |

### Conditional Branching

**Branchable flags** (Carry, Zero, Overflow, Negative) compile to a single branch instruction:

```rust
if STATUS.Carry {
    // Generates: BCS label
    handle_carry();
}

if !STATUS.Zero {
    // Generates: BNE label
    handle_not_zero();
}
```

**Non-branchable flags** (Irq, Decimal, XY16, A16) generate a bit-test sequence:

```rust
if STATUS.Irq {
    // Generates: PHP; PLA; AND #$04; BNE label
    handle_irq_disabled();
}
```

### Flag Manipulation

Writable flags can be set or cleared:

```rust
STATUS.Carry = true;      // SEC
STATUS.Carry = false;     // CLC
STATUS.Irq = true;        // SEI (disable interrupts)
STATUS.Irq = false;       // CLI (enable interrupts)
STATUS.Decimal = true;    // SED (enable BCD mode)
STATUS.Decimal = false;   // CLD (disable BCD mode)
```

Writing to read-only flags (`Zero`, `Overflow`, `Negative`) is a compile error.

### SEP/REP Combining Optimization

When consecutive assignments set multiple mode flags in the same direction, the compiler combines them into a single instruction:

```rust
STATUS.A16 = true;
STATUS.XY16 = true;
// Generates: REP #$30 (not REP #$20; REP #$10)

STATUS.A16 = false;
STATUS.XY16 = false;
// Generates: SEP #$30
```

## D -- Direct Page Register

The D register sets the base address of the direct page (zero page). Type: `u16`.

```rust
D = 0x2100;  // Set direct page to $2100
```

Modifying D without restoring it before returning will corrupt the caller's direct page assumptions. Always save and restore:

```rust
let saved_d = D;
D = 0x2100;
// ... use direct page addressing ...
D = saved_d;
```

## DBR -- Data Bank Register

The DBR register determines which 64KB bank is used for absolute addressing. Type: `u8`.

```rust
DBR = 0x7E;  // Set data bank to bank $7E (WRAM)
```

Like D, modifying DBR without restoration causes bugs. Far functions use `#[mode(databank=inline)]` or `#[mode(databank=caller)]` for automatic DBR management.

## PBR -- Program Bank Register

The PBR register indicates the bank of the currently executing code. Type: `u8`. **Read-only**: attempting to assign to PBR is a compile error.

```rust
let bank: u8 = PBR;  // OK: read current execution bank
PBR = 0x01;           // ERROR: PBR is read-only
```

PBR is set by JSL/RTL and JML instructions. It cannot be set directly.

## S -- Stack Pointer

The S register is the hardware stack pointer. Type: `u16`.

```rust
let sp: u16 = S;  // Read current stack pointer
```

Directly modifying S is possible but dangerous. The compiler uses the stack for local variables, function calls, and register preservation. Manual S modification should be limited to initialization code.

## Register Aliasing

R65 supports giving a named alias to a hardware register with zero runtime cost:

```rust
let hitpoints @ A = PLAYER.health;  // 'hitpoints' aliases A
hitpoints = hitpoints - 1;           // Modifies A directly
```

The alias is not a separate variable; it is a compile-time name bound to the register. The value stays in the register as long as no other operation clobbers it.

### Alias Type Rules

The alias type must match the register's current type:

```rust
// m8 mode (default)
let value @ A: u8 = 10;    // OK: A is u8 in m8 mode
let value @ A: u16 = 10;   // ERROR: A is u8 in m8 mode

// m16 mode (inferred from parameter)
fn wide(input @ A: u16) {
    let value @ A: u16 = 1000;  // OK: A is u16 in m16 mode
}
```

## TAX/TXA Transfer Behavior

In m8/x16 mode (8-bit A, 16-bit X/Y), transfer instructions operate based on the **destination register size**:

```rust
// m8 mode, X/Y always x16
X = A;    // TAX: transfers full 16-bit C (both A and B!) to X
A = X;    // TXA: transfers full 16-bit X to C (overwrites both A and B!)
```

This is a hardware behavior: `TAX`/`TXA` always transfer 16 bits when the destination is 16-bit, regardless of the M flag. To transfer only the low byte with zero-extension, use an explicit cast:

```rust
X = A as u8;  // Zero-extends A to 16-bit, then transfers to X
              // Generated: REP #$20; AND #$00FF; TAX; SEP #$20
```

## Register Preservation

By default, all registers are caller-save. The `#[preserves(...)]` attribute declares that a function saves and restores specified registers:

```rust
#[preserves(X, Y)]
fn careful(input @ A: u8) -> u8 {
    X = 10;  // Compiler auto-saves X at entry, restores at exit
    Y = 20;  // Same for Y
    return A;
}
```

Valid registers for `#[preserves]`: `A`, `X`, `Y`, `STATUS`, `D`, `DBR`.
Invalid: `B` (part of A), `PBR` (read-only), `S` (managed by call convention).

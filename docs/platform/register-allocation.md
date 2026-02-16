---
sidebar_position: 2
title: Register Allocation
description: R65 register allocation strategy — explicit control, scratch registers, and predictable code generation.
---

# Register Allocation

R65's register allocation prioritizes **explicit programmer control** and **predictable code generation** over automatic optimization. The compiler is a translator, not an optimizer — it follows programmer directives to generate assembly that matches hand-written patterns.

## Allocation Priority

1. **Explicit hardware register aliases** (`let x @ A = expr`) — mandatory, highest priority
2. **Explicit memory locations** (`#[zeropage(0x20)] static mut VAR: u8`) — fixed, no allocation needed
3. **Scratch registers** — compiler-managed zero-page temporaries
4. **Stack** — fallback when no scratch space available

## Hardware Registers

Hardware registers (A, X, Y, B) require explicit aliases:

```rust
let result @ A = value + 1;    // Explicitly in A
let index @ X = 0;             // Explicitly in X
let counter @ Y = 100;         // Explicitly in Y
```

The compiler does not automatically assign values to hardware registers.

## Scratch Registers

Mark zero-page locations as compiler-managed scratch space with the `register` attribute:

```rust
#[zeropage(0x10, register)]
static mut SCRATCH0: u8;

#[zeropage(0x11, register)]
static mut SCRATCH1: u8;

#[zeropage(0x12, register)]
static mut SCRATCH2: u16;    // Takes 0x12-0x13
```

### Allocation Rules

**Function-local**: Different functions can reuse the same scratch locations without conflict.

**Not preserved across calls**: Scratch registers are caller-save. Using a scratch-allocated value after a function call is a compile error.

```rust
let temp = compute();     // Allocated to SCRATCH0
callee();                 // May clobber SCRATCH0
process(temp);            // Error: temp may be invalid
```

**No direct access**: Programmer cannot read or write scratch registers directly. Only the compiler allocates to them.

```rust
SCRATCH0 = 10;            // Error: cannot directly access scratch register
```

### Size-Appropriate Allocation

The compiler selects appropriately-sized scratch registers:

```rust
#[zeropage(0x10, register)]
static mut SCRATCH_U8: u8;       // For 8-bit temporaries

#[zeropage(0x12, register)]
static mut SCRATCH_U16: u16;     // For 16-bit temporaries

#[zeropage(0x14, register)]
static mut SCRATCH_PTR: *u8;     // For pointer temporaries
```

### Recommended Pool Size

Provide **8-16 bytes** of scratch space for typical programs.

## Internal Pipeline

The actual allocation pipeline is more sophisticated than simple scratch allocation:

1. **Virtual registers**: MIR assigns all values to virtual registers (VRegs)
2. **Slot allocation**: `slot_allocator.py` determines physical locations:
   - **HW-coalesceable VRegs**: Values that can stay in hardware registers without spilling
   - **Stack slots**: Non-coalesceable values
3. **Register allocation**: Maps VRegs to physical locations (hardware registers or stack offsets)
4. **Code generation**: Instruction selectors emit loads/stores based on physical locations

### HW Coalescence

The slot allocator uses a two-pass approach to maximize hardware register usage:

- **Pass 1**: Find VRegs where the hardware register is unclobbered between definition and last use
- **Pass 2**: Re-check remaining candidates treating Pass 1 coalesceable moves as no-ops, enabling cascading coalescence

## Performance

| Location | Access Speed |
|----------|-------------|
| Hardware registers (A, X, Y) | 2 cycles |
| Zero-page scratch | 3-4 cycles |
| RAM | 4-5 cycles |
| Stack | 5-8 cycles |

Zero-page scratch is nearly as fast as hardware registers and represents the best trade-off between speed and availability.

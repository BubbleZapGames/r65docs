---
sidebar_position: 4
title: Interrupt Handlers
description: R65 interrupt handler declarations with automatic mode management and register preservation.
---

# Interrupt Handlers

R65 provides the `#[interrupt]` attribute for declaring interrupt handlers with automatic register preservation and mode management.

## Declaration

```rust
#[interrupt(vector)]
fn handler_name() {
    // handler body
}
```

**Supported vectors**: `nmi`, `irq`, `brk`, `cop`, `abort`

```rust
#[interrupt(nmi)]
fn vblank_handler() {
    FRAME_COUNTER++;
}

#[interrupt(irq)]
fn timer_handler() {
    process_timer();
}
```

## Automatic Mode Management

Interrupts can fire while the processor is in any mode (m8 or m16). The compiler automatically:

1. Saves the processor STATUS register (including mode bits) via `PHP`
2. Forces 16-bit accumulator (`REP #$20`) to save the full 16-bit A (including hidden B byte)
3. Saves all registers (A, X, Y, D, DBR)
4. Sets default mode (m8, x16) for the handler body
5. Restores all registers in reverse order on exit
6. Restores the original STATUS via `PLP` (which restores the interrupted code's mode)
7. Returns via `RTI`

### Generated Assembly

```asm
nmi_handler:
    PHP                 ; Save STATUS (before mode change)
    REP #$20            ; Force 16-bit A to save full accumulator
    PHA                 ; Save A (full 16-bit, includes hidden B byte)
    PHX                 ; Save X
    PHY                 ; Save Y
    PHD                 ; Save Direct Page
    PHB                 ; Save Data Bank Register
    SEP #$20            ; Set m8 mode for handler body

    ; --- handler body runs here in m8/x16 mode ---

    PLB                 ; Restore DBR
    PLD                 ; Restore D
    PLY                 ; Restore Y
    PLX                 ; Restore X
    REP #$20            ; 16-bit A for full restore
    PLA                 ; Restore A (full 16-bit)
    PLP                 ; Restore STATUS (restores original mode)
    RTI                 ; Return from interrupt
```

## Restrictions

**No return values**: Interrupt handlers cannot return values. `RTI` does not support return value conventions.

```rust
#[interrupt(nmi)]
fn bad_handler() -> u8 {  // Compile error
    return 42;
}
```

**No parameters**: Interrupt handlers take no parameters.

**Default mode only**: Handler body always executes in m8/x16 mode. The `@ A: u16` parameter inference does not apply to interrupt handlers.

## Preservation Control

By default, all registers are automatically preserved. Use `preserve=false` for manual control:

```rust
#[interrupt(irq, preserve=false)]
fn minimal_handler() {
    // Programmer is responsible for saving/restoring registers
    asm!("PHA");
    process();
    asm!("PLA");
    // Must manually issue RTI
}
```

## Never-Returning Handlers

Handlers can use `-> !` if they never return:

```rust
#[interrupt(nmi)]
fn nmi_handler() -> ! {
    loop {
        process_frame();
    }
}
```

No `RTI` is generated since the handler never exits.

## Nested Interrupts

If interrupts are re-enabled within a handler (via `CLI`), nested interrupts are handled correctly. Each handler saves/restores its own state on the stack:

```rust
#[interrupt(nmi)]
fn nmi_handler() {
    asm!("CLI");        // Re-enable interrupts
    long_operation();   // IRQ could fire here — handled correctly
}
```

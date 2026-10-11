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

1. Saves the registers the handler body modifies, out of A, X, Y, D, and DBR. A body that calls a function or uses `asm!` is assumed to modify all of them. A is always saved at full 16-bit width, so its hidden high byte (B) survives.
2. Sets the default mode (m8, x16) for the handler body.
3. Restores the saved registers in reverse order on exit.
4. Returns via `RTI`.

No `PHP`/`PLP` is needed: the CPU pushes the status register when the interrupt is taken, and `RTI` pulls it back — including the m/x mode bits — so the interrupted code resumes in its own mode.

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

By default, every register the body modifies is automatically preserved. Use `preserve=false` to take over register saving yourself:

```rust
#[interrupt(irq, preserve=false)]
fn minimal_handler() {
    // Programmer is responsible for saving/restoring registers
    asm!("PHA");
    process();
    asm!("PLA");
}
```

The compiler still ends the handler with `RTI`; do not issue one yourself.

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

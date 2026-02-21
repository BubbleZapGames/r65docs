---
sidebar_position: 4
title: ABI Models
description: Compile-wide calling conventions for R65 — Default, FixedStack, and Pascal.
---

# ABI Models

R65 supports three compile-wide ABI (Application Binary Interface) models that control how functions receive parameters, return values, and manage the stack. Select a model with the `--abi` flag — it applies to every function in your program.

```bash
r65c game.r65 -o game.asm                # Default ABI (implicit)
r65c game.r65 -o game.asm --abi FixedStack
r65c game.r65 -o game.asm --abi Pascal
```

Per-function details like register bindings (`@ A`, `@ X`), `#[preserves(...)]`, and `far`/`near` still apply within the chosen model.

### Example Function

All diagrams below use this function:

```rust
fn add(a @ A: u8, b: u8) -> u8 {
    return a + b;
}

let result = add(10, 20);
```

---

## Default

The Default ABI uses PHA-based argument passing with caller PLX cleanup. It eliminates the permanent outgoing-arg area from caller stack frames, producing smaller frames and smaller code.

### How It Works

- **Register parameters** (`@ A`, `@ X`, `@ Y`, `@ B`): the caller places the value directly in the specified hardware register before calling.
- **Variable-bound parameters** (`@ VAR`): the caller writes the value to a named static variable.
- **Stack parameters** (no annotation): the caller pushes arguments via PHA before each call (right-to-left, so the first parameter ends up closest to the return address) and cleans them up via PLX after the call returns.

The compiler also runs a **scratch promotion** pass that automatically moves eligible stack parameters into direct-page scratch registers, avoiding stack-relative access entirely. Disable this with `--disable-scratch-parameters`.

### Return Values

Return values come back in hardware registers: A (first value), B (second, m8 only), X, and Y for multiple returns.

### Stack Management

The caller pushes stack arguments via PHA immediately before the call and cleans them up via PLX immediately after. There is no permanent outgoing argument area in the caller's frame, so frames are smaller. The callee does **not** clean up parameters — it simply executes `RTS` (or `RTL` for far functions).

<div style={{textAlign: 'center'}}>
  <object type="image/svg+xml" data="/img/abi-default-call.svg" width="700" style={{maxWidth: '100%'}}>Default ABI call sequence</object>
</div>

### Characteristics

- Supports recursion
- Unlimited stack parameters
- Scratch promotion reduces stack traffic for leaf-like functions
- No permanent outgoing area — smaller frames
- PHA is 1 byte vs STA d,S at 2 bytes — smaller code
- Region spill analysis saves/restores hardware registers around calls when needed

---

## FixedStack

FixedStack eliminates stack-passed parameters entirely. Every parameter must fit in a hardware register or a direct-page scratch location. This produces minimal, predictable stack frames.

### How It Works

- **Register parameters** (`@ A`, `@ X`, `@ Y`): honored as declared.
- **Remaining parameters**: automatically assigned to available direct-page scratch addresses.
- **No stack parameters**: if there are more parameters than available locations, compilation fails.

There is no outgoing argument area and no per-call stack manipulation beyond the return address push.

### Return Values

Identical to Default — hardware registers A, B, X, Y.

### Restrictions

- **No recursion.** Since parameters live in fixed memory locations (registers and scratch), a recursive call would overwrite the caller's parameters. The compiler rejects recursive functions at compile time.
- **Limited parameter count.** Bounded by available hardware registers plus scratch slots.

<div style={{textAlign: 'center'}}>
  <object type="image/svg+xml" data="/img/abi-fixedstack-call.svg" width="700" style={{maxWidth: '100%'}}>FixedStack ABI call sequence</object>
</div>

---

## Pascal

The Pascal ABI puts all parameters on the stack regardless of register annotations. This implements a classic Apple IIGS / Pascal calling convention where the callee cleans up parameters before returning.

### How It Works

1. The caller pushes **result space** onto the stack — enough bytes for the return type (skipped for void functions).
2. The caller pushes parameters **left to right** — the first parameter ends up deepest, the last parameter closest to the top.
3. The call pushes the return address.
4. The callee reads parameters from known stack offsets, computes the result, and writes it into the pre-allocated result space.
5. The callee removes the parameter bytes (but not the result space) before returning.
6. The caller pulls the result from the stack.

Register binding annotations (`@ A`, `@ X`) are **ignored** — everything goes through the stack. No scratch promotion occurs.

### Return Values

Return values go through the **stack result space**, not registers. The caller allocates this space before pushing parameters and pulls it after the call returns.

<div style={{textAlign: 'center'}}>
  <object type="image/svg+xml" data="/img/abi-pascal-call.svg" width="700" style={{maxWidth: '100%'}}>Pascal ABI call sequence</object>
</div>

---

## Comparison

| Feature | Default | FixedStack | Pascal |
|---------|---------|------------|--------|
| Stack parameters | Yes (PHA push) | No | Yes (all params) |
| Register parameters | Yes | Yes | No (ignored) |
| Scratch promotion | Automatic | All params | No |
| Outgoing arg area | None (PHA push) | None | None (PHA push) |
| Who cleans up params | Caller (PLX) | None | Callee |
| Return mechanism | Registers (A, B, X, Y) | Registers (A, B, X, Y) | Stack result space |
| Supports recursion | Yes | No | Yes |
| Frame size | Small | Minimal | Moderate |

---

## When to Use Each

### Default (recommended for most projects)

The Default ABI gives you the most flexibility. You can fine-tune hot functions with register parameters while letting the compiler handle the rest with stack parameters and scratch promotion. PHA-based argument passing keeps frames small without a permanent outgoing area. It supports recursion and has no parameter count limits.

**Choose Default when**: you're building a typical SNES game or application and want the best balance of performance and flexibility.

### FixedStack

FixedStack shines when you need absolute control over stack depth. Every frame is small and predictable — no outgoing areas, no pushed parameters. The tradeoff is no recursion and a hard limit on parameter count.

**Choose FixedStack when**:
- Writing interrupt handlers or NMI routines where stack depth must be bounded
- Working with a very small stack (256 bytes or less)
- You need static analysis of maximum stack depth
- Performance is critical and you want to avoid all stack-relative parameter access

### Pascal

The Pascal ABI is a specialized choice for interoperability or when you need a uniform stack-only convention.

**Choose Pascal when**:
- Interfacing with Apple IIGS toolbox routines or Orca/Pascal code
- You want a simple, uniform calling convention where all parameters are handled the same way
- Exploring alternative calling conventions for research purposes

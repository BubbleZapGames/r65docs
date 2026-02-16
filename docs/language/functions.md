---
sidebar_position: 6
title: Functions
description: R65 function declarations, calling conventions, parameter passing, and cross-bank calls.
---

# Functions

R65 functions map directly to 65816 subroutines. The calling convention is explicit: the programmer specifies how each parameter is passed and how values are returned. This transparency ensures generated assembly matches hand-written code with no hidden overhead.

## Function Declaration

```rust
fn name(parameters) -> ReturnType {
    body
}
```

All functions are near (same-bank) by default. Use `far fn` for cross-bank calls. Functions without a return type annotation implicitly return `u8` via the A register.

```rust
fn add_one(value @ A: u8) -> u8 {
    return value + 1;
}
```

**Assembly output:**

```asm
add_one:
    INC A
    RTS
```

---

## Parameter Passing

R65 provides three parameter-passing mechanisms. Each maps to a distinct hardware pattern on the 65816.

### Comparison

| Mechanism | Syntax | Cost | Limit | Reentrant |
|-----------|--------|------|-------|-----------|
| Stack | `param: Type` | 5--10 cycles per param | Unlimited | Yes |
| Register | `param @ A: u8` | 0--3 cycles | 4 registers | Yes |
| Variable-bound | `param @ VAR: Type` | 3--6 cycles | Unlimited | No |

**Ordering rule:** Stack parameters must appear before register and variable-bound parameters in the parameter list. The compiler rejects any other ordering.

```rust
// Valid: stack parameters first
fn process(count: u8, flags: u8, value @ A: u8) -> u8 { ... }

// Invalid: stack parameter after register parameter
fn bad(value @ A: u8, count: u8) { }  // compile error
```

---

### Stack Parameters

**Syntax:** `param: Type`

Stack parameters are pushed by the caller in right-to-left order and cleaned up by the callee. They support recursion and have no limit on count.

```rust
fn add(a: u8, b: u8) -> u8 {
    return a + b;
}

let result = add(10, 20);
```

**Caller assembly:**

```asm
LDA #20         ; b pushed first (right-to-left)
PHA
LDA #10         ; a pushed second
PHA
JSR add
; Stack cleaned by callee; result in A
```

**Callee assembly:**

```asm
add:
    LDA $03,S       ; load a (stack-relative)
    CLC
    ADC $04,S       ; add b
    ; Callee cleanup: remove 2 parameter bytes
    PLX             ; save return address in X
    REP #$20
    TSC
    CLC
    ADC #2          ; pop 2 bytes of parameters
    TCS
    SEP #$20
    PHX             ; restore return address
    RTS
```

Stack cleanup has constant overhead (~24 cycles) regardless of how many parameters are removed.

---

### Register Parameters

**Syntax:** `param @ Register: Type`

The caller places the value directly in the specified hardware register. This is the fastest mechanism.

**Available registers:**

| Register | Type Constraint | Notes |
|----------|----------------|-------|
| `A` | `u8` (default) or `u16` | `u16` switches function to m16 mode |
| `X` | `u16` only | Always 16-bit (x16 mode) |
| `Y` | `u16` only | Always 16-bit (x16 mode) |
| `B` | `u8` only | m8 mode only; high byte of accumulator |

X and Y parameters must be `u16`. The compiler rejects `@ X: u8` or `@ Y: u8`.

```rust
fn plot(x @ X: u16, y @ Y: u16, color @ A: u8) {
    // X, Y, A already contain the arguments
}
```

**Assembly output (caller):**

```asm
LDX #$0010      ; x = 16
LDY #$0020      ; y = 32
LDA #$03        ; color = 3
JSR plot
```

When the caller already has values in the correct registers, the call has zero setup cost.

#### B Register Parameters

The B register (high byte of the 16-bit accumulator) is available as a parameter in m8 mode. Access is via the `XBA` instruction which swaps A and B.

```rust
fn pack(low @ A: u8, high @ B: u8) -> u16 {
    return A as u16 | ((B as u16) << 8);
}
```

B cannot be used when the function has a `@ A: u16` parameter (m16 mode), because the full 16-bit accumulator is in use.

---

### Variable-Bound Parameters

**Syntax:** `param @ VARIABLE: Type`

The caller writes the argument to a specific memory location (typically a zero-page variable), and the callee reads from that address.

```rust
#[zeropage(0x10)]
static mut INPUT_X: u8;

#[zeropage(0x11)]
static mut INPUT_Y: u8;

fn compute(x @ INPUT_X: u8, y @ INPUT_Y: u8) -> u8 {
    return x + y;
}
```

**Caller assembly:**

```asm
LDA #10
STA $10         ; INPUT_X
LDA #20
STA $11         ; INPUT_Y
JSR compute
```

**Callee assembly:**

```asm
compute:
    LDA $10         ; load INPUT_X
    CLC
    ADC $11         ; add INPUT_Y
    RTS
```

Variable-bound parameters are not reentrant because they use shared global storage. This mechanism is extremely common in hand-written SNES assembly.

---

### Mixed Parameters

All three mechanisms can be combined in a single function signature, as long as stack parameters come first.

```rust
fn mixed(count: u8, base @ A: u8, offset @ TEMP: u8) -> u8 {
    // count on stack, base in A, offset in TEMP zero-page variable
}
```

---

## Return Values

### Implicit A Return

A function with a `-> Type` return annotation and no explicit `return` statement returns whatever is in the A register.

```rust
fn get_status() -> u8 {
    A = STATUS & 0x0F;
    // Implicitly returns A
}
```

```asm
get_status:
    LDA STATUS
    AND #$0F
    RTS             ; A contains the return value
```

### Explicit Return

Use `return` followed by registers or variables.

```rust
fn get_value() -> u8 {
    return A;
}

fn get_index() -> u16 {
    return X;
}
```

When the return register differs from A for a single return value, the compiler transfers it:

```asm
get_index:
    ; ... compute result in X ...
    TXA             ; transfer X to A
    RTS
```

### Multiple Return Values

Functions can return up to three values using registers. No parentheses around the return list.

```rust
fn divide(dividend @ A: u8, divisor @ X: u16) -> (u8, u8) {
    // quotient in A, remainder in X
    return A, X;
}
```

**Register assignment convention for multiple returns:**

| Position | Register |
|----------|----------|
| First | A |
| Second | X or B |
| Third | Y |

The second return value uses B (via `XBA`) when both values are `u8` in m8 mode, and X otherwise.

```rust
// Second return in B (both u8, m8 mode)
fn unpack(word: u16) -> (u8, u8) {
    A = word as u8;
    B = (word >> 8) as u8;
    return A, B;
}

// Second return in X (u16 value)
fn compute() -> (u8, u16) {
    A = 42;
    X = 1000;
    return A, X;
}
```

**Caller destructuring:**

```rust
let (quotient, remainder) = divide(100, 7);
```

### Return Signature Consistency

All return paths in a function must return the same registers and variables in the same order. The compiler enforces this.

```rust
// Valid: all paths return A, X
fn branch(flag: u8) -> (u8, u16) {
    if flag != 0 {
        return A, X;
    }
    return A, X;
}

// Invalid: mismatched return signatures
fn bad(flag: u8) -> u8 {
    if flag != 0 {
        return A;       // signature: (A)
    }
    return X;           // signature: (X) -- compile error
}
```

### Never Return Type

Functions that never return (infinite loops, fatal error handlers) use `-> !`. The compiler omits `RTS`/`RTL` and emits `WAI` as a safety fallback if control flow somehow reaches the end.

```rust
#[entry]
fn main() -> ! {
    init();
    loop {
        update();
        wait_for_vblank();
    }
}

fn fatal_error() -> ! {
    A = 0x80;           // force blank
    loop { }
}
```

```asm
main:
    JSR init
_loop:
    JSR update
    JSR wait_for_vblank
    JMP _loop
    ; No RTS emitted

fatal_error:
    LDA #$80
_loop2:
    JMP _loop2
    ; No RTS emitted
```

---

## Near vs Far Calls

### Near Functions

**Syntax:** `fn name() { }`

Near functions use `JSR` (Jump to Subroutine) and `RTS` (Return from Subroutine). They can only be called from within the same bank.

```rust
fn helper() -> u8 {
    return A;
}
```

```asm
; Caller
JSR helper          ; 6 cycles
; ...
helper:
    ; ...
    RTS             ; 6 cycles
; Total overhead: 12 cycles, 2-byte return address
```

### Far Functions

**Syntax:** `far fn name() { }`

Far functions use `JSL` (Jump to Subroutine Long) and `RTL` (Return from Subroutine Long). They are callable from any bank.

```rust
#[bank(1)]
far fn sound_engine() {
    // Lives in bank 1, callable from anywhere
}
```

```asm
; Caller (any bank)
JSL sound_engine    ; 8 cycles
; ...
.BANK 1
sound_engine:
    ; ...
    RTL             ; 6 cycles
; Total overhead: 14 cycles, 3-byte return address
```

### Cross-Bank Call Rules

| Caller Bank | Callee Bank | Callee Type | Allowed |
|-------------|-------------|-------------|---------|
| 0 | 0 | `fn` | Yes |
| 0 | 1 | `fn` | No -- compile error |
| 0 | 1 | `far fn` | Yes |
| 1 | 0 | `fn` | No -- compile error |
| Any | Any | `far fn` | Yes |

Near functions use a 16-bit address and physically cannot cross bank boundaries. The compiler enforces this at compile time.

### Bank Placement

`#[bank(n)]` is a directive that sets the bank context for all subsequent function and ROM data declarations until the next `#[bank]` directive.

```rust
#[bank(0)]
fn main_loop() { }      // Bank 0

#[bank(1)]
far fn audio_tick() { }  // Bank 1
far fn audio_init() { }  // Also bank 1 (inherits)

#[bank(auto)]
far fn auto_placed() { } // Compiler chooses bank
```

In `#[bank(auto)]` mode, all functions must be `far fn` and all immutable statics must use `far static`.

---

## Data Bank Register Management

Far functions can specify how the Data Bank Register (DBR) is handled via `#[mode(databank=...)]`. This controls which bank is used for absolute address data access.

### databank=none (default)

No DBR management. The programmer is responsible for ensuring DBR is correct.

```rust
#[bank(1)]
far fn raw_access() {
    // DBR is whatever the caller left it as
}
```

### databank=inline

The callee saves, sets, and restores DBR automatically.

```rust
#[bank(1)]
#[mode(databank=inline)]
far fn managed_access() {
    // DBR = 1 inside this function
    // Compiler generates PHB/PLB around body
}
```

```asm
managed_access:
    PHB             ; save caller's DBR
    LDA #$01
    PHA
    PLB             ; DBR = 1
    ; ... function body ...
    PLB             ; restore caller's DBR
    RTL
```

### databank=caller

The caller is responsible for setting DBR before the call. Useful for batching multiple far calls to the same bank.

```rust
#[bank(1)]
#[mode(databank=caller)]
far fn caller_managed() {
    // Expects caller to have set DBR = 1
}
```

**Caller assembly:**

```asm
    PHB
    LDA #$01
    PHA
    PLB             ; Set DBR = 1
    JSL caller_managed
    JSL another_bank1_fn  ; Can batch calls
    PLB             ; Restore DBR once
```

---

## Register Preservation

By default, all registers are caller-save: the caller must save any register it needs across a function call. The `#[preserves(...)]` attribute changes specific registers to callee-save.

### Syntax

```rust
#[preserves(X, Y)]
fn safe_function(value @ A: u8) -> u8 {
    X = 100;        // Modified freely inside
    Y = 200;        // Modified freely inside
    return value;
}
// X and Y are guaranteed unchanged after call
```

**Valid registers for preservation:** `A`, `X`, `Y`, `STATUS`, `D`, `DBR`

**Invalid registers for preservation:** `B` (shares hardware with A), `PBR` (read-only), `S` (stack pointer)

### Generated Code

The compiler inserts push instructions at function entry and pull instructions before every return path.

```asm
safe_function:
    PHX             ; save X
    PHY             ; save Y
    ; ... function body ...
    PLY             ; restore Y
    PLX             ; restore X
    RTS
```

Preservation adds 7 cycles per register (3 for push + 4 for pull on 16-bit registers).

---

## Const Functions

Functions declared with `const fn` can be evaluated at compile time when all arguments are constants. When called with runtime arguments, they compile to a normal function call.

```rust
const fn tile_offset(x: u8, y: u8) -> u16 {
    return (y as u16) * 32 + (x as u16);
}

// Compile-time evaluation: folded to literal 163
const PLAYER_TILE: u16 = tile_offset(3, 5);

// Runtime call: emits JSR
fn get_offset(px: u8, py: u8) -> u16 {
    return tile_offset(px, py);
}
```

**Const function restrictions:**
- No hardware register access (`A`, `X`, `Y`, etc.)
- No reading or writing runtime variables
- No `asm!()` blocks
- Supports arithmetic, control flow (`if`/`else`, `while`, `for`), local variables, type casts, and calls to other const functions

---

## Function Pointers

Function pointers store the address of a function for indirect calls.

### Types

| Type | Call Mechanism | Pointer Size |
|------|---------------|--------------|
| `fn(u8) -> u8` | JSR/RTS (near) | 16-bit |
| `far fn(u8) -> u8` | JSL/RTL (far) | 24-bit |

### Declaration and Use

```rust
type Callback = fn(value @ A: u8) -> u8;

#[ram]
static mut HANDLER: Callback;

fn dispatch(input @ A: u8) -> u8 {
    return HANDLER(input);
}
```

Indirect calls go through a trampoline since the 65816 has no indirect `JSR` to an arbitrary RAM address:

```asm
dispatch:
    ; A already contains input
    ; Trampoline: push target address, then RTS to it
    LDA HANDLER+1
    PHA
    LDA HANDLER
    PHA
    RTS             ; "returns" to HANDLER, which will RTS back to our caller
```

---

## Structs and Arrays as Parameters

Structs and arrays cannot be passed by value or returned by value. Use pointers instead.

```rust
struct Player { x: u8, y: u8, health: u16 }

// Invalid: pass by value
fn bad(player: Player) { }              // compile error

// Valid: pass by pointer
fn damage(player: *Player, amount @ A: u8) {
    player.health = player.health - amount as u16;
}

// Valid: return pointer
fn get_player() -> *Player {
    return &PLAYER;
}
```

This restriction makes memory access costs explicit. The programmer chooses between zero-page pointers (fastest), near pointers, or far pointers depending on the use case.

---

## Processor Mode and Functions

CPU mode is automatically inferred from parameter types. There is no manual mode annotation for processor mode.

- **Default:** m8 (8-bit accumulator), x16 (16-bit index registers)
- **m16 mode:** Inferred when a function has `@ A: u16`
- **X/Y:** Always u16 -- the compiler rejects `@ X: u8` or `@ Y: u8`

```rust
// m8 mode (default)
fn process_byte(value @ A: u8) -> u8 {
    return value + 1;
}

// m16 mode (inferred from u16 @ A)
fn process_word(value @ A: u16) -> u16 {
    return value + 1;
}
```

When calling an m16 function from an m8 context, the callee handles the transition:

```asm
process_word:
    REP #$20        ; switch to 16-bit accumulator
    ; ... function body ...
    SEP #$20        ; restore 8-bit accumulator
    RTL
```

The `#[mode(...)]` attribute is only used for data bank management (`databank=none|inline|caller`), not for CPU mode.

---

## Performance Summary

| Operation | Cycle Cost |
|-----------|-----------|
| Register parameter setup | 0--3 cycles |
| Variable-bound parameter (zero-page) | 3--6 cycles |
| Stack parameter (push) | 5--10 cycles per param |
| Stack cleanup (callee, constant) | ~24 cycles |
| Near call (`JSR` + `RTS`) | 12 cycles |
| Far call (`JSL` + `RTL`) | 14 cycles |
| Indirect call (trampoline) | 18--24 cycles |
| Mode transition (`REP`/`SEP`) | 6 cycles |
| Register preservation (per register) | 7 cycles (push + pull) |

For maximum performance: use register parameters, near calls, and avoid unnecessary mode transitions.

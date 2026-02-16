---
sidebar_position: 5
title: Control Flow
description: How R65 control flow maps to 65816 branch and jump instructions, compiler strategies, and optimization.
---

# Control Flow

This page covers how R65 control flow constructs map to 65816 hardware instructions, the compiler's code generation strategies, and optimization techniques. For full syntax and semantics of each construct, see [Statements](./statements.md).

## Design Principles

- **Direct mapping to assembly**: Every control flow construct compiles to a predictable sequence of branch and jump instructions
- **Transparent branch handling**: The compiler automatically fixes long branches without programmer intervention
- **No runtime overhead**: Structured control flow compiles to the same instructions a hand-written assembly programmer would use
- **Early exit patterns**: `break`, `continue`, and `return` map directly to jumps

---

## Branch Distance Limitations

The 65816 has two categories of control flow instructions with different reach:

### Conditional Branches

| Instruction | Meaning | Range | Cycles |
|-------------|---------|-------|--------|
| `BEQ` / `BNE` | Branch if equal / not equal | ±127 bytes | 2--3 |
| `BCC` / `BCS` | Branch if carry clear / set | ±127 bytes | 2--3 |
| `BMI` / `BPL` | Branch if minus / plus | ±127 bytes | 2--3 |
| `BVC` / `BVS` | Branch if overflow clear / set | ±127 bytes | 2--3 |

Conditional branches use an 8-bit signed offset, limiting them to targets within 128 bytes in either direction. They cost 2 cycles when not taken and 3 cycles when taken.

### Unconditional Jumps

| Instruction | Range | Cycles |
|-------------|-------|--------|
| `JMP` (absolute) | Full 64KB bank | 3 |
| `BRA` (relative) | ±127 bytes | 3 |
| `BRL` (long relative) | ±32KB | 4 |

### Automatic Long Branch Fixup

The compiler handles branch distance transparently through a post-optimization fixup pass:

1. **Generate code normally** -- emit conditional branches to target labels
2. **Run peephole optimization** -- finalize instruction sequences
3. **Branch fixup pass** -- calculate actual distances and fix branches that exceed ±127 bytes

When a conditional branch target is too far, the compiler inverts the condition and inserts a `JMP`:

```asm
; Original (target > 127 bytes away):
    BEQ far_target

; Compiler rewrites to:
    BNE __branch_skip_0     ; inverted condition (nearby target)
    JMP far_target           ; JMP has no range limit
__branch_skip_0:
```

**Branch inversion table:**

| Original | Inverted |
|----------|----------|
| BEQ | BNE |
| BNE | BEQ |
| BCC | BCS |
| BCS | BCC |
| BMI | BPL |
| BPL | BMI |
| BVC | BVS |
| BVS | BVC |

This is invisible to the programmer. Write control flow naturally and the compiler handles long branches.

---

## If Statements

The compiler generates inverted branch conditions as its default strategy, eliminating an extra `JMP` in the common case.

### Basic If

```rust
if x > 10 {
    process();
}
```

```asm
    LDA x
    CMP #10
    BCC skip            ; inverted: branch if x <= 10
    BEQ skip
    JSR process
skip:
```

### If-Else

```rust
if health == 0 {
    game_over();
} else {
    continue_game();
}
```

```asm
    LDA health
    BNE else_block       ; inverted: branch if health != 0
    JSR game_over
    JMP end
else_block:
    JSR continue_game
end:
```

### If-Else Chain

Each condition is tested sequentially. The compiler can reorder conditions or use jump tables for better performance when applicable.

```rust
if x < 10 {
    category = 0;
} else if x < 20 {
    category = 1;
} else {
    category = 2;
}
```

```asm
    LDA x
    CMP #10
    BCS check2           ; x >= 10, check next
    LDA #0
    STA category
    JMP end
check2:
    LDA x
    CMP #20
    BCS else_block
    LDA #1
    STA category
    JMP end
else_block:
    LDA #2
    STA category
end:
```

### If-Else as Expression

When used as an expression, both branches must be present and produce the same type. See [Statements -- If-Else as Expression](./statements.md#if-else-as-expression) for syntax details.

```rust
let category: u8 = if x < 10 { 0 } else { 1 };
```

---

## Loops

### Infinite Loop

`loop` compiles to an unconditional backward jump. It is the primary pattern for main game loops.

```rust
loop {
    update();
}
```

```asm
loop_start:
    JSR update
    JMP loop_start
```

### While Loop

The condition is checked before each iteration. The compiler uses an inverted branch to exit.

```rust
while count > 0 {
    process();
    count -= 1;
}
```

```asm
loop_start:
    LDA count
    BEQ loop_end         ; exit if count == 0
    JSR process
    DEC count
    JMP loop_start
loop_end:
```

### For Loop

Range-based `for` loops desugar to a while loop with an increment. Only `start..end` (exclusive) and `start..=end` (inclusive) ranges are supported. See [Statements -- For Loop](./statements.md#for-loop-range-based) for syntax details.

```rust
for i in 0..10 {
    process(i);
}
```

```asm
    LDA #0
    STA i
loop_start:
    LDA i
    CMP #10
    BCS loop_end
    LDA i
    JSR process
    INC i
    JMP loop_start
loop_end:
```

### Labeled Loops

Labels allow `break` and `continue` to target a specific outer loop. See [Statements -- Labeled Loops](./statements.md#labeled-loops) for syntax rules.

```rust
'outer: for y in 0..8 {
    for x in 0..8 {
        if tile_map[y * 8 + x] == target {
            break 'outer;
        }
    }
}
```

The compiler generates a `JMP` to the outer loop's exit label, bypassing all inner loop cleanup.

---

## Break and Continue

### Break

`break` compiles to a `JMP` to the loop's exit label. `break 'label` jumps to the exit label of the named loop.

```rust
loop {
    if ready {
        break;
    }
    wait();
}
```

```asm
loop_start:
    LDA ready
    BEQ not_ready
    JMP loop_end         ; break
not_ready:
    JSR wait
    JMP loop_start
loop_end:
```

### Continue

`continue` compiles to a `JMP` to the loop's condition check (for `while`/`for`) or the loop start (for `loop`). For `for` loops, the loop variable is incremented before the jump.

```rust
while index < 10 {
    if skip_table[index] {
        index += 1;
        continue;
    }
    process(index);
    index += 1;
}
```

```asm
loop_start:
    LDA index
    CMP #10
    BCS loop_end
    LDX index
    LDA skip_table,X
    BEQ not_skipped
    INC index
    JMP loop_start       ; continue
not_skipped:
    LDA index
    JSR process
    INC index
    JMP loop_start
loop_end:
```

### Nested Loop Patterns

Without labels, `break` only exits the innermost loop. A common pattern uses a flag variable to break out of multiple levels:

```rust
let mut found = false;
let mut y = 0;
while y < 8 {
    let mut x = 0;
    while x < 8 {
        if tile[y][x] == target {
            found = true;
            break;          // breaks inner loop only
        }
        x += 1;
    }
    if found {
        break;              // breaks outer loop
    }
    y += 1;
}
```

Labeled break is cleaner:

```rust
'outer: for y in 0..8 {
    for x in 0..8 {
        if tile[y][x] == target {
            break 'outer;   // exits both loops directly
        }
    }
}
```

---

## Return

`return` compiles to `RTS` (near functions) or `RTL` (far functions). See [Statements -- Return](./statements.md#return) and [Functions -- Return Values](./functions.md#return-values) for full syntax.

### Implicit A Return

If a function has a return type and the body ends without an explicit `return`, the current value of the A register is returned:

```rust
fn get_status() -> u8 {
    A = STATUS & 0x0F;
    // implicitly returns A
}
```

```asm
get_status:
    LDA STATUS
    AND #$0F
    RTS                  ; A contains return value
```

### Early Return

Early `return` generates an `RTS`/`RTL` at the return point. The compiler ensures A contains the correct value on all paths:

```rust
fn validate(input @ A: u8) -> u8 {
    if input == 0 {
        return 0xFF;
    }
    return input;
}
```

```asm
    CMP #0
    BNE not_zero
    LDA #$FF
    RTS                  ; early return
not_zero:
    ; A still holds input
    RTS
```

### Multiple Return Values

Functions can return up to three values using registers. See [Functions -- Multiple Return Values](./functions.md#multiple-return-values) for register assignment conventions.

```rust
fn get_xy() -> (u8, u8) {
    X = PLAYER_X;
    Y = PLAYER_Y;
    return X, Y;
}
```

### Never Type

Functions with `-> !` never return. The compiler omits `RTS`/`RTL` and emits `WAI` as a safety fallback if control flow somehow reaches the end:

```rust
fn infinite() -> ! {
    loop { }
}
```

```asm
infinite:
loop_start:
    JMP loop_start
    ; No RTS emitted
```

If a `-> !` function accidentally allows control flow to reach the end:

```asm
broken_never:
    WAI                  ; safety fallback -- halts CPU until interrupt
```

---

## Match Expressions

`match` tests a scrutinee against patterns and executes the first matching arm. See [Statements -- Match Expressions](./statements.md#match-expressions) for full syntax, pattern types, and exhaustiveness rules.

### Optimization Strategies

The compiler automatically selects the best code generation strategy based on pattern analysis:

| Strategy | When Used | Complexity | Example |
|----------|-----------|------------|---------|
| Lookup table | Dense range, all arms are compile-time constants | O(1) | `match tile_id { 0 => 10, 1 => 20, 2 => 30, _ => 0 }` |
| Jump table | Dense range, arm bodies are not constant | O(1) | `match state { 0 => handle_a(), 1 => handle_b(), ... }` |
| Branch chain | Sparse patterns or few arms | O(n) | `match val { 0 => ..., 100 => ..., 200 => ... }` |

Range patterns are expanded to individual values for density analysis and can trigger table optimizations. Or-patterns (`a | b`) currently fall back to branch chains.

### Branch Chain Assembly

```rust
match val {
    0 => handle_zero(),
    1 => handle_one(),
    _ => handle_other(),
}
```

```asm
    CMP #0
    BNE _check_1
    JSR handle_zero
    JMP _merge
_check_1:
    CMP #1
    BNE _default
    JSR handle_one
    JMP _merge
_default:
    JSR handle_other
_merge:
```

### Range Pattern Assembly

```rust
match val {
    0..=15 => handle_low(),
    _ => handle_high(),
}
```

```asm
    CMP #0
    BCC _default         ; val < 0? (unsigned: generated for completeness)
    CMP #16
    BCS _default         ; val >= 16? → default
    JSR handle_low
    JMP _merge
_default:
    JSR handle_high
_merge:
```

---

## Short-Circuit Evaluation

The logical operators `&&` and `||` use short-circuit (lazy) evaluation, mapping directly to conditional branch sequences.

### Logical AND

The right operand is evaluated only if the left operand is true:

```rust
if check_a() && check_b() {
    execute();
}
```

```asm
    JSR check_a
    BEQ skip             ; false → skip second check
    JSR check_b
    BEQ skip
    JSR execute
skip:
```

### Logical OR

The right operand is evaluated only if the left operand is false:

```rust
if quick_check() || slow_check() {
    execute();
}
```

```asm
    JSR quick_check
    BNE do_execute       ; true → skip second check
    JSR slow_check
    BEQ skip
do_execute:
    JSR execute
skip:
```

### Chained Conditions

Multiple `&&` conditions generate a cascade of early-exit branches:

```rust
if a && b && c {
    execute();
}
```

```asm
    LDA a
    BEQ skip
    LDA b
    BEQ skip
    LDA c
    BEQ skip
    JSR execute
skip:
```

---

## Optimization

### Condition Inversion

The compiler's default code generation strategy inverts branch conditions, eliminating an extra `JMP` in the common case:

```rust
// Source
if x != 0 {
    process();
}
next();
```

Naive assembly would require a `JMP` over the true block:

```asm
; Naive (extra JMP):
    LDA x
    BNE true_block
    JMP skip
true_block:
    JSR process
skip:
    JSR next
```

The compiler inverts the condition instead:

```asm
; Optimized (no extra JMP):
    LDA x
    BEQ skip             ; inverted: BNE → BEQ
    JSR process
skip:
    JSR next
```

### Dead Code Elimination

Code that can never execute is removed:

```rust
if false {
    unreachable();       // entire block removed
}

if true {
    always_runs();       // condition removed, body always executes
}
```

### Constant Folding

Compile-time constant conditions are evaluated during compilation:

```rust
const DEBUG: bool = false;

if DEBUG {
    log_message();       // entire block removed when DEBUG = false
}
```

This is particularly useful for conditional compilation patterns. Unlike C preprocessor `#ifdef`, the code is still type-checked before removal.

---

## Assembly Label Generation

### Naming Convention

The compiler generates labels using the pattern:

```
function_name__L{block_id}
```

Block IDs are sequential integers assigned during MIR CFG construction. There are no descriptive suffixes like `_if` or `_loop` -- all blocks use the same `__L{id}` format.

Examples: `main__L0`, `main__L1`, `update__L0`, `update__L1`

Comparison helpers use `__SCMP{N}` labels with a globally unique counter.

### Label Scoping

Labels are function-scoped to avoid conflicts between functions:

```rust
fn foo() {
    loop { break; }      // foo__L0, foo__L1, foo__L2
}

fn bar() {
    loop { break; }      // bar__L0, bar__L1, bar__L2
}
```

---

## Control Flow in Register Context

### Register Preservation Across Branches

The compiler ensures registers contain the correct value on all code paths:

```rust
fn process(value @ A: u8) -> u8 {
    if value > 100 {
        return 100;
    }
    return value;
}
```

```asm
    CMP #100
    BCC not_too_high
    LDA #100             ; overwrite A with clamped value
    RTS
not_too_high:
    ; A still contains original value
    RTS
```

### Register Aliasing in Loops

Register aliases are maintained across loop iterations. The compiler keeps values in hardware registers throughout the loop body:

```rust
fn sum_array(arr: *u8) -> u8 {
    let total @ A = 0;
    let index @ X = 0;

    while index < 10 {
        total = total + arr[index];
        index += 1;
    }

    return total;
}
```

```asm
    LDA #0               ; total = 0
    LDX #0               ; index = 0
loop_start:
    CPX #10
    BCS loop_end
    CLC
    ADC arr,X            ; total += arr[index]
    INX                  ; index++
    JMP loop_start
loop_end:
    RTS                  ; total in A
```

This generates the same code a hand-written assembly programmer would write -- no spilling to memory, no redundant loads.

---

## Examples

### Game State Machine

A typical game loop dispatches on the current state each frame:

```rust
enum GameState { Menu, Playing, Paused, GameOver }

#[zeropage]
static mut STATE: GameState = GameState::Menu;

fn main() -> ! {
    loop {
        if STATE == GameState::Menu {
            update_menu();
        } else if STATE == GameState::Playing {
            update_game();
        } else if STATE == GameState::Paused {
            update_pause();
        } else if STATE == GameState::GameOver {
            update_game_over();
        }

        render();
        wait_vblank();
    }
}
```

### Polling Loop with Timeout

Hardware polling with a timeout counter to avoid infinite hangs:

```rust
fn wait_ready(timeout @ X: u16) -> bool {
    loop {
        if (STATUS & READY_BIT) != 0 {
            return true;
        }

        if timeout == 0 {
            return false;
        }

        timeout -= 1;
        wait_frame();
    }
}
```

### Memory Copy

A byte-by-byte memory copy using register aliases for zero overhead:

```rust
fn copy_memory(src: *u8, dst: *u8, count @ X: u16) {
    if count == 0 {
        return;
    }

    let mut index @ Y = 0;
    loop {
        dst[index] = src[index];
        index += 1;
        count -= 1;

        if count == 0 {
            break;
        }
    }
}
```

### Binary Search

A binary search over a ROM lookup table, demonstrating nested control flow with early return:

```rust
fn binary_search(target @ A: u8) -> u8 {
    let mut low: u8 = 0;
    let mut high: u8 = 255;

    while low <= high {
        let mid = low + ((high - low) >> 1);
        let value = table[mid];

        if value == target {
            return mid;
        } else if value < target {
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    return 0xFF;             // not found
}
```

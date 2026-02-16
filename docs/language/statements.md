---
sidebar_position: 4
title: Statements
description: R65 variable declarations, assignments, control flow, and match expressions.
---

# Statements

This page specifies R65's statements and control flow constructs: variable declarations, assignments, conditionals, loops, match expressions, and related forms.

## Variable Declarations

### `let` Bindings

The `let` statement declares a local variable. Every variable must have an explicit type annotation or a register alias from which the type can be inferred.

**Syntax:**

```rust
let name: Type = initializer;
let mut name: Type = initializer;
let mut name: Type;
```

**Semantics:**

- `let` declares an immutable binding. The variable cannot be reassigned after initialization.
- `let mut` declares a mutable binding.
- An initializer is required for immutable bindings. Mutable bindings may omit the initializer, in which case the variable holds an undefined value until assigned.
- The type annotation is required unless a register alias is present (see below).

**Examples:**

```rust
let x: u8 = 10;
let mut counter: u16 = 0;
let mut temp: u8;           // uninitialized, must assign before use
```

**Assembly mapping:**

```rust
let x: u8 = 10;
// LDA #10
// STA x           ; stack-relative or memory location
```

### Register Alias Bindings

A `let` binding with `@ Register` aliases the variable to a hardware register. The variable name becomes a zero-cost alias -- all reads and writes go directly to the register.

**Syntax:**

```rust
let name @ Register = initializer;
let name @ Register: Type = initializer;
```

**Semantics:**

- When a register alias is present, the type is inferred from the register's current type in the function's processor mode. An explicit type annotation is optional but must match if provided.
- In default mode (m8), `@ A` infers `u8`. In m16 mode (when the function has a `@ A: u16` parameter), `@ A` infers `u16`.
- `@ X` and `@ Y` always infer `u16` (X/Y are always 16-bit in R65).

**Examples:**

```rust
let value @ A = 10;             // value aliases A, inferred u8 in m8 mode
let index @ X = 0;              // index aliases X, inferred u16
let hitpoints @ A = PLAYER.health;  // A holds hitpoints
```

**Assembly mapping:**

```rust
let value @ A = 10;
// LDA #10          ; value IS the A register
```

Register aliases have zero runtime cost -- no memory allocation occurs. The variable name is a compile-time alias for the register.

### Tuple Destructuring

Multiple return values from a function call can be destructured into separate bindings.

**Syntax:**

```rust
let (a, b) = function_call();
```

**Semantics:**

- The right-hand side must be a function call returning a tuple type.
- Each name in the tuple pattern binds to the corresponding return value.
- The number of names must match the number of return values.

**Examples:**

```rust
fn get_position() -> (u8, u8) {
    return X, Y;
}

let (px, py) = get_position();
```

---

## Assignments

### Simple Assignment

**Syntax:**

```rust
target = expression;
```

**Semantics:**

- The target must be a mutable variable, hardware register, array element, struct field, or dereferenced pointer.
- The expression type must be compatible with the target type.

**Examples:**

```rust
x = 10;
A = value;
buffer[i] = 0;
player.health = 100;
*ptr = 5;
```

**Assembly mapping:**

```rust
x = 10;
// LDA #10
// STA x
```

### Compound Assignment

Compound assignment operators combine a binary operation with assignment.

**Syntax:**

```rust
target += expression;
target -= expression;
target &= expression;
target |= expression;
target ^= expression;
target <<= constant;
target >>= constant;
target *= constant;   // constant must be 1, 2, 4, or 8
target /= constant;   // constant must be 1, 2, 4, or 8
```

**Semantics:**

- `target op= expr` desugars to `target = target op expr`.
- The same restrictions from the base operator apply. Shift amounts must be compile-time constants. Multiply/divide constants must be 1, 2, 4, or 8.

**Examples:**

```rust
counter += 1;
flags &= 0x0F;
value <<= 2;
```

**Assembly mapping:**

```rust
counter += 1;
// INC counter       ; optimized to INC for += 1

flags &= 0x0F;
// LDA flags
// AND #$0F
// STA flags
```

### Increment and Decrement

Postfix `++` and `--` operators increment or decrement a value by one.

**Syntax:**

```rust
target++;
target--;
```

**Semantics:**

- Statement-only: these operators do not produce a value and cannot be used inside expressions.
- Postfix form only. There is no prefix `++x` or `--x`.
- Desugars to `target += 1` / `target -= 1` in the parser.
- Works with variables, hardware registers, array elements, and struct fields.

**Examples:**

```rust
counter++;
X--;
buffer[i]++;
player.health--;
```

**Assembly mapping for hardware registers:**

```rust
X++;    // INX     (2 cycles)
Y--;    // DEY     (2 cycles)
A++;    // INC A   (2 cycles)
```

For memory variables, generates `INC addr` or `DEC addr` when possible.

### Multiple Assignment

Multiple assignment destructures a multi-value return into existing variables.

**Syntax:**

```rust
a, b = function_call();
```

**Semantics:**

- The right-hand side must be a function call returning multiple values.
- Each target must be an assignable location (mutable variable, register, array element, or struct field).

---

## If Statements

### Basic If

**Syntax:**

```rust
if condition {
    // body
}
```

**Semantics:**

- The condition must evaluate to `bool` or a comparable expression.
- The body executes only when the condition is true.

**Assembly mapping:**

```rust
if x > 10 {
    process();
}
// LDA x
// CMP #10
// BCC skip         ; branch if x <= 10 (inverted condition)
// BEQ skip
// JSR process
// skip:
```

The compiler generates inverted branch conditions as its default strategy, avoiding an extra JMP instruction.

### If-Else

**Syntax:**

```rust
if condition {
    // true branch
} else {
    // false branch
}
```

**Assembly mapping:**

```rust
if health == 0 {
    game_over();
} else {
    continue_game();
}
// LDA health
// BNE else_block
// JSR game_over
// JMP end
// else_block:
// JSR continue_game
// end:
```

### If-Else If-Else Chain

**Syntax:**

```rust
if condition1 {
    // branch 1
} else if condition2 {
    // branch 2
} else {
    // default
}
```

Any number of `else if` clauses may appear. The final `else` is optional for statements (but required for if-as-expression; see below).

**Assembly mapping:**

```rust
if x < 10 {
    category = 0;
} else if x < 20 {
    category = 1;
} else {
    category = 2;
}
// LDA x
// CMP #10
// BCS check2
// LDA #0
// STA category
// JMP end
// check2:
// LDA x
// CMP #20
// BCS else_block
// LDA #1
// STA category
// JMP end
// else_block:
// LDA #2
// STA category
// end:
```

### If-Else as Expression

When `if-else` appears in expression position (e.g., on the right side of a `let` binding), it produces a value.

**Syntax:**

```rust
let result: Type = if condition {
    expr_true
} else {
    expr_false
};
```

**Semantics:**

- Both branches are required. An `if` without `else` cannot be used as an expression.
- Both branches must produce the same type.
- The last expression in each branch (without a trailing semicolon) is the branch's value.
- `else if` chains are permitted.

**Examples:**

```rust
let category: u8 = if x < 10 {
    0
} else if x < 20 {
    1
} else {
    2
};

let abs_val: u8 = if x >= 0 { x } else { 0 - x };
```

---

## Block Expressions

A block `{ ... }` can be used as an expression. The last item in the block, written without a trailing semicolon, is the block's value.

**Syntax:**

```rust
{
    statement;
    statement;
    expression   // no semicolon -- this is the block's value
}
```

**Semantics:**

- All statements inside the block execute in order.
- The final expression (without semicolon) determines the block's type and value.
- Variables declared inside the block are scoped to the block.

**Examples:**

```rust
let result: u8 = {
    let temp: u8 = compute();
    temp + 1
};

let offset: u16 = {
    let row: u16 = (y as u16) << 5;
    row + (x as u16)
};
```

Block expressions are useful for complex initializations that require intermediate variables without polluting the enclosing scope.

---

## Loops

### Infinite Loop: `loop`

**Syntax:**

```rust
loop {
    // body
}
```

**Semantics:**

- Repeats the body indefinitely.
- Must use `break` to exit or `return` to exit the enclosing function.
- The primary pattern for main game loops and event loops.

**Assembly mapping:**

```rust
loop {
    update();
}
// loop_start:
// JSR update
// JMP loop_start
```

**Examples:**

```rust
#[entry]
fn main() -> ! {
    init();
    loop {
        wait_vblank();
        update_game();
        render();
    }
}

// Polling loop
loop {
    if HVBJOY & 0x01 != 0 {
        break;
    }
}
```

### While Loop

**Syntax:**

```rust
while condition {
    // body
}
```

**Semantics:**

- The condition is checked **before** each iteration.
- If the condition is initially false, the body never executes.
- The loop exits when the condition becomes false.

**Assembly mapping:**

```rust
while count > 0 {
    process();
    count -= 1;
}
// loop_start:
// LDA count
// BEQ loop_end
// JSR process
// DEC count
// JMP loop_start
// loop_end:
```

### For Loop (Range-Based)

**Syntax:**

```rust
for variable in start..end {
    // body (exclusive: iterates start to end-1)
}

for variable in start..=end {
    // body (inclusive: iterates start to end)
}
```

**Semantics:**

- `start..end` iterates from `start` (inclusive) to `end` (exclusive).
- `start..=end` iterates from `start` (inclusive) to `end` (inclusive).
- The loop variable is automatically declared as mutable with the type inferred from the range bounds.
- Range bounds must be integer expressions.
- Only range-based iteration is supported. There are no iterator-based `for` loops.

The exclusive form desugars to:

```rust
let mut i = start;
while i < end {
    // body
    i = i + 1;
}
```

**Assembly mapping:**

```rust
for i in 0..10 {
    process(i);
}
// LDA #0
// STA i
// loop_start:
// LDA i
// CMP #10
// BCS loop_end
// LDA i
// JSR process
// INC i
// JMP loop_start
// loop_end:
```

**Examples:**

```rust
// Clear a buffer
for i in 0..256 {
    buffer[i] = 0;
}

// Nested loops
for y in 0..8 {
    for x in 0..8 {
        process_tile(x, y);
    }
}

// Inclusive range
for i in 0..=255 {
    table[i] = i as u8;
}

// Using constants
const WIDTH: u8 = 32;
for col in 0..WIDTH {
    draw_cell(col);
}
```

### Labeled Loops

Any loop (`loop`, `while`, `for`) can have a label. Labels enable `break` and `continue` to target a specific enclosing loop in nested loop constructs.

**Syntax:**

```rust
'label: loop { }
'label: while condition { }
'label: for i in start..end { }
```

**Rules:**

- Labels start with `'` followed by an identifier and `:`.
- Labels are only valid on loop statements.
- `break 'label` and `continue 'label` must reference an enclosing labeled loop.
- Referencing a non-existent or non-enclosing label is a compile error.

**Examples:**

```rust
'outer: for y in 0..8 {
    for x in 0..8 {
        if tile_map[y * 8 + x] == target {
            break 'outer;   // exit both loops
        }
    }
}

'rows: for y in 0..HEIGHT {
    for x in 0..WIDTH {
        if skip_row[y] {
            continue 'rows; // skip to next row
        }
        process_cell(x, y);
    }
}
```

### Loop Expressions

A `loop` can be used as an expression when `break` carries a value.

**Syntax:**

```rust
let result: Type = loop {
    // ...
    break value;
};
```

**Semantics:**

- The `break` statement supplies the value of the loop expression.
- All `break` statements within the loop must provide a value of the same type.
- A `loop` expression without a value-carrying `break` has type `!` (never).

**Examples:**

```rust
let found_index: u8 = loop {
    if buffer[i] == target {
        break i;
    }
    i += 1;
    if i >= len {
        break 0xFF;    // sentinel for "not found"
    }
};
```

---

## Break

**Syntax:**

```rust
break;
break 'label;
break value;         // only inside loop expressions
break 'label value;  // only inside labeled loop expressions
```

**Semantics:**

- `break;` exits the innermost enclosing loop.
- `break 'label;` exits the loop with the specified label.
- `break value;` exits the loop and provides the value of the loop expression.
- Using `break` outside any loop is a compile error.
- Using `break 'label` with a label that does not refer to an enclosing loop is a compile error.

**Assembly mapping:**

```rust
loop {
    if ready {
        break;
    }
    wait();
}
// loop_start:
// LDA ready
// BEQ not_ready
// JMP loop_end       ; break
// not_ready:
// JSR wait
// JMP loop_start
// loop_end:
```

---

## Continue

**Syntax:**

```rust
continue;
continue 'label;
```

**Semantics:**

- `continue;` skips the rest of the current iteration and jumps to the next iteration of the innermost enclosing loop.
  - For `while` and `for`, this means re-checking the condition (and for `for`, incrementing the loop variable first).
  - For `loop`, this jumps to the top of the loop body.
- `continue 'label;` targets the labeled loop.
- Using `continue` outside any loop is a compile error.

**Assembly mapping:**

```rust
while index < 10 {
    if skip_table[index] {
        index += 1;
        continue;
    }
    process(index);
    index += 1;
}
// loop_start:
// LDA index
// CMP #10
// BCS loop_end
// LDX index
// LDA skip_table,X
// BEQ not_skipped
// INC index
// JMP loop_start     ; continue
// not_skipped:
// LDA index
// JSR process
// INC index
// JMP loop_start
// loop_end:
```

---

## Return

**Syntax:**

```rust
return;
return value;
return a, b;
return a, b, c;
```

**Semantics:**

- `return;` exits the current function. If the function declares a return type, the value currently in the A register is returned implicitly.
- `return value;` returns a single value (placed in A by default, or as specified by the function's return convention).
- `return a, b;` and `return a, b, c;` return multiple values. No parentheses are used. Return registers are assigned based on the function's return type (see [Functions](./functions.md)).
- All return paths in a function must have identical return signatures.
- `return` immediately exits the function at any point in the body.

### Implicit A Return

If a function has a return type and the body ends without an explicit `return`, the current value of the A register is returned.

```rust
fn get_status() -> u8 {
    A = STATUS;
    // implicitly returns A
}
```

### Never-Returning Functions

Functions annotated with `-> !` never return to their caller. The compiler omits `RTS`/`RTL` and emits `WAI` as a safety fallback if control flow unexpectedly reaches the end.

```rust
#[entry]
fn main() -> ! {
    init();
    loop {
        update();
    }
    // no return needed; -> ! means "never returns"
}
```

**Assembly mapping:**

```rust
fn validate(input @ A: u8) -> u8 {
    if input == 0 {
        return 0xFF;
    }
    return input;
}
// CMP #0
// BNE not_zero
// LDA #$FF
// RTS              ; early return
// not_zero:
// ; A still holds input
// RTS
```

---

## Match Expressions

### Basic Match

The `match` expression tests a scrutinee against a sequence of patterns and executes the first matching arm.

**Syntax:**

```rust
match scrutinee {
    pattern1 => expression1,
    pattern2 => expression2,
    _ => default_expression,
}
```

**Semantics:**

- The scrutinee is evaluated once, then each arm's pattern is tested in order.
- The first matching arm's expression is executed.
- All arms must produce the same type when `match` is used as an expression.
- The trailing comma after the last arm is optional.
- The match must be **exhaustive**: every possible value of the scrutinee must be covered by at least one pattern, or a wildcard/identifier pattern must be present.

**Supported scrutinee types:** `u8`, `i8`, `u16`, `i16`, `bool`, enums.

### Pattern Types

#### Literal Patterns

Match against integer or boolean constants.

```rust
let result: u8 = match tile_id {
    0 => 10,
    1 => 20,
    2 => 30,
    _ => 0,
};
```

#### Enum Patterns

Match against enum variants. When all variants are covered, no wildcard arm is needed.

```rust
enum Direction { North = 0, East, South, West }

let dx: i8 = match dir {
    Direction::North => 0,
    Direction::East  => 1,
    Direction::South => 0,
    Direction::West  => -1,
};
```

#### Range Patterns

Match against a contiguous range of integer values.

```rust
let category: u8 = match tile_id {
    0..=15  => 1,    // inclusive: matches 0, 1, ..., 15
    16..32  => 2,    // exclusive: matches 16, 17, ..., 31
    32..=47 => 3,
    _ => 0,
};
```

- `start..=end` is an **inclusive** range (matches start through end).
- `start..end` is an **exclusive** range (matches start through end minus 1).
- Both endpoints must be integer literals.
- Empty ranges are a compile error (`5..5`, `5..=3`).
- Range patterns only match integer scrutinee types (`u8`, `i8`, `u16`, `i16`).

#### Or Patterns

Combine multiple patterns with `|`.

```rust
let result: u8 = match input {
    0 | 1 | 2 => 10,
    3 | 4 | 5 => 20,
    _ => 0,
};
```

Range patterns can appear inside or-patterns:

```rust
let zone: u8 = match tile_id {
    0..=3 | 10..=13 => 1,
    4..=9 => 2,
    _ => 0,
};
```

#### Wildcard Pattern

`_` matches any value. It is typically used as the last arm to cover all remaining cases.

```rust
let result: u8 = match val {
    0 => 100,
    _ => 0,
};
```

#### Identifier Pattern

An identifier pattern binds the matched value to a new variable within the arm's expression.

```rust
let result: u8 = match val {
    0 => 100,
    other => other + 1,   // 'other' holds the scrutinee's value
};
```

### Exhaustiveness

The compiler enforces that match expressions cover all possible values:

- **`bool`**: Both `true` and `false` must be covered, or a wildcard must be present.
- **Enums**: All variants must be covered, or a wildcard must be present.
- **Integer types** (`u8`, `i8`, `u16`, `i16`): A wildcard `_` or identifier pattern is required because enumerating all values is impractical.

```rust
// OK: all bool values covered
let x: u8 = match flag {
    true => 1,
    false => 0,
};

// ERROR: non-exhaustive match, missing 'false'
let x: u8 = match flag {
    true => 1,
};

// OK: wildcard covers remaining integers
let x: u8 = match val {
    0 => 10,
    _ => 0,
};
```

### Match as Expression

`match` is an expression and produces a value. It can appear in `let` bindings, return statements, assignments, or any other expression position.

```rust
let category: u8 = match tile_id {
    0..=15  => 0,
    16..=31 => 1,
    _ => 2,
};

return match state {
    GameState::Playing => 1,
    _ => 0,
};
```

### Match as Statement

When used as a statement (not in expression position), `match` arms can contain blocks with arbitrary statements. The arms do not need to produce a value.

```rust
match state {
    GameState::Menu => {
        update_menu();
    },
    GameState::Playing => {
        update_game();
        check_collisions();
    },
    _ => {},
}
```

### Optimization

The compiler automatically selects the optimal code generation strategy:

- **Lookup table**: When patterns form a dense range and all arm bodies are compile-time constants, the compiler emits an inline ROM table for O(1) lookup.
- **Jump table**: When patterns are dense but arm bodies are not constant, the compiler emits an indexed jump table (`JMP (addr,X)`) for O(1) dispatch.
- **Branch chain**: For sparse patterns or a small number of arms, the compiler emits sequential comparisons.

Range patterns are expanded to individual values for density analysis and can trigger table optimizations. Or-patterns (`a | b`) currently fall back to branch chains.

**Assembly mapping (branch chain):**

```rust
match val {
    0 => handle_zero(),
    1 => handle_one(),
    _ => handle_other(),
}
// CMP #0
// BNE _check_1
// JSR handle_zero
// JMP _merge
// _check_1:
// CMP #1
// BNE _default
// JSR handle_one
// JMP _merge
// _default:
// JSR handle_other
// _merge:
```

**Assembly mapping (range pattern):**

```rust
match val {
    0..=15 => handle_low(),
    _ => handle_high(),
}
// CMP #0
// BCC _default
// CMP #16
// BCS _default
// JSR handle_low
// JMP _merge
// _default:
// JSR handle_high
// _merge:
```

---

## Short-Circuit Evaluation

The logical operators `&&` and `||` use short-circuit (lazy) evaluation.

### Logical AND (`&&`)

The right operand is evaluated only if the left operand is true.

```rust
if check_a() && check_b() {
    execute();
}
```

**Assembly mapping:**

```rust
// JSR check_a
// BEQ skip           ; if false, skip second check
// JSR check_b
// BEQ skip
// JSR execute
// skip:
```

### Logical OR (`||`)

The right operand is evaluated only if the left operand is false.

```rust
if quick_check() || slow_check() {
    execute();
}
```

**Assembly mapping:**

```rust
// JSR quick_check
// BNE do_execute      ; if true, skip second check
// JSR slow_check
// BEQ skip
// do_execute:
// JSR execute
// skip:
```

### Chained Conditions

Multiple `&&` conditions generate a cascade of early-exit branches:

```rust
if a && b && c {
    execute();
}
// LDA a
// BEQ skip
// LDA b
// BEQ skip
// LDA c
// BEQ skip
// JSR execute
// skip:
```

---

## Branch Distance Handling

The 65816 conditional branch instructions (`BEQ`, `BNE`, `BCC`, `BCS`, `BMI`, `BPL`, `BVC`, `BVS`) have a limited range of +/-127 bytes. The compiler transparently handles cases where a branch target is out of range by inverting the condition and using a `JMP`:

```
; Original (target too far):
    BEQ far_target

; Compiler rewrites to:
    BNE __branch_skip_0     ; inverted condition, nearby
    JMP far_target          ; JMP has no range limit
__branch_skip_0:
```

This fixup is automatic and invisible to the programmer. Write control flow naturally and the compiler handles long branches.

---

## Expression Statements

Any expression followed by a semicolon is an expression statement. The expression is evaluated and its result is discarded.

```rust
process();           // function call
A + 1;               // value discarded (unusual but legal)
```

Function calls are the most common expression statement.

---

## Error Conditions

### Break/Continue Outside Loop

Using `break` or `continue` outside any loop is a compile error:

```rust
fn invalid() {
    break;      // ERROR: break outside of loop
}

fn also_invalid() {
    if true {
        continue;   // ERROR: continue outside of loop
    }
}
```

### Non-Exhaustive Match

A match expression that does not cover all possible values is a compile error:

```rust
let x: u8 = match val {
    0 => 10,
    // ERROR: non-exhaustive patterns; add a wildcard `_` arm
};
```

### Mismatched Branch Types

When `if-else` or `match` is used as an expression, all branches must produce the same type:

```rust
let x: u8 = if flag {
    10       // u8
} else {
    1000     // u16 -- ERROR: type mismatch between branches
};
```

---
sidebar_position: 5
title: Control Flow
description: R65 conditionals, loops, and early exit patterns.
---

# Control Flow

R65 provides structured control flow that maps efficiently to 65816 branch and jump instructions. All constructs compile with zero overhead compared to hand-written assembly.

---

## If Statements

### Basic If

The condition must evaluate to `bool` or a comparable expression. The body executes only when the condition is true.

```rust
if x > 10 {
    process();
}

if (flags & 0x80) != 0 {
    handle_error();
}

if ready {
    start_game();
}
```

### If-Else

```rust
if health == 0 {
    game_over();
} else {
    continue_game();
}
```

### If-Else Chain

Any number of `else if` clauses may appear. The final `else` is optional for statements.

```rust
if x < 10 {
    category = 0;
} else if x < 20 {
    category = 1;
} else if x < 30 {
    category = 2;
} else {
    category = 3;
}
```

### If-Else as Expression

When used as an expression, both branches are required and must produce the same type. The last expression in each branch (without a trailing semicolon) is the branch's value.

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

`else if` chains are permitted in expression position.

---

## Block Expressions

A block `{ ... }` can be used as an expression. The last item in the block, written without a trailing semicolon, is the block's value. Variables declared inside the block are scoped to the block.

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

---

## Loops

### Infinite Loop: `loop`

Repeats indefinitely. Use `break` to exit or `return` to exit the enclosing function.

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

The condition is checked **before** each iteration. If initially false, the body never executes.

```rust
while count > 0 {
    process();
    count -= 1;
}

while !ready {
    wait();
}

let mut index = 0;
while index < 10 {
    buffer[index] = 0;
    index += 1;
}
```

### For Loop (Range-Based)

Iterates over a range of integers. Only range syntax is supported -- there are no iterator-based `for` loops.

- `start..end` -- **exclusive**: iterates from `start` to `end - 1`
- `start..=end` -- **inclusive**: iterates from `start` to `end`

The loop variable is automatically declared as mutable with the type inferred from the range bounds.

```rust
// Exclusive range
for i in 0..256 {
    buffer[i] = 0;
}

// Inclusive range
for i in 0..=255 {
    table[i] = i as u8;
}

// Nested loops
for y in 0..8 {
    for x in 0..8 {
        process_tile(x, y);
    }
}

// Using constants
const WIDTH: u8 = 32;
const HEIGHT: u8 = 28;
for row in 0..HEIGHT {
    for col in 0..WIDTH {
        draw_cell(col, row);
    }
}
```

### Labeled Loops

Any loop can have a label, enabling `break` and `continue` to target a specific enclosing loop.

Labels start with `'` followed by an identifier and `:`. They are only valid on loop statements. Referencing a non-existent or non-enclosing label is a compile error.

```rust
'outer: for y in 0..8 {
    for x in 0..8 {
        if tile_map[y * 8 + x] == target {
            break 'outer;       // exit both loops
        }
    }
}

'rows: for y in 0..HEIGHT {
    for x in 0..WIDTH {
        if skip_row[y] {
            continue 'rows;     // skip to next row
        }
        process_cell(x, y);
    }
}
```

### Loop Expressions

A `loop` can be used as an expression when `break` carries a value. All `break` statements within the loop must provide a value of the same type.

```rust
let found_index: u8 = loop {
    if buffer[i] == target {
        break i;
    }
    i += 1;
    if i >= len {
        break 0xFF;            // sentinel for "not found"
    }
};
```

---

## Break

`break` immediately exits a loop. `break 'label` exits the loop with the specified label. Using `break` outside any loop is a compile error.

```rust
break;                          // exit innermost loop
break 'label;                   // exit labeled loop
break value;                    // exit loop expression with value
break 'label value;             // exit labeled loop expression with value
```

```rust
// Search with early exit
let mut index = 0;
let mut found = false;
while index < 256 {
    if buffer[index] == target {
        found = true;
        break;
    }
    index += 1;
}

// Read until done
loop {
    let input = read_controller();
    if input == 0 {
        break;
    }
    process(input);
}
```

---

## Continue

`continue` skips the rest of the current iteration. For `while` and `for`, this re-checks the condition (and for `for`, increments the loop variable first). For `loop`, this jumps to the top of the loop body.

`continue 'label` targets the labeled loop. Using `continue` outside any loop is a compile error.

```rust
continue;                       // skip to next iteration
continue 'label;                // skip to next iteration of labeled loop
```

```rust
let mut i = 0;
while i < 100 {
    i += 1;

    if (i & 0x01) != 0 {       // skip odd numbers
        continue;
    }

    process_even(i);
}

loop {
    let status = read_status();

    if status == 0xFF {
        continue;               // ignore invalid status
    }

    handle(status);

    if done {
        break;
    }
}

// Labeled continue
'rows: for y in 0..HEIGHT {
    for x in 0..WIDTH {
        if skip_row[y] {
            continue 'rows;     // skip rest of this row
        }
        process_cell(x, y);
    }
}
```

---

## Nested Loop Patterns

Without labels, `break` only exits the innermost loop. A flag variable can propagate the exit outward:

```rust
let mut found = false;
let mut y = 0;
while y < 8 {
    let mut x = 0;
    while x < 8 {
        if tile[y][x] == target {
            found = true;
            break;              // breaks inner loop only
        }
        x += 1;
    }
    if found {
        break;                  // breaks outer loop
    }
    y += 1;
}
```

Labeled break is cleaner and more efficient:

```rust
'outer: for y in 0..8 {
    for x in 0..8 {
        if tile[y][x] == target {
            break 'outer;       // exits both loops directly
        }
    }
}
```

---

## Return

`return` immediately exits the current function. See [Functions -- Return Values](./functions.md#return-values) for register assignment conventions.

```rust
return;                         // exit function (implicit A return if typed)
return value;                   // return single value
return a, b;                    // return multiple values (no parentheses)
return a, b, c;                 // return three values
```

All return paths in a function must have identical return signatures.

### Implicit A Return

If a function has a return type and the body ends without an explicit `return`, the current value of A is returned:

```rust
fn get_status() -> u8 {
    A = STATUS & 0x0F;
    // implicitly returns A
}
```

### Early Return

`return` can appear anywhere in the function body to exit early:

```rust
fn validate(input @ A: u8) -> u8 {
    if input == 0 {
        return 0xFF;            // early exit
    }

    if input > 100 {
        return 100;             // early exit
    }

    return input;               // normal return
}
```

### Multiple Return Values

Functions can return up to three values using registers:

```rust
fn get_xy() -> (u8, u8) {
    X = PLAYER_X;
    Y = PLAYER_Y;
    return X, Y;
}

let (px, py) = get_xy();
```

### Never Type: `-> !`

Functions that never return use the `!` type. The compiler omits `RTS`/`RTL`. Common for entry points and error handlers.

```rust
#[entry]
fn main() -> ! {
    init();
    loop {
        update();
    }
}

fn fatal_error() -> ! {
    SCREEN = 0x00;              // black screen
    loop {
        asm!("STP");            // stop processor
    }
}
```

A function declared `-> !` that can actually return is a compile error.

---

## Short-Circuit Evaluation

The logical operators `&&` and `||` use short-circuit (lazy) evaluation.

**Logical AND** (`&&`): the right operand is evaluated only if the left operand is true.

```rust
if check_a() && check_b() {
    execute();
}
// check_b() only called if check_a() returns true
```

**Logical OR** (`||`): the right operand is evaluated only if the left operand is false.

```rust
if quick_check() || slow_check() {
    execute();
}
// slow_check() only called if quick_check() returns false
```

Multiple conditions can be chained:

```rust
if a && b && c {
    execute();
}

if has_powerup || health > 50 || is_invincible {
    allow_action();
}
```

---

## Constant Folding

Compile-time constant conditions are evaluated during compilation and the unreachable branch is removed. Unlike C preprocessor `#ifdef`, the code is still type-checked before removal.

```rust
const DEBUG: bool = false;

if DEBUG {
    log_message();              // entire block removed when DEBUG = false
}

if true {
    always_runs();              // condition removed, body always executes
}
```

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
        } else {
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

A binary search over a ROM lookup table with early return:

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

    return 0xFF;                // not found
}
```

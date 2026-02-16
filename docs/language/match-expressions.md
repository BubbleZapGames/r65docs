---
sidebar_position: 6
title: Match Expressions
description: R65 pattern matching with literal, enum, range, or, wildcard, and identifier patterns.
---

# Match Expressions

`match` evaluates a scrutinee once and executes the first matching arm. The match must be **exhaustive**: every possible value must be covered.

**Supported scrutinee types:** `u8`, `i8`, `u16`, `i16`, `bool`, enums.

```rust
match scrutinee {
    pattern1 => expression1,
    pattern2 => expression2,
    _ => default_expression,
}
```

The trailing comma after the last arm is optional.

---

## Pattern Types

### Literal Patterns

Match against integer or boolean constants:

```rust
let result: u8 = match tile_id {
    0 => 10,
    1 => 20,
    2 => 30,
    _ => 0,
};
```

### Enum Patterns

Match against enum variants. When all variants are covered, no wildcard is needed:

```rust
enum Direction { North = 0, East, South, West }

let dx: i8 = match dir {
    Direction::North => 0,
    Direction::East  => 1,
    Direction::South => 0,
    Direction::West  => -1,
};
```

### Range Patterns

Match a contiguous range of integer values:

```rust
let category: u8 = match tile_id {
    0..=15  => 1,               // inclusive: 0 through 15
    16..32  => 2,               // exclusive: 16 through 31
    32..=47 => 3,
    _ => 0,
};
```

- `start..=end` -- **inclusive** range (matches start through end)
- `start..end` -- **exclusive** range (matches start through end minus 1)
- Both endpoints must be integer literals
- Empty ranges are a compile error (`5..5`, `5..=3`)
- Range patterns only match integer scrutinee types (`u8`, `i8`, `u16`, `i16`)

### Or Patterns

Combine multiple patterns with `|`:

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
    0..=3 | 10..=13 => 1,      // two ranges in one arm
    4..=9 => 2,
    _ => 0,
};
```

### Wildcard Pattern

`_` matches any value. Typically used as the last arm to cover all remaining cases:

```rust
let result: u8 = match val {
    0 => 100,
    _ => 0,
};
```

### Identifier Pattern

Binds the matched value to a new variable within the arm's expression:

```rust
let result: u8 = match val {
    0 => 100,
    other => other + 1,
};
```

---

## Exhaustiveness

The compiler enforces that all possible values are covered:

- **`bool`**: both `true` and `false` must be covered, or use `_`
- **Enums**: all variants must be covered, or use `_`
- **Integer types**: a `_` or identifier pattern is required (too many values to enumerate)

```rust
// OK: all bool values covered
let x: u8 = match flag {
    true => 1,
    false => 0,
};

// ERROR: non-exhaustive match
let x: u8 = match flag {
    true => 1,
};

// OK: wildcard covers remaining integers
let x: u8 = match val {
    0 => 10,
    _ => 0,
};
```

---

## Match as Expression

`match` is an expression and produces a value. All arms must produce the same type.

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

---

## Match as Statement

When used as a statement, arms can contain blocks with arbitrary statements. The arms do not need to produce a value.

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

---

## Examples

### Game State Dispatch

```rust
enum GameState { Menu, Playing, Paused, GameOver }

#[zeropage]
static mut STATE: GameState = GameState::Menu;

fn main() -> ! {
    loop {
        match STATE {
            GameState::Menu => {
                update_menu();
            },
            GameState::Playing => {
                update_game();
            },
            GameState::Paused => {
                update_pause();
            },
            GameState::GameOver => {
                update_game_over();
            },
        }

        render();
        wait_vblank();
    }
}
```

### Tile Classification

```rust
let tile_type: u8 = match tile_id {
    0 => 0,                     // empty
    1..=15 => 1,                // ground tiles
    16..=31 => 2,               // wall tiles
    32 | 33 | 34 => 3,         // door tiles
    _ => 4,                     // decoration
};
```

### Input Handling

```rust
const BTN_A: u8 = 0x80;
const BTN_B: u8 = 0x40;
const BTN_X: u8 = 0x20;

match button {
    BTN_A => {
        player_jump();
    },
    BTN_B => {
        player_attack();
    },
    BTN_X => {
        open_inventory();
    },
    _ => {},
}
```

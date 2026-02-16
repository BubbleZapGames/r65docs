---
sidebar_position: 7
title: "Enums"
description: "R65 enum definitions, representation, and usage."
---

# Enums

R65 enums define a set of named integer constants. They are C-style: they carry no data and have no associated methods.

## Definition

```rust
enum Direction {
    North = 0,
    East,       // 1 (auto-increment)
    South,      // 2
    West        // 3
}
```

## Explicit and Auto-Increment Values

Variant values can be explicitly specified or automatically incremented from the previous variant:

```rust
enum SpriteFlags {
    FlipX = 0x40,
    FlipY = 0x80,
    Priority = 0x20
}

enum State {
    Idle = 0,
    Walking,    // 1
    Jumping,    // 2
    Falling     // 3
}
```

If no value is specified, the first variant defaults to `0` and subsequent variants increment by one from the previous value.

## Representation

The underlying representation is the **smallest integer type** that fits all variant values:

- If all values fit in `0..=255`: represented as `u8` (1 byte)
- Otherwise: represented as `u16` (2 bytes)

```rust
enum Small { A = 0, B = 255 }       // u8 representation (1 byte)
enum Large { A = 0, B = 256 }       // u16 representation (2 bytes)
```

## Usage

Enum variants are accessed with `::` syntax:

```rust
let dir = Direction::North;
let state: State = State::Idle;
```

## Comparison

Enums can be compared with `==` and `!=`:

```rust
if dir == Direction::North {
    move_up();
}
```

## Casting to Integer

Enums can be cast to their underlying integer type with `as`:

```rust
let value: u8 = Direction::East as u8;  // value = 1
```

Casting from integer to enum is not supported. To convert an integer to an enum-like value, use a match expression or conditional chain.

## Enums in Match Expressions

Enums are commonly used as match scrutinees:

```rust
let action: u8 = match dir {
    Direction::North => 0,
    Direction::East => 1,
    Direction::South => 2,
    Direction::West => 3,
};
```

When all variants are covered, no wildcard `_` arm is required.

## No Data-Carrying Variants

R65 enums do not support Rust-style data-carrying variants (sum types):

```rust
// NOT supported:
enum Message {
    Quit,
    Move { x: u8, y: u8 },  // ERROR: no data-carrying variants
    Text(String),             // ERROR
}
```

Use structs with a tag field for similar patterns:

```rust
enum MessageType { Quit = 0, Move = 1 }

struct MoveData { msg_type: MessageType, x: u8, y: u8 }
```

## Pass-by-Reference Note

Enums are small integer values and can be used freely in expressions, assignments, and as function parameters. They do not have the pass-by-reference restriction that applies to [structs](structs.md).

```rust
fn handle_direction(dir @ A: u8) {
    // Compare against enum values
    if dir == Direction::North as u8 {
        move_up();
    }
}
```

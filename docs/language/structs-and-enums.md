---
sidebar_position: 6
title: "Structs and Enums"
description: "R65 struct and enum definitions, memory layout, and usage."
---

# Structs and Enums

R65 provides two composite type constructors: structs for grouping fields, and enums for named integer constants. Both are designed for minimal overhead and predictable memory layout on the 65816.

## Structs

### Definition

Structs group named fields into a single composite type. All fields are packed in declaration order with no padding or alignment.

```rust
struct Player {
    x: u8,
    y: u8,
    health: u16,
    sprite_id: u8
}
```

### Memory Layout

Structs use a **packed layout**: fields are stored contiguously in declaration order with no padding bytes. The total size is the sum of all field sizes.

```rust
struct Player { x: u8, y: u8, health: u16 }
// Offset 0: x      (1 byte)
// Offset 1: y      (1 byte)
// Offset 2: health (2 bytes, little-endian)
// Total: 4 bytes
```

There are no alignment requirements. A `u16` field at an odd offset is valid and incurs no penalty on the 65816 (which has no alignment constraints).

### No Methods or Impl Blocks

Structs cannot have methods. There are no `impl` blocks for adding inherent methods to a struct. Use free functions that take a pointer to the struct instead:

```rust
struct Player { x: u8, y: u8, health: u16 }

// Free function operating on a Player pointer
fn damage_player(player: *Player, amount @ A: u8) {
    player.health = player.health - amount as u16;
}
```

The exception is `impl Trait for Struct` blocks, which define trait method implementations (see [Traits](traits.md)).

### Declaration

Structs can be declared as static variables with a storage attribute:

```rust
#[ram]
static mut PLAYER: Player;

#[zeropage]
static mut ACTIVE: Player;
```

Or as local variables:

```rust
let p = Player { x: 10, y: 20, health: 100 };
```

### Field Access

Fields are accessed with dot notation:

```rust
PLAYER.x = 10;
PLAYER.y = 20;
let hp: u16 = PLAYER.health;
```

### Auto-Dereference Through Pointers

Pointer-to-struct supports direct field access using `.` notation. No explicit dereference or `->` operator is needed:

```rust
#[zeropage]
static mut PTR: *Player;

PTR.x = 10;              // Equivalent to (*PTR).x = 10
let hp = PTR.health;     // Equivalent to (*PTR).health
```

This applies to both near and far pointers:

```rust
#[zeropage]
static mut FAR_PTR: far *Player;

FAR_PTR.health = 100;    // Auto-dereference through far pointer
```

### Pass-by-Reference Only

Structs **cannot** be passed by value to functions, returned by value from functions, or directly assigned from one variable to another. This is a deliberate restriction: copying multi-byte structures is expensive on the 65816 and the cost should be explicit.

```rust
// ERROR: Cannot pass struct by value
fn bad(player: Player) { }

// ERROR: Cannot return struct by value
fn bad_return() -> Player { }

// ERROR: Cannot assign struct by value
PLAYER1 = PLAYER2;
```

Use pointers instead:

```rust
// Pass by pointer
fn process_player(player: *Player) {
    player.health = player.health - 1;
}

// Initialize through pointer or field-by-field
fn init_player(dest: *Player) {
    dest.x = 0;
    dest.y = 0;
    dest.health = 100;
}

// Copy field-by-field when needed
PLAYER1.x = PLAYER2.x;
PLAYER1.y = PLAYER2.y;
PLAYER1.health = PLAYER2.health;
```

### Struct Literal Initialization

Structs can be initialized with a struct literal expression:

```rust
let p = Player { x: 10, y: 20, health: 100 };
```

All fields must be specified. There is no default initialization or partial initialization syntax.

### Nested Structs

Structs can contain other structs as fields:

```rust
struct Vec2 { x: u8, y: u8 }

struct Entity {
    pos: Vec2,
    health: u8
}
```

The inner struct is stored inline (packed). Nested field access uses chained dot notation:

```rust
ENTITY.pos.x = 10;
```

### TypeId Insertion

When a struct implements any trait, the compiler automatically inserts a hidden `__type_id: u8` field at **offset 0**, shifting all declared fields by one byte. See [Traits](traits.md) for details.

```rust
struct Player { x: u8, y: u8 }
impl Drawable for Player { /* ... */ }

// Actual layout: [__type_id(1), x(1), y(1)] = 3 bytes
```

## Enums

### Definition

Enums define a set of named integer constants. R65 enums are C-style: they carry no data and have no associated methods.

```rust
enum Direction {
    North = 0,
    East,       // 1 (auto-increment)
    South,      // 2
    West        // 3
}
```

### Explicit and Auto-Increment Values

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

### Representation

The underlying representation is the **smallest integer type** that fits all variant values:

- If all values fit in `0..=255`: represented as `u8` (1 byte)
- Otherwise: represented as `u16` (2 bytes)

```rust
enum Small { A = 0, B = 255 }       // u8 representation (1 byte)
enum Large { A = 0, B = 256 }       // u16 representation (2 bytes)
```

### Usage

Enum variants are accessed with `::` syntax:

```rust
let dir = Direction::North;
let state: State = State::Idle;
```

### Comparison

Enums can be compared with `==` and `!=`:

```rust
if dir == Direction::North {
    move_up();
}
```

### Casting to Integer

Enums can be cast to their underlying integer type with `as`:

```rust
let value: u8 = Direction::East as u8;  // value = 1
```

Casting from integer to enum is not supported. To convert an integer to an enum-like value, use a match expression or conditional chain.

### Enums in Match Expressions

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

### No Data-Carrying Variants

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

### Pass-by-Reference Note

Enums are small integer values and can be used freely in expressions, assignments, and as function parameters. They do not have the pass-by-reference restriction that applies to structs.

```rust
fn handle_direction(dir @ A: u8) {
    // Compare against enum values
    if dir == Direction::North as u8 {
        move_up();
    }
}
```

## Type Aliases

The `type` keyword creates an alias for an existing type. Aliases are fully transparent to the type checker.

```rust
type Word = u16;
type Callback = fn(u8) -> u8;
type SpriteTable = [u8; 512];
```

Type aliases can be used anywhere a type is expected:

```rust
type Health = u16;

struct Player {
    x: u8,
    y: u8,
    health: Health   // Same as u16
}

fn heal(amount @ A: Health) -> Health {
    return A + 10;
}
```

## Size Reference

| Type | Size |
|------|------|
| `u8`, `i8`, `bool` | 1 byte |
| `u16`, `i16` | 2 bytes |
| `*T` (near pointer) | 2 bytes |
| `far *T` (far pointer) | 3 bytes |
| Enum (all values ≤ 255) | 1 byte |
| Enum (any value > 255) | 2 bytes |
| Struct | Sum of field sizes |
| Array `[T; N]` | `N * sizeof(T)` |

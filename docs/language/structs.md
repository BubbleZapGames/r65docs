---
sidebar_position: 6
title: "Structs"
description: "R65 struct definitions, memory layout, and usage."
---

# Structs

R65 structs group named fields into a single composite type, designed for minimal overhead and predictable memory layout on the 65816.

## Definition

Structs group named fields into a single composite type. All fields are packed in declaration order with no padding or alignment.

```rust
struct Player {
    x: u8,
    y: u8,
    health: u16,
    sprite_id: u8
}
```

## Memory Layout

Structs use a **packed layout**: fields are stored contiguously in declaration order with no padding bytes. The total size is the sum of all field sizes.

```rust
struct Player { x: u8, y: u8, health: u16 }
// Offset 0: x      (1 byte)
// Offset 1: y      (1 byte)
// Offset 2: health (2 bytes, little-endian)
// Total: 4 bytes
```

There are no alignment requirements. A `u16` field at an odd offset is valid and incurs no penalty on the 65816 (which has no alignment constraints).

## No Methods or Impl Blocks

Structs cannot have methods. There are no `impl` blocks for adding inherent methods to a struct. Use free functions that take a pointer to the struct instead:

```rust
struct Player { x: u8, y: u8, health: u16 }

// Free function operating on a Player pointer
fn damage_player(player: *Player, amount @ A: u8) {
    player.health = player.health - amount as u16;
}
```

The exception is `impl Trait for Struct` blocks, which define trait method implementations (see [Traits](traits.md)).

## Declaration

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

## Field Access

Fields are accessed with dot notation:

```rust
PLAYER.x = 10;
PLAYER.y = 20;
let hp: u16 = PLAYER.health;
```

## Auto-Dereference Through Pointers

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

## Pass-by-Reference Only

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

## Struct Literal Initialization

Structs can be initialized with a struct literal expression:

```rust
let p = Player { x: 10, y: 20, health: 100 };
```

All fields must be specified. There is no default initialization or partial initialization syntax.

## Nested Structs

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

## TypeId Insertion

When a struct implements any trait, the compiler automatically inserts a hidden `__type_id: u8` field at **offset 0**, shifting all declared fields by one byte. See [Traits](traits.md) for details.

```rust
struct Player { x: u8, y: u8 }
impl Drawable for Player { /* ... */ }

// Actual layout: [__type_id(1), x(1), y(1)] = 3 bytes
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

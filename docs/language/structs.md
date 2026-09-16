---
sidebar_position: 8
title: "Structs"
description: "R65 struct definitions, memory layout, and usage."
---

# Structs

R65 structs group named fields into a single composite type, designed for minimal overhead and predictable memory layout on the 65816.

For a struct with a single *positional* field — `struct TileId(u8);` — see [Newtypes](./new_types.md); that form is a scalar rather than an aggregate.

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

Fields must be named. A struct body of **positional** fields is only valid with exactly one field, which makes it a [newtype](./new_types.md) rather than an aggregate:

```rust
struct TileId(u8);        // OK -- this is a newtype, not a struct

struct Point(u8, u16);
// error: a newtype wraps exactly one field
//   hint: give each field a name: 'struct Point { field0: u8, field1: u16 }'
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

### Structure-of-Arrays Layout with `#[soa]`

Packed layout has one cost that matters for entity pools: indexing an array of structs scales the index by the element size on every access. Marking a struct [`#[soa]`](./attributes.md#soa) changes how its *statics* are stored — every array of it becomes one array per field, so `POOL[i].hp` indexes a plane of `hp` values with no multiply:

```rust
#[soa]
struct Enemy { kind: u8, x: u16, hp: u8 }

#[lowram]
static mut POOL: [Enemy; 16];   // POOL__kind: [u8; 16], POOL__x: [u16; 16], POOL__hp: [u8; 16]

POOL[i].hp = 100;               // same syntax, one indexed store
```

The trade is that an element no longer has an address: `&POOL[i]`, locals and parameters of the type, whole-element copies, and `impl Clone` are all rejected, and methods take `self` as the element *index* rather than a pointer:

```rust
impl Enemy {
    fn step(self) { self.x = self.x + 1; }   // self is the index into POOL
}

POOL[i].step();
```

A `#[soa]` struct backs exactly one static, and a single instance (`static mut PLAYER: Player;`) is treated as a one-element pool. See the [`#[soa]` reference](./attributes.md#soa) for the full layout and restriction rules.

## Methods and Impl Blocks

Structs can have methods defined in `impl` blocks. Methods receive `*self` (a pointer to the struct instance) as their first parameter:

```rust
struct Player { x: u8, y: u8, health: u16 }

impl Player {
    fn get_x(*self) -> u8 {
        return self.x;
    }

    fn take_damage(*self, amount @ A: u8) {
        self.health = self.health - amount as u16;
    }
}
```

Call methods with dot notation on a struct variable or pointer:

```rust
#[zeropage]
static mut PLAYER: Player;

PLAYER.take_damage(5);    // Compiler passes &PLAYER as self
let x = PLAYER.get_x();
```

Two independent choices are made per method, with no impl-level qualifier. The `self` pointer is near (`*self`) or far (`far *self`) depending on which kind of pointer the method operates on; the call itself is far by default, with `near fn` opting a method into a same-bank call — see [Functions](./functions.md#methods):

```rust
impl Player {
    fn update(far *self) {          // far self pointer, far call
        self.health = self.health - 1;
    }

    near fn tick(*self) {           // near self pointer, near call
        self.y = self.y + 1;
    }
}
```

An [`#[soa]`](#structure-of-arrays-layout-with-soa) struct's methods take bare `self` instead — the element index.

Under the hood, methods are mangled to free functions (e.g., `Player__take_damage`) with self as the first stack-passed argument.

### Associated Constants

`impl` blocks can also define associated constants, accessed with `::` syntax:

```rust
impl Player {
    const MAX_HEALTH: u8 = 100;
}

if PLAYER.health > Player::MAX_HEALTH {
    PLAYER.health = Player::MAX_HEALTH;
}
```

### Associated Functions

A method that declares no `self` parameter is an **associated function**, called on the type:

```rust
impl Player {
    fn spawn_hp() -> u8 { return 100; }
}

let hp: u8 = Player::spawn_hp();
```

No receiver is passed and none is synthesized, so it compiles to an ordinary free-function call. See [Traits -- Associated Functions](./traits.md#associated-functions).

### Method Macros

`impl` blocks can contain `macro_rules!` definitions that act as scoped method macros. Inside the macro body, `self` refers to the receiver the macro is called on:

```rust
impl Console {
    macro_rules! print($fmt:literal, $($args:expr),*) {
        format!(__console_fmt_buf, $fmt, $($args),*);
        self.print(&__console_fmt_buf as far *u8);
    }

    macro_rules! println($fmt:literal, $($args:expr),*) {
        format!(__console_fmt_buf, $fmt, $($args),*);
        self.println(&__console_fmt_buf as far *u8);
    }
}
```

Invoke method macros with `receiver.name!(args)`:

```rust
my_console.print!("Score: {u16}", score);
my_console.println!("Level: {u8}", level);
```

During expansion, `self` in the macro body is replaced with the receiver expression (`my_console` in this case), then the body is expanded as a regular macro.

An `impl` macro whose body does **not** name `self` can be invoked on the type instead, as `Type::name!(args)`:

```rust
impl Color {
    macro_rules! rgb($r:expr, $g:expr, $b:expr) {
        { Color(((($b) & 0x1F) << 10) | ((($g) & 0x1F) << 5) | (($r) & 0x1F)) }
    }
}

let red = Color::rgb!(31, 0, 0);
```

See [Macros](macros.md#method-macros) for more details.

Trait implementations also use `impl` blocks — see [Traits](traits.md).

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

## Pass-by-Pointer Only


Structs **cannot** be passed by value to functions, returned by value from functions, or directly assigned from one variable to another. This is a deliberate restriction: copying multi-byte structures is expensive on the 65816 and the cost should be explicit.

```rust
// ERROR: Cannot pass struct by value
fn bad(player: Player) { }

// ERROR: Cannot return struct by value
fn bad_return() -> Player { }

// ERROR: Cannot assign struct by value with a bare '='
PLAYER1 = PLAYER2;
// type error: Cannot assign 'Player' by value
//   structs and arrays are not copied by a bare '='
//   Suggestion: use `dst = src.clone()` or `dst.clone_from(&src)`
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

// Copy the whole struct with Clone
PLAYER1 = PLAYER2.clone();
PLAYER1.clone_from(&PLAYER2);

// Or copy field-by-field
PLAYER1.x = PLAYER2.x;
PLAYER1.y = PLAYER2.y;
PLAYER1.health = PLAYER2.health;
```

`.clone()` requires an `impl Clone for Player {}` -- an empty body is enough, and the compiler generates the bitwise copy. See [Operator Overloading](./operator-overloading.md#copying-with-clone).

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

When a **struct** implements any trait, the compiler automatically inserts a hidden `__type_id: u8` field at **offset 0**, shifting all declared fields by one byte. See [Traits](traits.md) for details.

This applies to structs only. A [newtype](./new_types.md) that implements a trait gets no TypeId byte -- every byte is payload, which is why a newtype cannot be a `*dyn` target. A [union](./unions.md) cannot implement a trait at all, for the same reason: offset 0 is field data.

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
| Array of an `#[soa]` struct | Same total, stored as one array per field (3- and 7-byte fields padded to 4 and 8) |

---
sidebar_position: 7
title: "Traits"
description: "R65 trait definitions, implementations, and TypeId-based dynamic dispatch."
---

# Traits

R65 traits provide TypeId-based dynamic dispatch for polymorphism. A struct that implements a trait automatically receives a `__type_id` byte at offset 0, enabling heterogeneous collections with fast, predictable dispatch.

## Trait Definition

### Syntax

A trait declares a set of methods. All methods must take `*self` as the first parameter:

```rust
trait Drawable {
    fn draw(*self, x @ X: u16, y @ Y: u16);
    fn get_width(*self) -> u8;
}
```

Methods can use any of the standard R65 parameter-passing mechanisms (register, stack, variable-bound) for their non-self parameters. Methods can return values.

### Near Traits (Default)

By default, all methods in a trait use the near calling convention (JSR/RTS):

```rust
trait Updatable {
    fn update(*self);
    fn reset(*self);
}
```

Near trait dispatch uses a jump table with 2-byte entries per TypeId.

### Far Traits

For cross-bank dispatch, declare all methods with `far fn`. Far traits use the JSL/RTL calling convention:

```rust
trait Renderable {
    far fn render(*self);
    far fn get_bank(*self) -> u8;
}
```

Far trait dispatch uses a JML trampoline with 4-byte entries per TypeId.

### Near/Far Exclusivity

A trait must be **entirely near or entirely far**. Mixing near and far methods within a single trait is a compile error:

```rust
// ERROR: Cannot mix near and far methods in a trait
trait Invalid {
    fn near_method(*self);
    far fn far_method(*self);  // Compile error
}
```

## Implementing Traits

### Basic Implementation

Use `impl Trait for Struct` to provide method bodies:

```rust
struct Player {
    x: u8,
    y: u8,
    sprite_id: u8
}

impl Drawable for Player {
    fn draw(*self, x @ X: u16, y @ Y: u16) {
        draw_sprite(self.sprite_id, X, Y);
    }

    fn get_width(*self) -> u8 {
        return 16;
    }
}
```

### Rules

1. **All methods required**: Every method declared in the trait must be implemented. There are no default implementations.
2. **Exact signature match**: Method signatures in the `impl` block must match the trait definition exactly (same parameter types, bindings, and return type).
3. **TypeId insertion**: The compiler automatically inserts a `__type_id: u8` field at offset 0 of the struct.

### Multiple Trait Implementation

A struct can implement multiple traits. It receives a single TypeId shared across all trait dispatch tables:

```rust
struct Enemy {
    x: u8,
    y: u8,
    damage: u8
}

impl Drawable for Enemy {
    fn draw(*self, x @ X: u16, y @ Y: u16) { /* ... */ }
    fn get_width(*self) -> u8 { return 8; }
}

impl Updatable for Enemy {
    fn update(*self) { /* ... */ }
    fn reset(*self) { /* ... */ }
}
```

### Near/Far Constraint on Structs

A struct cannot implement both near and far traits:

```rust
trait NearTrait { fn method(*self); }
trait FarTrait { far fn method(*self); }

struct MyStruct { data: u8 }

impl NearTrait for MyStruct { /* ... */ }  // OK
impl FarTrait for MyStruct { /* ... */ }   // ERROR: already has near trait
```

## TypeId System

### Automatic Insertion

When a struct implements any trait, the compiler inserts a hidden `__type_id: u8` field at offset 0. All declared fields shift by one byte:

```rust
// Source:
struct Player { x: u8, y: u8 }
impl Drawable for Player { /* ... */ }

// Actual memory layout:
// Offset 0: __type_id (1 byte)
// Offset 1: x (1 byte)
// Offset 2: y (1 byte)
// Total: 3 bytes (was 2 bytes without trait impl)
```

### Assignment Rules

- **TypeId 0** is reserved for invalid/null. It is never assigned to any struct.
- Each struct that implements at least one trait gets a unique TypeId (1, 2, 3, ...).
- The TypeId is consistent across all traits the struct implements.
- TypeIds are assigned at compile time in declaration order.
- Maximum of **255** distinct types with trait implementations (TypeId is `u8`).

### Automatic Initialization

When a struct instance is created (via struct literal or static initialization), the compiler automatically stores the correct TypeId at offset 0:

```rust
let p = Player { x: 10, y: 20 };
// Generated: store TypeId at offset 0, then x at offset 1, y at offset 2
```

## Trait Pointers

### Near Trait Pointer

A near trait pointer is 2 bytes and uses the current data bank register for addressing:

```rust
let obj: *Drawable = &player;
```

### Far Trait Pointer

A far trait pointer is 3 bytes and includes a bank byte for full 24-bit addressing:

```rust
let obj: far *Renderable = &sprite;
```

### Creating Trait Pointers

A pointer to a concrete struct can be assigned to a trait pointer if the struct implements the trait. The coercion is implicit:

```rust
#[ram]
static mut PLAYER: Player;

// Implicit coercion from *Player to *Drawable
let d: *Drawable = &PLAYER;

// Explicit cast also works
let d: *Drawable = &PLAYER as *Drawable;
```

### Null Trait Pointers

Null is represented as address zero. Check manually before dispatching:

```rust
let target: *Drawable = 0 as *Drawable;

if target != 0 as *Drawable {
    target.draw(X, Y);
}
```

### Trait Pointers in Data Structures

```rust
// Array of trait pointers
#[ram]
static mut ENTITIES: [*Drawable; 32];

// Struct containing a trait pointer
struct Projectile {
    x: u8,
    y: u8,
    target: *Damageable
}
```

### Static Initialization of Trait Pointers

Trait pointers can be initialized at compile time in static declarations:

```rust
#[ram]
static mut PLAYER: Player;

#[ram]
static mut ENEMY: Enemy;

#[ram]
static mut CURRENT_TARGET: *Drawable = &PLAYER;

#[ram]
static mut DRAW_LIST: [*Drawable; 4] = [
    &PLAYER,
    &ENEMY,
    0 as *Drawable,
    0 as *Drawable
];
```

The target must be a `static` or `static mut` variable. The `&` operator on a static yields a compile-time address. Type coercion from `*ConcreteType` to `*Trait` happens implicitly.

## Method Dispatch

### Calling Methods

Call trait methods on trait pointers using dot notation:

```rust
let obj: *Drawable = &player;
obj.draw(X, Y);
let w: u8 = obj.get_width();
```

### Dispatch Mechanism

1. Load the TypeId byte from offset 0 of the object.
2. Use the TypeId to index into the trait's per-method jump table.
3. Jump to the correct implementation.

### Near Dispatch (Jump Table)

The compiler generates one jump table per trait method:

```
Drawable__draw_table:
    .dw _trait_error        ; TypeId 0 (invalid)
    .dw Player__draw        ; TypeId 1
    .dw Enemy__draw         ; TypeId 2
    .dw Bullet__draw        ; TypeId 3
```

Dispatch code:

```
    LDA (obj)               ; Load TypeId
    ASL A                   ; Multiply by 2 (16-bit table entries)
    TAX
    JMP (Drawable__draw_table,X)
```

**Cost**: approximately 10-12 cycles overhead per dispatch (on top of the method body itself).

### Far Dispatch (JML Trampoline)

For far traits, the compiler generates a JML trampoline:

```
Renderable__render_trampoline:
    JML _trait_error        ; TypeId 0 (4 bytes)
    JML Sprite__render      ; TypeId 1 (4 bytes)
    JML Enemy__render       ; TypeId 2 (4 bytes)
```

Dispatch code loads the TypeId, multiplies by 4 (the size of a JML instruction), and jumps into the trampoline.

**Cost**: approximately 20-25 cycles overhead per dispatch.

### Dispatch Cost Comparison

| Call Type | Overhead |
|-----------|----------|
| Direct near call (`JSR`/`RTS`) | ~12 cycles |
| Near trait dispatch | ~10-12 cycles + 12 cycles call |
| Direct far call (`JSL`/`RTL`) | ~14 cycles |
| Far trait dispatch | ~20-25 cycles + 14 cycles call |

## Type Introspection

### type_id() Method

The `type_id()` method is available on any trait pointer. It returns the `__type_id` byte:

```rust
let obj: *Drawable = &player;
let id: u8 = obj.type_id();  // Returns Player's TypeId (e.g., 1)
```

This compiles to a single indirect load from offset 0 of the object.

### TYPE_ID Constants

Each struct with trait implementations has a compile-time `TYPE_ID` constant:

```rust
Player::TYPE_ID     // e.g., 1
Enemy::TYPE_ID      // e.g., 2
Bullet::TYPE_ID     // e.g., 3
```

### Downcasting

Compare `type_id()` against `TYPE_ID` constants to safely downcast from a trait pointer to a concrete type:

```rust
fn handle_collision(obj: *Drawable) {
    if obj.type_id() == Player::TYPE_ID {
        let player: *Player = obj as *Player;
        player.health = player.health - 10;
    } else if obj.type_id() == Enemy::TYPE_ID {
        let enemy: *Enemy = obj as *Enemy;
        enemy.damage = enemy.damage + 1;
    }
}
```

Casting without checking `type_id()` first is allowed but dangerous. If the cast is wrong, subsequent field accesses will read garbage or corrupt memory.

## Associated Constants

Traits can declare compile-time constants that each implementor must define:

```rust
trait Drawable {
    const WIDTH: u8;
    const HEIGHT: u8;
    fn draw(*self, x @ X: u16, y @ Y: u16);
}

impl Drawable for Player {
    const WIDTH: u8 = 16;
    const HEIGHT: u8 = 24;
    fn draw(*self, x @ X: u16, y @ Y: u16) { /* ... */ }
}

impl Drawable for Bullet {
    const WIDTH: u8 = 4;
    const HEIGHT: u8 = 4;
    fn draw(*self, x @ X: u16, y @ Y: u16) { /* ... */ }
}
```

### Rules

- Constants must be compile-time evaluable (same rules as `const` declarations).
- Only primitive types are supported: `u8`, `u16`, `i8`, `i16`, `bool`.
- No arrays or pointers in associated constants.

### Access

Associated constants are accessed via the **concrete type**, not through trait pointers:

```rust
let w: u8 = Player::WIDTH;   // OK: compile-time resolved
let h: u8 = Bullet::HEIGHT;  // OK

let obj: *Drawable = &player;
let w: u8 = obj.WIDTH;       // ERROR: cannot access through trait pointer
```

For runtime access to type-specific values, use a trait method instead:

```rust
trait Drawable {
    const WIDTH: u8;
    fn get_width(*self) -> u8;
}

impl Drawable for Player {
    const WIDTH: u8 = 16;
    fn get_width(*self) -> u8 { return 16; }
}
```

## Self Pointer Dispatch Mechanism

Trait methods receive the `self` pointer in the Y register with DBR set to the object's bank. This enables efficient field access:

```rust
impl Drawable for Player {
    fn draw(*self, x @ X: u16, y @ Y: u16) {
        // self.sprite_id compiles to: LDA offset,Y
        // where Y holds the self pointer and DBR is set to the object's bank
    }
}
```

Field access through `*self` costs approximately 5 cycles (`LDA $offset,Y`), compared to approximately 10 cycles for stack-relative indirect addressing.

## Memory Considerations

### Table Size

| Component | Size |
|-----------|------|
| Near jump table entry | 2 bytes per TypeId |
| Far trampoline entry | 4 bytes per TypeId |
| TypeId per instance | 1 byte |

Example: 10 types implementing `Drawable` with 3 methods produces 3 jump tables of 11 entries (TypeId 0 through 10) at 2 bytes each = 66 bytes of ROM.

### TypeId Limits

The maximum number of distinct struct types with trait implementations is 255 (TypeId 0 is reserved for null/invalid).

## Limitations

1. **No generics**: Traits cannot be parameterized with types.
2. **No default implementations**: Every method must be implemented by every implementor.
3. **No supertraits**: Traits cannot extend or require other traits.
4. **No associated types**: Only associated constants are supported.
5. **No trait bounds**: Function signatures cannot require trait implementations.
6. **Near/far exclusivity**: A struct cannot implement both near and far traits.
7. **No self by value**: All trait methods must take `*self` (a pointer).

## Complete Example

```rust
trait Drawable {
    fn draw(*self, x @ X: u16, y @ Y: u16);
}

trait Updatable {
    fn update(*self);
}

struct Player { x: u8, y: u8, sprite_id: u8 }
struct Enemy { x: u8, y: u8, health: u8 }

impl Drawable for Player {
    fn draw(*self, x @ X: u16, y @ Y: u16) {
        draw_sprite(self.sprite_id, X, Y);
    }
}

impl Updatable for Player {
    fn update(*self) { /* handle input */ }
}

impl Drawable for Enemy {
    fn draw(*self, x @ X: u16, y @ Y: u16) {
        draw_sprite(0x10, X, Y);
    }
}

impl Updatable for Enemy {
    fn update(*self) {
        if self.health == 0 {
            self.x = 0xFF;  // Mark as dead
        }
    }
}

#[ram]
static mut PLAYER: Player;

#[ram]
static mut ENEMIES: [Enemy; 8];

#[ram]
static mut DRAW_LIST: [*Drawable; 16];

fn game_update() {
    // Update all entities
    PLAYER.update();
    for i in 0..8 {
        ENEMIES[i].update();
    }

    // Draw all entities via trait dispatch
    for i in 0..16 {
        let d: *Drawable = DRAW_LIST[i];
        if d != 0 as *Drawable {
            d.draw(X, Y);
        }
    }
}
```

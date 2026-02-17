---
sidebar_position: 9
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

### Far Traits

For cross-bank dispatch, declare all methods with `far fn`. Far traits use the JSL/RTL calling convention:

```rust
trait Renderable {
    far fn render(*self);
    far fn get_bank(*self) -> u8;
}
```

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
```

## Trait Pointers

Trait pointers use the `*dyn TraitName` syntax. The `dyn` keyword distinguishes a dynamic dispatch pointer (where the concrete type is not statically known) from a plain struct pointer.

### Near Trait Pointer

```rust
let obj: *dyn Drawable = &player as *dyn Drawable;
```

### Far Trait Pointer

```rust
let obj: far *dyn Renderable = &sprite as far *dyn Renderable;
```

### Creating Trait Pointers

A concrete struct pointer is coerced to a trait pointer with an explicit `as *dyn Trait` cast:

```rust
#[ram]
static mut PLAYER: Player;

let d: *dyn Drawable = &PLAYER as *dyn Drawable;
```

### Null Trait Pointers

Null is represented as address zero. Check manually before dispatching:

```rust
let target: *dyn Drawable = 0 as *dyn Drawable;

if target != 0 as *dyn Drawable {
    target.draw(X, Y);
}
```

### Trait Pointers as Function Parameters

`*dyn Trait` can be passed as a regular stack parameter to any function, including trait methods themselves. This lets implementations receive an opaque object and inspect it at runtime:

```rust
trait Collidable {
    fn collides(*self, other: *dyn Collidable) -> u8;
}
```

Inside the implementation use `type_id()` to identify the concrete type before casting:

```rust
impl Collidable for Rect {
    fn collides(*self, other: *dyn Collidable) -> u8 {
        if other.type_id() == Rect::TYPE_ID {
            return collides_with_rect(self, other as *Rect);
        }
        return 0;
    }
}
```

### Trait Pointers in Data Structures

```rust
// Array of trait pointers
#[ram]
static mut ENTITIES: [*dyn Drawable; 32];

// Struct containing a trait pointer
struct Projectile {
    x: u8,
    y: u8,
    target: *dyn Damageable
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
static mut CURRENT_TARGET: *dyn Drawable = &PLAYER as *dyn Drawable;

#[ram]
static mut DRAW_LIST: [*dyn Drawable; 4] = [
    &PLAYER as *dyn Drawable,
    &ENEMY  as *dyn Drawable,
    0 as *dyn Drawable,
    0 as *dyn Drawable
];
```

The target must be a `static` or `static mut` variable. The `&` operator on a static yields a compile-time address.

## Method Dispatch

### Calling Methods

Call trait methods on trait pointers using dot notation:

```rust
let obj: *dyn Drawable = &player as *dyn Drawable;
obj.draw(X, Y);
let w: u8 = obj.get_width();
```


## Type Introspection

### type_id() Method

The `type_id()` method is available on any `*dyn Trait` pointer. It returns the `__type_id` byte stored at offset 0 of the object:

```rust
let obj: *dyn Drawable = &player as *dyn Drawable;
let id: u8 = obj.type_id();  // Returns Player's TypeId (e.g., 1)
```

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
fn handle_collision(obj: *dyn Drawable) {
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

let obj: *dyn Drawable = &player as *dyn Drawable;
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

## TypeId Limits

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

### Entity Draw List

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
static mut DRAW_LIST: [*dyn Drawable; 16];

fn game_update() {
    // Update all entities
    PLAYER.update();
    for i in 0..8 {
        ENEMIES[i].update();
    }

    // Draw all entities via trait dispatch
    for i in 0..16 {
        let d: *dyn Drawable = DRAW_LIST[i];
        if d != 0 as *dyn Drawable {
            d.draw(X, Y);
        }
    }
}
```

### Pairwise Collision with `type_id()` and Downcast

This example shows a heterogeneous object list, `type_id()` for type checking, and downcasting inside a trait method that accepts a `*dyn Trait` parameter.

```rust
struct Rect { x: u8, y: u8, w: u8, h: u8 }

trait Collidable {
    fn collides(*self, other: *dyn Collidable) -> u8;
}

// Plain helper - no trait dispatch overhead
fn collides_with_rect(a: *Rect, b: *Rect) -> u8 {
    if a.x < b.x + b.w {
        if b.x < a.x + a.w {
            if a.y < b.y + b.h {
                if b.y < a.y + a.h {
                    return 1;
                }
            }
        }
    }
    return 0;
}

impl Collidable for Rect {
    fn collides(*self, other: *dyn Collidable) -> u8 {
        // Check the concrete type of 'other' at runtime
        if other.type_id() == Rect::TYPE_ID {
            return collides_with_rect(self, other as *Rect);
        }
        return 0;  // Unknown type - no collision
    }
}

#[lowram]
static mut rects: [Rect; 3] = [
    Rect { x: 10, y: 10, w: 20, h: 20 },
    Rect { x: 25, y: 15, w: 15, h: 10 },
    Rect { x: 50, y: 50, w: 10, h: 10 },
];

#[lowram]
static mut ptrs: [*dyn Collidable; 3];

#[lowram]
static mut RESULT: [u8; 3] = [0, 0, 0];

#[entry]
fn main() {
    // Build the heterogeneous trait-pointer array
    ptrs[0] = &rects[0] as *dyn Collidable;
    ptrs[1] = &rects[1] as *dyn Collidable;
    ptrs[2] = &rects[2] as *dyn Collidable;

    // Pairwise collision detection
    for i in 0..ptrs.len() {
        let pi: *dyn Collidable = ptrs[i];
        for j in i+1..ptrs.len() {
            let pj: *dyn Collidable = ptrs[j];
            if pi.collides(pj) != 0 {
                RESULT[i] = 1;
                RESULT[j] = 1;
                break;
            }
        }
    }
    // RESULT = [1, 1, 0] — rects 0 and 1 overlap; rect 2 is isolated
}
```

Key points from this example:

- `*dyn Collidable` is used for both the array element type and the `other` parameter type.
- `other.type_id()` reads the `__type_id` byte at offset 0 through the trait pointer.
- `Rect::TYPE_ID` is a compile-time constant.
- `other as *Rect` is a zero-cost reinterpret cast — the address is unchanged; only the static type changes. `self` is already `*Rect` inside `impl Collidable for Rect` and needs no cast.

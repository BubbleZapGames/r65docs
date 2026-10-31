---
sidebar_position: 10
title: "Traits"
description: "R65 trait definitions, implementations, and TypeId-based dynamic dispatch."
---

# Traits

R65 traits provide TypeId-based dynamic dispatch for polymorphism. A plain struct that implements a trait automatically receives a `__type_id` byte at offset 0, enabling heterogeneous collections with fast, predictable dispatch. Types with no room for that byte — newtypes, fieldless enums, and `#[soa]` structs — implement traits for static dispatch only.

## Trait Definition

### Syntax

A trait declares a set of methods. Methods take `*self` as the first parameter:

```rust
trait Drawable {
    fn draw(*self, x: u16, y: u16);
    fn get_width(*self) -> u8;
}
```

A trait method's parameters after `self` are **stack-passed**. Register bindings (`x @ X: u16`) are rejected on trait methods, because dispatch needs one ABI that every implementor shares. Methods can return values.

In an `impl`, the receiver form follows the **implementing type** rather than the trait declaration. A plain struct implements `fn draw(*self)` with `*self`. A type that is passed by value implements the same declaration with bare `self`: a [newtype](./new_types.md) or a [fieldless enum](./enums.md#methods), because it is a scalar with nothing to point at, and an [`#[soa]` struct](./attributes.md#soa), whose `self` is the element index:

```rust
struct TileId(u8);

impl Drawable for TileId {
    fn draw(self, x: u16, y: u16) { }   // bare self -- the newtype's form wins
    fn get_width(self) -> u8 { return 8; }
}
```

### Default Method Bodies

A trait method may end in a body instead of `;`. The body is copied into every `impl` that omits the method, and an `impl` that provides its own definition overrides it:

```rust
trait Damageable {
    fn hp(*self) -> u8;

    fn is_dead(*self) -> bool {          // default body
        return self.hp() == 0;
    }
}

impl Damageable for Player {
    fn hp(*self) -> u8 { return self.hp; }
    // is_dead is inherited
}

impl Damageable for Enemy {
    fn hp(*self) -> u8 { return self.hp; }
    fn is_dead(*self) -> bool { return self.hp < 2; }   // overrides the default
}
```

A defaulted method is indistinguishable from a hand-written one: same mangled `Struct__method` symbol, same ABI, same vtable slot. Inside the body, `self.field` and `self.method()` bind **statically** to the implementing struct, so those calls are direct `JSR`/`JSL` rather than dispatch.

The cost is duplication -- the body is compiled once per implementor. N implementors means N copies of the code.

:::note
A default body declared with `*self` cannot be inherited by a [newtype](./new_types.md) implementor, which needs bare `self`. A newtype must supply its own definition of any defaulted method.
:::

### Far Traits (Default)

Functions are far by default, so a trait written with plain `fn` uses the JSL/RTL calling convention and can be dispatched from any bank. `far fn` on a trait method pins every implementation far, so the optimizer never makes one near:

```rust
trait Renderable {
    fn render(*self);
    fn get_bank(*self) -> u8;
}
```

### Near Traits

`near fn` opts a trait into the JSR/RTS convention. Its `*dyn` dispatch costs roughly half a far trait's (~10–12 cycles vs ~20–25: no `JML` trampoline), so a trait dispatched in a hot loop wants this — at the price of every implementor and caller living in one bank:

```rust
trait Updatable {
    near fn update(*self);
    near fn reset(*self);
}
```

Direct (non-`*dyn`) calls do not pay for the far default: at `-O1` and above a far method whose callers are all in its bank is demoted to `JSR`/`RTS`. Only dispatch keeps the `JSL`, because the wrapper's trampoline needs an `RTL` at the other end.

### Near/Far Exclusivity

A trait must be **entirely near or entirely far** — the dispatch wrapper is built once per trait. Mixing within a trait, or an impl method that disagrees with its trait, is a compile error:

```rust
// ERROR: trait 'Invalid' mixes near and far methods
trait Invalid {
    fn far_method(*self);          // far (default)
    near fn near_method(*self);    // Compile error
}

impl Renderable for Sprite {
    near fn render(*self) { }      // ERROR: trait declares it far
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
    fn draw(*self, x: u16, y: u16) {
        draw_sprite(self.sprite_id, x, y);
    }

    fn get_width(*self) -> u8 {
        return 16;
    }
}
```

### Rules

1. **Methods without a default body are required**: Every method declared with `;` must be implemented. Methods with a [default body](#default-method-bodies) may be omitted.
2. **Exact signature match**: Method signatures in the `impl` block must match the trait definition exactly (same parameter types and return type).
3. **TypeId insertion**: The compiler automatically inserts a `__type_id: u8` field at offset 0 of a plain struct. Newtype, fieldless-enum, and `#[soa]` implementors get no such field and support static dispatch only -- see [Newtypes and Traits](#newtypes-and-traits).

### Multiple Trait Implementation

A struct can implement multiple traits. It receives a single TypeId shared across all trait dispatch tables:

```rust
struct Enemy {
    x: u8,
    y: u8,
    damage: u8
}

impl Drawable for Enemy {
    fn draw(*self, x: u16, y: u16) { /* ... */ }
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
trait NearTrait { near fn method(*self); }
trait FarTrait { fn method(*self); }

struct MyStruct { data: u8 }

impl NearTrait for MyStruct { /* ... */ }  // OK
impl FarTrait for MyStruct { /* ... */ }   // ERROR: already has near trait
```

## Trait Inheritance (Supertraits)

A trait can require one or more **supertraits**, listed after a `:`:

```rust
trait Position { fn px(*self) -> u8; }
trait Sprite   { fn tile(*self) -> u8; }

trait Drawable: Position + Sprite {
    fn draw(*self);
}
```

### Requirement

Implementing a subtrait requires implementing every transitive supertrait, each in its
own `impl` block:

```rust
impl Position for Player { fn px(*self) -> u8 { return self.x; } }
impl Sprite   for Player { fn tile(*self) -> u8 { return 7; } }
impl Drawable for Player { fn draw(*self) { /* ... */ } }
// Omitting impl Position or impl Sprite for Player is a compile error.
```

### Calling Inherited Methods

A `*dyn Drawable` can call `Drawable`'s own methods **and** all inherited supertrait
methods. Inherited calls dispatch through the supertrait's own TypeId jump table:

```rust
let d: *dyn Drawable = &PLAYER;
d.draw();   // Drawable's own method
d.px();     // inherited from Position
```

### Upcasting

Every implementor carries a single TypeId byte at offset 0, so `*dyn Sub` and `*dyn Super`
to the same object are bit-identical. Upcasting is a zero-cost coercion:

```rust
let d: *dyn Drawable = &PLAYER;
let p: *dyn Position = d;   // upcast, no runtime cost
p.px();
```

### Rules

- Supertraits are named only on the trait declaration, never on `impl`.
- The supertrait graph must be acyclic.
- A subtrait may not redeclare a method or constant name from a transitive supertrait.
- A trait and its supertraits must share the same near/far calling convention.

## TypeId System

### Automatic Insertion

When a plain struct implements any trait, the compiler inserts a hidden `__type_id: u8` field at offset 0 (not for an `#[soa]` struct, which has no contiguous element). All declared fields shift by one byte:

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

A concrete struct pointer coerces to a trait pointer when the target type is known; an explicit `as *dyn Trait` cast is optional:

```rust
#[ram]
static mut PLAYER: Player;

let d: *dyn Drawable = &PLAYER;                  // coerces
let e: *dyn Drawable = &PLAYER as *dyn Drawable; // same, spelled out
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
    fn draw(*self, x: u16, y: u16);
}

impl Drawable for Player {
    const WIDTH: u8 = 16;
    const HEIGHT: u8 = 24;
    fn draw(*self, x: u16, y: u16) { /* ... */ }
}

impl Drawable for Bullet {
    const WIDTH: u8 = 4;
    const HEIGHT: u8 = 4;
    fn draw(*self, x: u16, y: u16) { /* ... */ }
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

## Associated Functions

An `impl` method that declares **no** `self` parameter is an associated function. It is called on the type, not on a value:

```rust
struct TileId(u8);

impl TileId {
    fn zero() -> TileId       { return TileId(0); }
    fn of(n: u8) -> TileId    { return TileId(n); }
}

let t: TileId = TileId::zero();
let u: TileId = TileId::of(7);
```

No receiver is passed and none is synthesized, so an associated function has the ABI of an ordinary free function -- the call is a plain `JSR`/`JSL` to the mangled `Type__name` symbol. This is how the standard library spells constructors, e.g. `Q10::from_int(100)`.

Associated functions live in inherent `impl` blocks. They are not part of a trait's interface and are not dispatched through `*dyn`.

## Newtypes and Traits

A [newtype](./new_types.md) **may** implement a trait, but only for **static dispatch**. Two consequences follow from a newtype being all payload with no room for a TypeId byte:

```rust
// OK -- resolved at compile time
impl Drawable for TileId {
    fn draw(self, x: u16, y: u16) { }
}

let d: far *dyn Drawable = &t as far *dyn Drawable;
// error: cannot form a '*dyn Drawable' over newtype 'TileId'
```

- No TypeId field is inserted for a newtype, so `type_id()` and downcasting do not apply.
- `impl Clone for TileId {}` is rejected as redundant -- a newtype copies with a plain assignment.

In practice the two shapes rarely meet: a trait implemented with by-value `self` (newtypes, fieldless enums, `#[soa]` structs) is used through static dispatch, and one implemented with `*self` by plain structs is the one that is dyn-able.

## Unions and Traits

A `union` may have inherent `impl` blocks, but **cannot implement a trait** -- dispatch stores a TypeId byte at offset 0, which is exactly where a union's field data lives. `impl Clone for MyUnion {}` is the one exception, since it is a bitwise copy of the union's size. See [Unions](./unions.md).

## TypeId Limits

The maximum number of distinct struct types with trait implementations is 255 (TypeId 0 is reserved for null/invalid).

## Limitations

1. **No generics**: Traits cannot be parameterized with types.
2. **No blanket impls**: A trait cannot be implemented for a whole category of types at once; write one `impl` per type.
3. **No associated types**: Only associated constants are supported.
4. **No trait bounds**: Function signatures cannot require trait implementations.
5. **Near/far exclusivity**: A struct cannot implement both near and far traits.
6. **Self by value only for by-value types**: Trait methods are declared with `*self`. A newtype, fieldless enum, or `#[soa]` struct implementor substitutes bare `self`; a plain struct cannot.

Supertraits (trait inheritance) **are** supported — see [Trait Inheritance](#trait-inheritance-supertraits).

## Complete Example

### Entity Draw List

```rust
trait Drawable {
    fn draw(*self, x: u16, y: u16);
}

trait Updatable {
    fn update(*self);
}

struct Player { x: u8, y: u8, sprite_id: u8 }
struct Enemy { x: u8, y: u8, health: u8 }

impl Drawable for Player {
    fn draw(*self, x: u16, y: u16) {
        draw_sprite(self.sprite_id, x, y);
    }
}

impl Updatable for Player {
    fn update(*self) { /* handle input */ }
}

impl Drawable for Enemy {
    fn draw(*self, x: u16, y: u16) {
        draw_sprite(0x10, x, y);
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
fn main() -> ! {
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
    loop {}
}
```

Key points from this example:

- `*dyn Collidable` is used for both the array element type and the `other` parameter type.
- `other.type_id()` reads the `__type_id` byte at offset 0 through the trait pointer.
- `Rect::TYPE_ID` is a compile-time constant.
- `other as *Rect` is a zero-cost reinterpret cast — the address is unchanged; only the static type changes. `self` is already `*Rect` inside `impl Collidable for Rect` and needs no cast.

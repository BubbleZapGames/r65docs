---
sidebar_position: 13
title: "Enums"
description: "R65 fieldless enums with methods, and tagged enums with struct payloads stored as tag and payload planes."
---

# Enums

R65 has two kinds of enum. A **fieldless** enum is a named integer constant — the C-style enum. A **tagged** enum carries data: each variant may name a struct, and a value is a discriminant plus that struct.

Both take `impl` blocks. What differs is the receiver, and that follows from how each is laid out.

## Fieldless Enums

### Definition

```rust
enum Direction {
    North = 0,
    East,       // 1 (auto-increment)
    South,      // 2
    West        // 3
}
```

Variant values can be explicitly specified or automatically incremented from the previous variant. If no value is specified, the first variant is `0` and each subsequent variant is one more than the previous:

```rust
enum SpriteFlags {
    FlipX = 0x40,
    FlipY = 0x80,
    Priority = 0x20
}
```

### Representation

The underlying representation is the **smallest integer type** that fits all variant values — `u8` if every value fits in `0..=255`, otherwise `u16`. Wherever a `u8` or `u16` is accepted, an enum of that width is too, and it is passed and stored exactly like that integer.

```rust
enum Small { A = 0, B = 255 }       // 1 byte, like u8
enum Large { A = 0, B = 256 }       // 2 bytes, like u16
```

### Usage

Variants are accessed with `::`, compared with `==` and `!=`, and cast to their integer type with `as`:

```rust
let dir = Direction::North;

if dir == Direction::North {
    move_up();
}

let value: u8 = Direction::East as u8;  // 1
```

Casting from an integer to an enum is not supported; use a `match` or a conditional chain.

### Match

Enums are commonly used as match scrutinees. When all variants are covered, no wildcard `_` arm is required:

```rust
let action: u8 = match dir {
    Direction::North => 0,
    Direction::East => 1,
    Direction::South => 2,
    Direction::West => 3,
};
```

### Methods

An `impl` block gives a fieldless enum methods. `self` is the discriminant itself, passed by value, so a method call costs nothing beyond the call — the same convention a [newtype](./new_types.md) uses, for the same reason: there is nothing to point at.

```rust
impl Direction {
    fn opposite(self) -> Direction {
        match self {
            Direction::North => Direction::South,
            Direction::East  => Direction::West,
            Direction::South => Direction::North,
            Direction::West  => Direction::East,
        }
    }

    fn start() -> Direction { Direction::North }    // associated fn — no self
}

let back = Direction::East.opposite();
```

`self` is passed the way a scalar return value is, so a method's other parameters follow the same rule as a [newtype](./new_types.md) method's. `*self` is an error: an enum is a value, not something to point at.

An all-constant `match` like `opposite` compiles to a **lookup table** — a single indexed load after a bounds check, not a dispatch.

## Tagged Enums

A variant may carry a payload, which is always a previously declared **struct**:

```rust
struct Circle { r: u8 }
struct Rect   { w: u8, h: u8 }

enum Shape {
    Empty,          // unit variant
    C(Circle),
    R(Rect),
}
```

There are no inline field lists and no positional tuples — a payload names a struct, so it has fields to reach through and can carry its own `impl` block.

Discriminants are assigned densely from 0. Writing `= n` on a tagged enum's variants is an error.

### Storage: two planes

A tagged enum lives in a `static mut`, and that static is split into two arrays — one for the tags and one for the payloads:

```rust
#[lowram]
static mut POOL: [Shape; 16];
//  ->  POOL__tag:  [u8; 16]      stride 1
//  ->  POOL__data: [_; 16]       stride = largest payload (2)
```

The payload plane is an array of a synthetic union with one member per payload variant, so its stride is the largest payload, rounded up to a power of two when that costs at most one byte per element (3 → 4, 7 → 8).

The point of the split is the tag. In an array-of-structs layout, reading element `i`'s tag would mean scaling `i` by the element size first. Here the tag plane strides by 1, so the raw index addresses it in one instruction with no multiply. Only a payload access scales the index, and only by the payload's own stride.

A single instance is a pool of one:

```rust
#[lowram]
static mut SHAPE: Shape;      // SHAPE__tag: [u8; 1], SHAPE__data: [_; 1]
```

A tagged enum backs **exactly one** static, and that static must be `static mut` in RAM (`#[zeropage]`, `#[lowram]`, or `#[ram]`) — an immutable `static` or `#[hw]` storage is rejected. Its methods hard-code their plane addresses, so declaring a second static of the same enum is a compile error, and so is an `impl` block on a tagged enum that has no static at all. The static takes no initializer — SNES RAM is unpredictable at power-on, so **write every element before matching on it**.

### No contiguous element

An element's bytes are split across two arrays, so there is nothing to copy, address, or hold. These are all rejected:

- a local or parameter of the enum type
- a field of the enum type in a plain struct (an [`#[soa]` struct](#a-field-of-an-soa-struct) is allowed)
- `&POOL[i]`
- `impl Clone`
- `impl Trait for` — dispatch stores a TypeId byte at offset 0, which is where the discriminant lives, the same reason [unions](./unions.md) cannot implement traits

Pass the element **index** instead — that is what a method receives.

### Construction

A variant is written directly into the planes: one store for the tag, one per payload field. There is no temporary to assemble and no block copy.

```rust
POOL[i] = Shape::C(Circle { r: 5 });    // tag store + one payload store
POOL[i] = Shape::Empty;                 // tag store only
```

The payload must be a struct literal. `Shape::C(TEMPLATE)` — copying in an existing struct — is rejected; write the fields.

### Matching

`match` on an element dispatches on its tag. A payload pattern binds the payload by name:

```rust
fn area(i: u16) -> u8 {
    return match POOL[i] {
        Shape::C(c) => c.r,
        Shape::R(r) => r.w,
        Shape::Empty => 0,
    };
}
```

The binding is a **view of the pool, not a copy**. `c.r` is one indexed load off the payload plane, and writing through it writes the pool:

```rust
match POOL[i] {
    Shape::C(c) => { c.r = c.r + 1; }   // increments POOL[i]'s payload
    _ => {}
};
```

A match must cover every variant or carry a `_`. Coverage is checked against the variants, not the tag's integer range, and an arm naming a different enum is rejected.

A payload binding cannot appear inside an or-pattern. Which variant matched decides how the payload bytes are typed, and no two payload variants share a type, so a binding spanning alternatives would read the wrong struct in one of them:

```rust
match POOL[i] {
    Shape::C(c) | Shape::R(r) => c.r,   // error: binds a payload inside an or-pattern
    Shape::Empty => 0,
}

Shape::C | Shape::Empty => 1,           // fine — no binding
```

### The discriminant as a value

Casting an element to an integer is not a conversion — it is a read of the tag plane, and that is all it compiles to:

```rust
let k: u16 = POOL[i] as u16;    // reads the tag plane, widened
let j: u8  = POOL[i] as u8;     // reads the tag plane
```

This makes a **per-kind table** the natural home for constants that vary by variant — one row per variant, addressed by the element's own tag:

```rust
struct Row { speed: u16, hp: u8, pad: u8 }      // 4 bytes: a power-of-two stride

static ROWS: [Row; 3] = [
    Row { speed:   0, hp:  0, pad: 0 },         // Shape::Empty
    Row { speed: 128, hp: 25, pad: 0 },         // Shape::C
    Row { speed: 192, hp: 12, pad: 0 },         // Shape::R
];

let speed = ROWS[POOL[i] as u16].speed;
```

The row order is the variant order, and nothing checks that for you. The alternative — a `match self` per column — generates a lookup table *per method* and pays a call to reach it.

Only an integer target is a tag read. `POOL[i] as *u8` is refused, as is a bare `POOL[i]`:

```
error: cannot use a whole element of tagged enum array 'POOL'
hint: a tagged enum element is a tag plus a payload in two separate planes,
      with no contiguous value; `match POOL[i]` to reach the payload, or
      `POOL[i] as u8` for the discriminant
```

### Methods

`self` is the element **index**, passed by value:

```rust
impl Shape {
    fn area(self) -> u8 {
        return match self {
            Shape::C(c) => c.r,
            Shape::R(r) => r.w,
            Shape::Empty => 0,
        };
    }
}

let a = POOL[2].area();
```

Passing the receiver is one instruction, the tag read is one instruction, and only the payload access scales the index.

Match strategy selection is the same as for any other scrutinee: a lookup table, a jump table, or a compare chain on the usual cost model (see [Match Expressions](./match-expressions.md)).

### A field of an `#[soa]` struct

A tagged enum cannot be a field of a plain struct — the element would have to be contiguous, which puts the stride multiply back on every tag read. It *can* be a field of an `#[soa]` struct. `#[soa]` lays every array of a struct out as one array per field, so the outer static splits into planes anyway and the enum simply contributes its own two:

```rust
struct Body { x: u16, hp: u8 }

#[soa]
struct Thing { body: Body, shape: Shape }

#[lowram]
static mut THINGS: [Thing; 8];
//  -> THINGS__body:        [Body; 8]
//  -> THINGS__shape__tag:  [u8; 8]       stride 1
//  -> THINGS__shape__data: [_; 8]
```

Everything works as for a standalone pool: `match THINGS[i].shape`, `THINGS[i].shape = Shape::C(..)`, `THINGS[i].shape as u8`, and `THINGS[i].shape.area()` — a method takes the *outer* array's index as its receiver.

This is the shape to reach for when every variant would otherwise carry the same fields: put the shared state **beside** the enum, not inside it. `THINGS[i].body.hp` is then a plain plane access needing no match.

The enum still backs exactly one storage — a static of its own or one `#[soa]` field, not both.

### `#[soa]` payloads

A payload struct may itself be `#[soa]`. The payload plane then stops being an array of union elements and becomes a **region** that every variant overlays with one plane per field, all indexed by the raw pool index with no scaling at all:

```rust
#[soa] struct Fireball { heat: u8, phase: u8 }
#[soa] struct Barrel   { rolling: u8 }

enum Kind { None, Barrel(Barrel), Fireball(Fireball) }

#[soa]
struct Enemy { kind: Kind, x: u8, vy: i8 }

#[lowram]
static mut POOL: [Enemy; 16];
//  -> POOL__kind__tag              [u8; 16]
//  -> POOL__kind__data             region, 32 bytes
//       POOL__kind__Barrel__rolling    region + 0
//       POOL__kind__Fireball__heat     region + 0    (same bytes as rolling)
//       POOL__kind__Fireball__phase    region + 16
```

Planes of different variants share bytes, exactly as union members do: element `i`'s payload bytes are still private to element `i`, they are just no longer adjacent.

What this buys is that a match arm never has to rescale the index, because every plane in reach strides by 1 — each field update below is a single indexed instruction:

```rust
impl Enemy {
    fn update(self) {
        match POOL[self].kind {
            Kind::Fireball(f) => { f.phase = f.phase + 1; self.vy = -1; }
            _ => {}
        };
    }
}
```

With plain payloads the same arm is thirteen instructions, because the payload plane strides by 2 and the shared planes by 1, so the index is recomputed on every switch between them.

The payload struct's own methods and trait impls take that pool index as `self` too — `f.burn()` from a match arm is a plain call with the index passed straight through, no pointer to build:

```rust
impl Hazard for Fireball {
    fn burn(self) -> u8 { self.heat = self.heat + 1; return self.heat; }
}

Kind::Fireball(f) => { self.x = f.burn(); }
```

Rules:

- **All or nothing.** Within one enum, either every payload struct is `#[soa]` or none is. Mixing is an error.
- **One storage, chained.** A `#[soa]` payload struct is stored only through its enum; a separate static of it, or using it as the payload of a second variant or enum, is refused.
- Every `#[soa]` restriction applies to the payload struct: no locals, parameters, `&`, `*self`, whole-element copies, or `impl Clone`. Construction must spell out the fields.
- Static dispatch only; `*dyn` over an SoA element is not supported.

## Limits

- **No initializers** on a tagged enum static — write every element before matching on it.
- **One static per tagged enum type.**
- **A payload must be a declared struct** — plain or `#[soa]`, not mixed within one enum — not a union, newtype, enum, primitive, array, or pointer.
- **No `= n`** on a tagged enum's variants.
- **No payload binding inside an or-pattern** — give the variant its own arm.
- A payload cannot be copied in from an existing struct; write the fields.

## See Also

- [Match Expressions](./match-expressions.md) — patterns and exhaustiveness
- [Structs](./structs.md) — payload structs and `impl` blocks
- [Unions](./unions.md) — the payload union's layout rule and the offset-0 argument against traits
- [Newtypes](./new_types.md) — the other value-`self` receiver

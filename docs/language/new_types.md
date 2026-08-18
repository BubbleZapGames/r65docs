---
sidebar_position: 11
title: "Newtypes"
description: "R65 newtypes: nominal names for register-sized scalars, with by-value methods and zero runtime cost."
---

# Newtypes

A **newtype** is a struct declaring exactly one unnamed field, which must be a register-sized scalar. It gives that scalar its own name in the type system while staying that scalar at runtime.

```rust
struct TileId(u8);
struct Q10(i16);
```

A newtype is **not an aggregate**. A `TileId` is one byte in a register: it passes and returns by value, assigns with a plain `=`, and its methods take `self` by value. Nothing about the generated code differs from using the bare payload type.

## Why Newtypes Exist

R65 offers three ways to name a scalar, and they trade off differently:

```rust
type q10 = i16;              // transparent: `q10 + i16` type-checks
struct Q10v { value: i16 }   // nominal, but an aggregate: passed as *Q10v
struct Q10(i16);             // nominal AND free
```

| Form | Distinct to the checker? | Pass semantics | Runtime cost |
|------|--------------------------|----------------|--------------|
| `type Alias = T` | No | Same as `T` | None |
| `struct S { f: T }` | Yes | By reference (`*S`) | Pointer indirection |
| `struct S(T)` | Yes | By value, in a register | None |

The newtype is the only form that is both nominal and free. Use it when a raw number carries a meaning the compiler should enforce — a tile index, a fixed-point value, a frame counter.

## Payload Types

The payload must be a scalar that fits in a register.

| Allowed | Rejected |
|---------|----------|
| `u8` `i8` `bool` | Structs and unions |
| `u16` `i16` | Arrays |
| Any enum | `far *T` (3 bytes) |
| Any near pointer (`*T`) | Another newtype |

```rust
struct Facing(Direction);    // enum payload — OK
struct Handle(*Sprite);      // near pointer payload — OK

struct Ref(far *u8);
// error: newtype 'Ref' wraps 'far *u8', which is 3 bytes

struct Celsius(Temp);
// error: newtype 'Celsius' cannot wrap another newtype 'Temp'
//   hint: wrap the payload type directly: 'struct Celsius(i16);'
```

Declaring two or more unnamed fields is not a newtype and is rejected outright:

```rust
struct Point(u8, u16);
// error: a newtype wraps exactly one field
//   hint: give each field a name: 'struct Point { field0: u8, field1: u16 }'
```

## Transparent In, Opaque Out

The conversion rule is one-directional. Payload values flow **into** a newtype implicitly; a newtype never flows **out** without an explicit `.0` or `as`.

```rust
let t: TileId = 5;        // OK — payload flows in
let u: TileId = t + 1;    // OK — result stays a TileId

let n: u8 = t;
// error: type mismatch in let binding: expected u8, found TileId

let n: u8 = t.0;          // OK — explicit unwrap, 0 cycles
let n: u8 = t as u8;      // OK — same
```

`.0` is the payload accessor. It is **read-only** — assign the whole value instead of writing through it. Any index other than `0` is an error, and `.0` on a named-field struct is too.

The rule holds in every position that checks a type, including function returns, so a newtype cannot launder itself back into its payload on the way out:

```rust
fn a() -> i16 { let q: Q10 = 5; return q; }   // error: returning 'Q10' from '-> i16'
fn b() -> i16 { let q: Q10 = 5; return q.0; } // OK
fn c() -> Q10 { let n: i16 = 5; return n; }   // OK — transparent in
```

## Construction and Casting

`Q10(x)` and `x as Q10` both compile to nothing. They differ only in strictness: construction is checked exactly like an assignment into the payload, while `as` truncates the way it does for any other type.

```rust
let t = TileId(5);        // construction
let t = TileId(300);
// error: integer literal 300 does not fit in type u8 (valid range: 0 to 255)

let t = 300 as TileId;    // OK — `as` is the truncating spelling
```

| Cast | Behavior |
|------|----------|
| `Newtype as T` | Unwrap to the payload (0 cycles) |
| `T as Newtype` | Wrap, truncating if the payload is narrower |

## Operators

A newtype **inherits** its payload's operators, and the result keeps the nominal type:

```rust
let a: TileId = 5;
let b: TileId = a + 1;    // TileId
let c: TileId = ~a;       // unary operators too
let d: TileId = a << 2;
let e: bool   = a < b;    // comparisons still yield bool
```

Two different newtypes never mix, even with identical payloads:

```rust
struct Q10(i16);
struct Ticks(i16);

let a: Q10 = 5;
let b: Ticks = 6;
let c = a + b;
// error: operator '+' has mismatched types 'Q10' and 'Ticks'
//   hint: newtypes never mix; unwrap one side explicitly (e.g. 'Ticks(lhs.0 + rhs.0)')
```

Operators cannot yet be **overridden** — see [Current Limitations](#current-limitations).

## Using Newtypes

A newtype is usable anywhere a scalar of the same width is.

```rust
struct TileId(u8);

const BLANK: TileId = 0;             // const, payload flows in

#[zeropage]
static mut CURRENT: TileId;          // static

#[ram]
static mut MAP: [TileId; 8];         // array element

struct Holder { a: u8, t: TileId }   // struct field

fn bump(t @ A: TileId) -> TileId {   // register-bound parameter and return
    return t + 1;
}
```

Note that an enum payload can bind a register even though a bare enum cannot — `fn f(d @ A: Facing)` is accepted where `fn f(d @ A: Direction)` is not, because a newtype is a value type by design.

### Match

`match` sees through to the payload for patterns, and reports exhaustiveness under the newtype's own name:

```rust
match tile {
    0 => { }
    1..5 => { }
    _ => { }
}
```

```rust
match tile { 0 => { } }
// error: Non-exhaustive match on TileId: add a wildcard pattern '_' to cover remaining values
```

A `bool` payload is exhaustive with `true` and `false`; an enum payload with all its variants.

## Methods

Newtype methods take **bare `self`**, by value, bound to the accumulator. Associated functions (no `self`) work as usual.

```rust
struct TileId(u8);

impl TileId {
    fn zero() -> TileId       { return TileId(0); }   // associated fn
    fn raw(self) -> u8        { return self.0; }
    fn bumped(self) -> TileId { return TileId(self.0 + 1); }
    fn is_blank(self) -> bool { return self.0 == 0; }
}

let t = TileId::zero();
let u = t.bumped().bumped();     // chains
CURRENT = CURRENT.bumped();      // receiver may be a static
```

`bumped` is the whole method — `self` arrives in `A` and the result leaves in `A`:

```asm
TileId__bumped:
    .ACCU 8
    .INDEX 16
    INC A
    RTS
```

`raw` is a retype of a value already in `A`, so it inlines away to nothing at the call site.

Mutation is expressed by returning a new value. There is no in-place form.

### Rules for `self`

**One self form per type.** A newtype always takes bare `self`; a struct or union always takes `*self`. Writing the other form is an error either way:

```rust
impl TileId { fn raw(*self) -> u8 { return self.0; } }
// error: method 'TileId::raw' takes '*self', but 'TileId' is a newtype
//   hint: newtype methods take 'self' by value: 'fn raw(self) -> TileId'
```

**Neither `A` nor `B` is available to a parameter.** `B` is the accumulator's high byte, not a register of its own, so `self` in `A` claims both:

```rust
impl TileId { fn add(self, n @ A: u8) -> TileId { return TileId(self.0 + n); } }
// error: parameter 'n' of 'TileId::add' binds A, which holds 'self'
//   hint: a newtype method receives 'self' by value in A; bind 'n' to X or Y,
//         or pass it on the stack
```

Bind the parameter to `X`/`Y` or pass it on the stack instead. The restriction is specific to a by-value `self` — `*self` methods are stack-passed and claim neither register, and free functions may still bind `@ B` freely.

**A 2-byte payload enters in m16**, exactly as `@ A: u16` does for a free function. An associated function with no `self` gets no synthesized receiver, so it stays in m8.

**A pointer payload auto-dereferences through `.0`:**

```rust
struct Handle(*Sprite);
impl Handle { fn x(self) -> u8 { return self.0.x; } }
```

Unlike trait methods — which receive `*self` in `Y` and are never inlined — newtype methods are ordinary static-dispatch functions and remain inlinable.

## Traits

A newtype **may** implement a trait, but only for **static dispatch**. The impl's receiver form follows the implementing type rather than the trait declaration, so a newtype implements a `*self`-declared trait with bare `self`:

```rust
trait Drawable { fn draw(*self); }

impl Drawable for TileId {
    fn draw(self) { }        // bare self — the newtype's form wins
}
```

Forming a `*dyn` pointer over a newtype is rejected. Dynamic dispatch reads a TypeId byte at offset 0 of the pointee, and a newtype is all payload:

```rust
let d: far *dyn Drawable = &T as far *dyn Drawable;
// error: cannot form a '*dyn Drawable' over newtype 'TileId'
//   hint: dynamic dispatch reads a TypeId byte at offset 0, and a newtype is
//         all payload; call the method directly on the newtype instead
```

In practice the two rarely meet: a trait whose methods take `self` by value can only be implemented by a newtype, and one taking `*self` only by a struct, so a trait is naturally either dyn-able or newtype-able.

`Clone` is rejected for a different reason — it is redundant, not impossible:

```rust
impl Clone for TileId {}
// error: newtype 'TileId' cannot implement Clone
//   hint: newtypes are copied by plain assignment: 'let b = a;'

let b: TileId = a;    // copying needs no impl
```

Name-based resolution still reaches a newtype. `format!("{s}", x)` resolves `to_string` by name rather than by trait dispatch, so an *inherent* `to_string` on a newtype works — with no vtable and `self` by value.

## Cost

Zero. Construction, `.0`, and `as` are all pure retypes that emit no instructions, and the payload lives in a virtual register like any other scalar. Code generated for a newtype is identical, instruction for instruction, to code generated for its payload type.

## Current Limitations

**Operators cannot be overridden.** A newtype inherits its payload's operators but cannot replace them. `struct Q10(i16)` therefore gets integer multiply, when its multiply is semantically `(a * b) >> 6` — which is why the standard library spells scaling multiply and divide as `a.mul(b)` and `a.div(b)`. The operator traits all take `*self`, which a newtype does not have.

**No far-pointer payload.** `struct Handle(far *Sprite);` is 3 bytes and does not fit the return-register budget.

**No nesting.** `struct Celsius(Temp);` is rejected.

## Complete Example

`Q10` from the standard library (`stdlib/Q10.r65`) is a signed 10.6 fixed-point type — a distinct type at compile time, an ordinary 16-bit value at runtime:

```rust
struct Q10(i16);

const Q10_ONE: Q10 = 64;              // 1.0 on the Q10.6 scale
const Q10_FRAC_MASK: i16 = 0x3F;      // plain i16: it selects bits, it is not a value

impl Q10 {
    #[inline(always)]
    far fn from_int(n: i16) -> Q10 {
        return Q10(n << 6);
    }

    #[inline(always)]
    far fn from(n: i16, f: u8) -> Q10 {
        return Q10((n << 6) | ((f as i16) & Q10_FRAC_MASK));
    }

    #[inline(always)]
    far fn to_int(self) -> i16 {
        if self.0 < 0 {
            return 0 - (((0 - self.0) + 63) >> 6);
        }
        return self.0 >> 6;
    }
}

#[zeropage]
static mut VELOCITY: Q10;

fn update() {
    let player_x: Q10 = Q10::from_int(100);   // 100.0
    VELOCITY = Q10::from(0, 32);              // 0.5 (32/64)

    let next: Q10 = player_x + VELOCITY;      // + and < inherited from i16
    let screen_x: i16 = player_x.to_int();    // 100, explicitly unwrapped
}
```

An `i16` flowing *into* a `Q10` is accepted; a `Q10` will not pass where an `i16` is wanted, and will not mix with another newtype — so a scaled value cannot silently be consumed as a raw count.

## See Also

- [Types](./types.md) — the full type system, conversions, and checking rules
- [Structs](./structs.md) — named-field aggregates and `*self` methods
- [Traits](./traits.md) — TypeId-based dynamic dispatch
- [ABI Models](../platform/abi-models.md) — parameter passing and register conventions

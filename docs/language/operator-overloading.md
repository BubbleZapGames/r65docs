---
sidebar_position: 11
title: "Operator Overloading"
description: "Make your structs work with +=, ==, <, and the other operators, and copy them with Clone."
---

# Operator Overloading

Operator overloading lets your `struct` types work with built-in operators like
`+=`, `==`, and `<`. You opt in by implementing the matching trait — there is no
trait to declare, you just write the `impl`. This is what lets the stdlib's
multi-byte number types read naturally:

```rust
score += bonus;
if score >= target { win(); }
```

## Compound Assignment Operators

These operators update the left operand in place. Implement the trait whose
method takes `*self` plus one right-hand operand:

| Operator | Trait | Method |
|----------|-------|--------|
| `+=` | `AddAssign` | `add_assign` |
| `-=` | `SubAssign` | `sub_assign` |
| `*=` | `MulAssign` | `mul_assign` |
| `/=` | `DivAssign` | `div_assign` |
| `%=` | `RemAssign` | `rem_assign` |
| `&=` | `BitAndAssign` | `bitand_assign` |
| `\|=` | `BitOrAssign` | `bitor_assign` |
| `^=` | `BitXorAssign` | `bitxor_assign` |
| `<<=` | `ShlAssign` | `shl_assign` |
| `>>=` | `ShrAssign` | `shr_assign` |

```rust
impl AddAssign for I32 {
    fn add_assign(far *self, other: far *I32) {
        self.add(other);          // update the receiver in place
    }
}
```

The left operand must be a writable place (local, static, field, or deref).
Unlike the primitive operators, `*=` and `/=` accept any operand here (no
power-of-2 restriction) and `<<=`/`>>=` accept a runtime shift amount.

## Comparison Operators

| Operators | Trait | Method |
|-----------|-------|--------|
| `==`, `!=` | `PartialEq` | `eq(*self, rhs) -> bool` |
| `<`, `<=`, `>`, `>=` | `PartialOrd` | `cmp(*self, rhs) -> i8` |

You only implement `eq` and `cmp` — `!=`, `<=`, `>`, and `>=` come for free.
`cmp` is a three-way compare: return a negative number when `self < rhs`, `0`
when equal, and a positive number when `self > rhs`.

```rust
impl PartialEq  for I32 { fn eq(far *self, other: far *I32) -> bool { return self.cmp(other) == 0; } }
impl PartialOrd for I32 { fn cmp(far *self, other: far *I32) -> i8  { /* ... */ } }
```

The result is an ordinary `bool`, so it composes with `&&`, `||`, `if`, and
`while` like any other comparison.

```rust
if score >= target && lives > ZERO {
    advance_level();
}
if score != high_score {
    high_score.clone_from(&score);
}
```

## On Your Own Structs

The same pattern works for any struct. Each method takes a pointer to `self` and
a pointer to the other operand; use `far *self` when the value lives in RAM,
`*self` otherwise (see [near vs far self](structs.md#methods-and-impl-blocks)):

```rust
struct Vec2 { x: i16, y: i16 }

impl AddAssign for Vec2 {
    fn add_assign(*self, other: *Vec2) {
        self.x = self.x + other.x;
        self.y = self.y + other.y;
    }
}

impl PartialEq for Vec2 {
    fn eq(*self, other: *Vec2) -> bool {
        return self.x == other.x && self.y == other.y;
    }
}

fn step(pos: *Vec2, vel: *Vec2) {
    *pos += *vel;
    if *pos == ORIGIN { reset(); }
}
```

## Copying With Clone

Structs and arrays are passed by reference and are **not** copied by a bare `=`.
To copy one, implement `Clone`:

```rust
impl Clone for Player {}                       // empty body = copy every byte

impl Clone for Enemy {                          // custom copy logic
    fn clone_from(*self, src: *Enemy) { /* ... */ }
}
```

Then copy in one of two ways:

```rust
dst.clone_from(&src);                           // copy into an existing value
let c = a.clone();                              // create a new value from a
let grid2 = grid.clone();                       // arrays clone without any impl
```

- `.clone()` is allowed only as the initializer of a `let`, or assigned to an
  existing struct/array.
- `clone_from` writes into `*self`, which must be writable.
- Arrays clone automatically — you do not (and cannot) write `impl Clone` for an
  array type.

## Limitations

- **No value-producing form.** `let c = a + b` is not available for structs —
  use the in-place form: `c = a; c += b;`.
- **One operand type per operator.** To combine a struct with a different type
  (e.g. add a `u16` to an `I32`), call a named method like `score.add_u16(1)`
  instead of `+=`.
- **`&&`, `||`, `!`** work only on `bool` and cannot be overloaded.
- Indexing (`[]`) and dereference (`*`) operators cannot be overloaded.

## See Also

- [Structs](structs.md) — methods, and near vs far `self`.
- [Traits](traits.md) — user-defined traits and dynamic dispatch.
- [Math Library](../platform/math.md) — `I32`/`U32`/`F32`, the ready-made overloaded number types.

---
slug: fast-polymorphic-object-pools
title: "The Power of Fast Polymorphic Object Pools"
authors: [nathan]
tags: [r65, snes, design]
---

![Strike Force Raiders: the player's helicopter flies over a column of infantry and tanks marching on the enemy](/img/blog/strike-force-raiders.png)

I went looking for a project that would push the R65 compiler's code generation as hard as possible. The result is [Strike Force Raiders](https://github.com/nathancassano/strike-force-raiders), a helicopter tug-of-war for the SNES, written in R65. Each side buys tanks, vans, missile launchers, infantry and engineers, and they march across the desert toward the other side's base while the helicopters fight overhead. On a busy frame the game updates 32 ground units, two airframes, the structures, the munitions and the paratroopers, and draws all of it, within the CPU budget that every SNES game gets.

As in many retro games, most of that work is one loop over an object pool. This post looks at how the game lays its pools out: first with `#[soa]`, which turns an array of structs into one array per field, and then with tagged enums, which give each kind of unit its own fields without paying for a pointer or a vtable. Together they let a pool hold several kinds of object and still compile every field access to a single instruction. Here is how that performance is achieved.

<!-- truncate -->

## The cost of an array of structs

Here is the game's ground unit written the obvious way, as a plain struct. The fields only some kinds use (a tank's reload timer, a launcher's one missile, a rifleman's firing pose) are flattened into the record:

```rust
struct Unit {
    kind:   u8,     // unit kind
    hp:     u8,
    x_px:   u16,
    owner:  u8,
    block:  u8,     // traffic control: halted behind the unit ahead
    rank:   u8,
    ahead:  u8,     // march order, as a list through the pool
    behind: u8,
    reload: u8,     // tank, infantry
    hold:   u8,     // tank
    target: u8,     // tank
    armed:  u8,     // launcher
    pose:   u8,     // infantry
}

static mut units: [Unit; 32];

fn count_live() -> u8 {
    let mut n: u8 = 0;
    for i in 0..32 {
        if units[i].kind != 0 { n = n + 1; }
    }
    return n;
}
```

The record is 14 bytes, so `units[i].kind` is at `units + i * 14`. The 65816 has no multiply instruction, which makes array access slow: the compiler builds `i * 14` as `i * 16 - i * 2` from shifts, a complement and an add, and does that again on every pass of the loop:

```asm
count_live__L2:
    LDA $01,S              ; i
    ASL A                  ; i * 16
    ASL A
    ASL A
    ASL A
    STA $03,S
    LDA $01,S
    ASL A                  ; i * 2
    EOR #$FFFF
    SEC
    ADC $03,S              ; i * 16 - i * 2
    TAX
    SEP #$20
    LDA units,X            ; units[i].kind
    BEQ count_live__L5
    INY
count_live__L5:
    REP #$20
    LDA $01,S
    INC A
    STA $01,S
    CMP #$20
    BCC count_live__L2
```

Only the `LDA units,X` is the read the loop is for. Everything else is address arithmetic, the mode switches it needs, and a loop counter that has to live on the stack because X is busy holding the scaled offset. If the struct were 16 bytes the multiply would be four shifts, which is why a hand-written 65816 game pads its tables to power-of-two strides. That fixes the multiply, but it wastes RAM and the index still has to be scaled. This layout has its uses, but fast access isn't one of them.

## Step 1: `#[soa]`

Enter structure of arrays, or SoA as programmers usually call it. R65 lets you keep the struct declaration and change only its layout. Put `#[soa]` on the struct and every array of it is stored as one array per field, called a *plane*:

```rust
#[soa]
struct Unit {
    kind:   u8,
    hp:     u8,
    x_px:   u16,
    // ... the same fields
}

static mut units: [Unit; 32];
// units__kind: [u8; 32], units__x_px: [u16; 32], units__hp: [u8; 32], ...
```

The source doesn't change: `units[i].kind` still reads the kind of unit `i`. What changes is the address. It is now `units__kind + i`, so the element index scales by the field's size, which is 1 for every byte field and needs no arithmetic at all. The same `count_live` compiles to this:

```asm
    LDY #$00
    LDX #$00
count_live__L2:
    LDA units__kind,X
    BEQ count_live__L5
    INY
count_live__L5:
    INX
    CPX #$20
    BCC count_live__L2
    TYA
    RTS
```

The loop counter is the index register and the read is a single `LDA abs,X`, the cheapest indexed load the CPU has. A write is just as short. Here is `units[i].hp = units[i].hp - dmg` with `i` in X and `dmg` in A:

```asm
hurt:
    EOR #$FF               ; A = -dmg - 1
    SEC
    ADC units__hp,X        ; hp - dmg
    STA units__hp,X
    RTS
```

Measured in CPU cycles on R65's test emulator:

| Operation | Array of structs | `#[soa]` | Speed-up |
|---|---|---|---|
| Scan 32 slots for live units | 2,256 cycles (70.5 per slot) | 531 cycles (16.6 per slot) | 4.2× |
| `hurt(i, dmg)`, call included | 86 cycles | 35 cycles | 2.5× |

Strike Force Raiders measured the same effect in the real game. With the unit pool stored as records, the game loop managed only 0.75 ticks a frame under a full field, so it fell one frame behind in every four. Stored as planes, it held a full 1.00. Hoisting a pointer to the record, the usual workaround, won back only 0.02 of that: a field read through a pointer is an indirect load, and the plane read is still `LDA abs,X`.

### Methods take an index, not a pointer

An element of an `#[soa]` array has no single address, so a method on an `#[soa]` struct receives `self` as the element **index**, in X. A field access inside the method is then one instruction. The game keeps both helicopters, the player's and the enemy's, in one two-element pool:

```rust
const HELI: u16 = 0;      // the player's airframe
const FOE:  u16 = 1;      // the enemy's

#[soa]
struct Airframe {
    x_px: u16, y: u16, vx: Q10, vy: Q10,
    hp: u8, hp_t: u8, fuel: u8, fuel_t: u8,
    gun: u8, gun_t: u8, bombs: u8, bomb_t: u8,
    // ... 33 fields, 45 bytes in all
}
static mut airframes: [Airframe; 2];

impl Airframe {
    // On the pad: count each store's refill timer down, and top it up
    // when its timer runs out.
    fn rearm(self) {
        if self.fuel_t > 0 { self.fuel_t = self.fuel_t - 1; }
        else { /* refill fuel */ }
        if self.gun_t > 0 { self.gun_t = self.gun_t - 1; }
        else { /* reload the gun */ }
        // ... bombs and hit points the same way
    }
}

airframes[HELI].rearm();
airframes[FOE].rearm();
```

As an array of structs, a 45-byte record would mean a multiply by 45, or padding it out to 64 bytes. As planes, every test and decrement in `rearm` is one instruction on X:

```asm
Airframe__rearm:
    LDA airframes__fuel_t,X
    BEQ Airframe__rearm__L3
    DEC airframes__fuel_t,X
Airframe__rearm__L2:
    LDA airframes__gun_t,X
    BEQ Airframe__rearm__L8
    DEC airframes__gun_t,X
Airframe__rearm__L7:
    LDA airframes__bomb_t,X
    BEQ Airframe__rearm__L14
    DEC airframes__bomb_t,X
    ; ...
```

Code that knows which airframe it wants writes `airframes[HELI].fuel` with a constant index, and that compiles to a plain absolute address, the same instruction a separate `static mut HELI_FUEL: u8` would get. Code shared by both sides becomes a method instead of two copies.

### Constant tables are pools too

`#[soa]` also works on an immutable static. The static then becomes one ROM table per field. The game keeps everything fixed about a kind of unit in one such table, with one row per kind:

```rust
#[soa]
struct UnitStat {
    width:      u16,      // collision and traffic-control reach
    tile:       u8,       // left OBJ cell
    max_hp:     u8,
    cells:      u8,       // OBJ cells across: 1 for a man, 2 for a vehicle
    bullet_dmg: u8,       // helicopter gunfire
    rifle_dmg:  u8,       // infantry gunfire: nothing against armour
}

static unit_stats: [UnitStat; 6] = [
    UnitStat { width: 0,      tile: 0,              max_hp: 0,  cells: 0, bullet_dmg: 0, rifle_dmg: 0 },
    UnitStat { width: UNIT_W, tile: UNIT_TILE_TANK, max_hp: 25, cells: 2, bullet_dmg: 1, rifle_dmg: 0 },
    // ... van, launcher, infantry, engineer
];
```

A lookup is `unit_stats[units[i].kind as u16].tile`: read the kind from its plane, then read the tile column at that index.

```asm
    LDA units__kind__tag,Y          ; the unit's kind
    AND #$FF
    TAX
    SEP #$20
    LDA.l unit_stats__tile_data,X   ; its tile
```

The table has no rows in ROM, only columns, so a byte column is read at stride 1 and nothing is scaled.

## Step 2: polymorphism with tagged enums

Planes solve the stride problem, but the flattened `Unit` has a second problem. `reload`, `hold`, `target`, `armed` and `pose` belong to particular kinds, yet every slot carries all five. The game started out that way: its tank reload timer was a pool-wide array that four kinds out of five never touched. What the pool needs is a way for each kind to carry its own fields, while the pool stays one array that a single index walks.

Strike Force Raiders does this with a tagged enum. Each variant names a struct that holds what only that kind has, and the kinds with nothing of their own are plain variants:

```rust
#[soa] struct Tank     { reload: u8, hold: u8, target: u8 }
#[soa] struct Launcher { armed: u8 }
#[soa] struct Infantry { reload: u8, pose: u8 }

enum UnitType {
    Free,                   // variant 0: an empty slot is a zero tag
    Tank(Tank),
    Van,
    Launcher(Launcher),
    Infantry(Infantry),
    Engineer,
}

#[soa]
struct Unit {
    kind:   UnitType,
    hp:     u8,
    x_px:   u16,
    owner:  u8,
    block:  u8,
    rank:   u8,
    ahead:  u8,
    behind: u8,
}

static mut units: [Unit; 32];
```

A tagged enum stored in a pool is split into two planes, a **tag** plane and a **payload** plane. The payload structs are `#[soa]` too, so each variant's fields become planes laid over the payload region, and variants share bytes where their fields have the same width. Here is the layout the compiler gives the unit pool:

```asm
.DEFINE units__kind__tag  $0200  ; 32 bytes
.DEFINE units__kind__data $0220  ; 128 bytes: the variants' planes, overlaid
.DEFINE units__hp         $02A0  ; 32 bytes
.DEFINE units__x_px       $02C0  ; 64 bytes
; ... owner, block, rank, ahead, behind

.DEFINE units__kind__Tank__reload     $0220  ; overlay
.DEFINE units__kind__Infantry__reload $0220  ; overlay
.DEFINE units__kind__Launcher__armed  $0220  ; overlay
.DEFINE units__kind__Tank__hold       $0240  ; overlay
.DEFINE units__kind__Infantry__pose   $0240  ; overlay
.DEFINE units__kind__Tank__target     $0260  ; overlay
```

The tag plane has a stride of 1, and `Free` is tag 0, so "is this slot live?" is one load and a branch on zero. This is the loop at the core of `unit_update`, stepping over empty slots:

```asm
unit_update__L12:
    LDA units__kind__tag,X
    BNE unit_update__L17      ; live: dispatch on the kind
unit_update__L14:
    INX
    CPX #$20
    BCC unit_update__L12
```

### Matching and payload methods

`match` on a pool element compares the tag, and a payload pattern such as `UnitType::Infantry(f)` doesn't copy anything. `f` is a *view* of the payload planes at the same index. A method on a payload struct takes that index as `self`, in X, just like the `Airframe` methods:

```rust
impl Infantry {
    // Drop last frame's firing pose and count the reload down.
    // Returns 1 once the rifle is ready.
    fn process(self) -> u8 {
        self.pose = 0;
        if self.reload > 0 {
            self.reload = self.reload - 1;
            return 0;
        }
        return 1;
    }
}

fn unit_rifle(i: u16) {
    match units[i].kind {
        UnitType::Infantry(f) => {
            if f.process() != 0 {
                // find a target, fire, and f.reload = INF_RELOAD
            }
        }
        _ => {}
    };
}
```

The match is a `CMP #$04` on the tag, and the method is four instructions over X with no pointer anywhere:

```asm
Infantry__process:
    STZ units__kind__Infantry__pose,X
    LDA units__kind__Infantry__reload,X
    BEQ Infantry__process__L2
    DEC units__kind__Infantry__reload,X
    LDA #$00
    RTS
Infantry__process__L2:
    LDA #$01
    RTS
```

Building a unit is an assignment of a variant, which stores the tag and each payload field:

```rust
units[i].kind = UnitType::Tank(Tank { reload: 0, hold: 0, target: UNIT_MAX as u8 });
```

The tag also serves as the row index for the `unit_stats` ROM table above. So the three declarations split a unit three ways: `Unit` holds what changes as it moves, `UnitType` says what it is and holds what only that kind carries, and `UnitStat` holds what is fixed about its kind. All three use the same index.

## The rules that make it fast

Both layouts get their speed from one property: an element has no contiguous address. That shows up in a few rules:

- **One static per type.** A `#[soa]` struct or a tagged enum backs exactly one static. That is what lets a method hard-code its plane addresses and take only an index.
- **No pointers to elements.** `&units[i]` is rejected, and so are locals and parameters of the type and whole-element copies. You pass the index instead.
- **Initialize before you match.** A tagged-enum pool takes no initializer, so `unit_init` writes `UnitType::Free` into every slot at the start of a mission.
- **A variant isn't a value.** A tagged variant can't sit in a local or a table, so the game's spawn orders are a plain fieldless enum, and `unit_spawn` is the one place where an `Order` becomes a `UnitType`.
- **Payload methods see only their own fields.** Code that needs a unit's position as well as its kind's state, such as the tank's targeting sweep, is written against the pool and matches on the kind.

These rules match how an object pool on a 65816 is already written by hand: parallel tables, one index register, and a type byte. `#[soa]` and tagged enums let you write the pool as a struct and an enum, and the compiler checks that every access lines up with that layout.

## Conclusion

An object pool is where a SNES game spends most of its frame, and on the 65816 the cost of a pool comes down to how it is addressed. A record layout pays for a multiply on every access; planes pay nothing, because the index register already holds the address offset. `#[soa]` gets you that layout from an ordinary struct declaration: the scan over the unit pool ran 4.2× faster, a field write 2.5× faster, and in the real game the unit pool went from costing one frame in four to fitting in every frame.

Tagged enums carry the same layout over to pools that hold more than one kind of object. The tag is one byte at stride 1, so "is this slot live?" and "what kind is it?" are one load and a compare. Each kind keeps only its own fields, the variants share the bytes, and a payload method still works on one index in X. Strike Force Raiders splits a unit into what changes (`Unit`), what it is (`UnitType`) and what is fixed about its kind (`UnitStat`), and all three are read with the same index.

None of this is new to 65816 programmers, who have written parallel tables and type bytes by hand for decades. What R65 adds is that you write the pool as a struct and an enum, and the compiler lays out the planes and checks that every access matches them. If you are writing a game with more than a handful of moving objects, start with an `#[soa]` pool and a tagged enum for its kinds, and see what's left of your frame budget.

## Further reading

- [`#[soa]` structs](/docs/language/structs#structure-of-arrays-layout-with-soa)
- [Tagged enums](/docs/language/enums#tagged-enums), including `#[soa]` payloads, `if let` and `let ... else`
- [Strike Force Raiders on GitHub](https://github.com/nathancassano/strike-force-raiders). The pools are in `src/unit.r65` and `src/heli.r65`.

---
slug: fast-polymorphic-object-pools
title: "The Power of Fast Polymorphic Object Pools"
authors: [nathan]
tags: [r65, snes, design]
---

![Strike Force Raiders: the player's helicopter flies over a column of infantry and tanks marching on the enemy](/img/blog/strike-force-raiders.png)

If you've made a game in Unity, Godot or your own engine, you've probably written an object pool: a fixed array of enemies or bullets that you reuse instead of allocating new ones. On the SNES a pool isn't an optimization, it's the only option. There's no heap, and at 60 frames a second the CPU gets about 60,000 cycles a frame. How you lay a pool out in memory decides how many objects you can update before the game starts to slow down.

I wanted a game that would push the R65 compiler as hard as possible, so I made [Strike Force Raiders](https://github.com/nathancassano/strike-force-raiders), a helicopter tug-of-war for the SNES written in R65. Each side buys tanks, vans, missile launchers, infantry and engineers, and they march across the desert toward the other side's base while the helicopters fight overhead. On a busy frame the game updates 32 ground units, two helicopters, the buildings, every bullet and missile in the air and the paratroopers, and then draws all of it, inside that same budget.

This post covers the two R65 features that make that possible. `#[soa]` stores a pool one field at a time instead of one object at a time, the same data-oriented layout that ECS engines use. Tagged enums let tanks, vans and soldiers share one pool while each kind keeps its own data. Together they compile most field accesses in the update loop to a single CPU instruction. You don't need to read 65816 assembly to follow along. The listings are there so you can see how much shorter the code gets.

<!-- truncate -->

## Why a plain array of structs is slow

Here is the game's ground unit written the obvious way, as one struct with a field for everything. The fields that only some kinds use (a tank's reload timer, a launcher's one missile, a soldier's firing pose) are all in there too:

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

Each unit takes 14 bytes, so to find unit `i`'s `kind` the CPU has to compute `units + i * 14`. The 65816 has no multiply instruction, so the compiler builds `i * 14` out of cheaper steps (`i * 16 - i * 2`) and has to redo it on every pass of the loop:

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

Only one of those instructions, `LDA units,X`, actually reads the data. The rest is the CPU working out where the data is. That includes switching between 8-bit and 16-bit mode to do the math, and keeping the loop counter on the stack, because the X register is busy holding the offset. Experienced SNES programmers pad their structs to 16 or 32 bytes so the multiply turns into a few shifts. That helps, but it wastes RAM on a machine with 128 KB of it, and you still pay for the shifts.

## Step 1: store the pool one field at a time

This is where *structure of arrays* comes in, usually shortened to SoA. In R65 you keep your struct declaration and add `#[soa]`. Instead of 32 units stored back to back, you get one 32-entry array per field: all the kinds together, all the hit points together, and so on. R65 calls each of these arrays a *plane*:

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

If you've used an ECS or read about data-oriented design, it's the same idea for a different reason. On a modern CPU the point is cache lines; on the SNES the point is skipping the multiply.

Your game code doesn't change: `units[i].kind` still reads the kind of unit `i`. What changes is where it lives. Unit `i`'s kind is now simply entry `i` of `units__kind`, and since each entry is one byte, the X register can index it directly. The same `count_live` compiles to this:

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

The loop counter now lives in the X register itself, and reading a field is a single instruction: `LDA units__kind,X`, "load entry X of the kind array". It's the cheapest way this CPU has to read from an array. Writes are just as short. Here is a unit taking damage, `units[i].hp = units[i].hp - dmg`, with `i` in X and `dmg` in A:

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

The game showed the same effect at full scale. With the unit pool stored as plain structs and the battlefield full, the game loop only got through three frames' worth of work in every four, so the game ran at 45 updates a second instead of 60. That's visible slowdown. With `#[soa]` it held a steady 60. Caching a pointer to the current unit, the usual fix, barely helped, because reading a field through a pointer is itself one of the slower instructions on this CPU.

### Methods get an index instead of a pointer

Because a unit's fields are spread across separate arrays, there's no single address for "unit 5". So when you call a method on an `#[soa]` struct, `self` is the unit's **index**, passed in the X register, and every field access inside the method is one instruction. The game keeps both helicopters, the player's and the enemy's, in one pool of two:

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

As a plain struct, the 45-byte helicopter would need a multiply by 45 on every field access, or padding out to 64 bytes. With `#[soa]`, `rearm` compiles to a straight run of load-and-decrement pairs:

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

When code already knows which helicopter it wants, as in `airframes[HELI].fuel`, the index is a constant. The compiler then drops the index altogether and emits the same single instruction a standalone global variable would get. You get one shared implementation for both helicopters instead of two copy-pasted ones, and it costs nothing.

### Stat tables too

Most games keep per-type data such as max HP, sprite and damage in a table indexed by type. `#[soa]` works the same way on a read-only table in ROM, storing it one column per field. Strike Force Raiders keeps everything fixed about each kind of unit in one such table:

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

Looking up a stat, `unit_stats[units[i].kind as u16].tile`, means reading the unit's kind and using it as the index into the tile column. There's no row size to multiply by:

```asm
    LDA units__kind__tag,Y          ; the unit's kind
    AND #$FF
    TAX
    SEP #$20
    LDA.l unit_stats__tile_data,X   ; its tile
```

## Step 2: one pool, many kinds of unit

The flattened `Unit` still has a design problem you'll recognize. A tank needs a reload timer and a target, a launcher needs to know whether its missile is gone, a soldier needs a firing pose, and every slot carries all of them whether it uses them or not. Strike Force Raiders started out exactly like that: its tank reload timer was an array for the whole pool that four of the five unit kinds never touched. That wastes RAM, and nothing stops a van from reading a tank's timer.

The fix is a *tagged enum*, the kind of enum Rust has, also called a tagged union or sum type. Each variant names a struct that holds only what that kind needs, and kinds with nothing extra are bare variants:

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

In memory the enum becomes two parts: a **tag** array, one byte per slot saying what kind of unit it is, and a **data** area for the per-kind fields. The per-kind structs are `#[soa]` too, so their fields are laid out as planes inside the data area, and fields of the same width share bytes across variants. A tank's reload timer and a soldier's sit at the same address, since no slot is both at once. Here is the layout the compiler produces:

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

`Free` is variant 0, so an empty slot has tag 0, and checking whether a slot is in use is one load and a branch. Here is the main update loop skipping empty slots:

```asm
unit_update__L12:
    LDA units__kind__tag,X
    BNE unit_update__L17      ; live: dispatch on the kind
unit_update__L14:
    INX
    CPX #$20
    BCC unit_update__L12
```

### Matching on the kind

A `match` on a unit's kind compiles to a comparison on its tag byte. In a pattern like `UnitType::Infantry(f)`, `f` doesn't copy the soldier's data out. It refers to that slot's fields where they are, and calling a method on it passes the slot index in X, the same way the helicopter methods work:

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

Checking the kind is one compare (`CMP #$04`, since `Infantry` is variant 4), and the whole method is four instructions with no pointers involved:

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

Spawning a unit is a single assignment, which writes the tag and each of the kind's fields:

```rust
units[i].kind = UnitType::Tank(Tank { reload: 0, hold: 0, target: UNIT_MAX as u8 });
```

The tag also doubles as the index into the `unit_stats` table from Step 1. So each unit ends up in three parts that share one index:
- `Unit` holds what changes as it moves.
- `UnitType` says what it is and holds its kind-specific state.
- `UnitStat` holds what's fixed for its kind.

That's much the same split many engines make between instance data, components and prefab data.

## What you give up

All of this speed comes from one trade-off: a unit no longer sits in one block of memory. You'll run into that as a handful of rules:

- **One pool per type.** Each `#[soa]` struct or tagged enum backs exactly one static, and that's how a method knows which arrays to use from an index alone. If you need two pools of the same thing, use two types, or one pool with an `owner` field, which is how Strike Force Raiders keeps both sides' units together.
- **Refer to units by index, not by pointer.** `&units[i]`, local variables of type `Unit` and copying a whole unit are all rejected. You pass `i` around instead, which most pool code does anyway.
- **Clear the pool before you use it.** SNES RAM holds garbage at power-on, and a tagged-enum pool can't have an initializer, so `unit_init` sets every slot to `UnitType::Free` at the start of each mission.
- **Variants aren't values.** You can't keep `UnitType::Tank` in a local variable or a table. The game's build menu uses a plain enum, `Order`, and `unit_spawn` is the one place where an order becomes a unit.
- **Per-kind methods see only per-kind data.** `Infantry::process` can't read the soldier's position. Logic that needs both, such as a tank scanning for targets, is written as a pool function that matches on the kind.

If you've written 65816 assembly, this is the layout you would have built by hand: parallel tables, an index in X and a type byte. The difference is that you write it as a struct and an enum, and the compiler makes sure every access matches the layout.

## Conclusion

On the SNES, how many things you can have moving before the game slows down often comes down to how your object pool is laid out. A plain array of structs makes the CPU multiply on every field access, and `#[soa]` removes that. In Strike Force Raiders it made a full pool scan 4.2× faster and a damage write 2.5× faster, and it took a crowded battlefield from 45 updates a second back up to 60.

Tagged enums let one pool hold every kind of unit without every slot paying for every kind's fields. Checking a slot's kind is one load and a compare, and each kind's methods still work directly on the pool.

If your game has more than a handful of things on screen at once, whether enemies, bullets, particles or pickups, start with an `#[soa]` pool and a tagged enum for its kinds. You keep writing ordinary structs, enums and methods, and the frame time you get back goes into putting more of them on screen.

## Further reading

- [`#[soa]` structs](/docs/language/structs#structure-of-arrays-layout-with-soa)
- [Tagged enums](/docs/language/enums#tagged-enums), including `#[soa]` payloads, `if let` and `let ... else`
- [Strike Force Raiders on GitHub](https://github.com/nathancassano/strike-force-raiders). The pools are in `src/unit.r65` and `src/heli.r65`.

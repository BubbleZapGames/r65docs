---
sidebar_position: 2
title: "Memory Model"
description: "R65 memory storage classes, addressing modes, and pointer operations."
---

# Memory Model

R65's memory model directly reflects the 65816's segmented architecture. Pointers map to hardware addressing modes with no abstraction cost. There are no safety guarantees: no bounds checking, no null checks, and no lifetime tracking.

## 65816 Memory Architecture

The 65816 has a **24-bit address space**: 256 banks of 64KB each, for a total of 16MB.

### Key Addressing Registers

| Register | Purpose |
|----------|---------|
| PBR | Program Bank Register -- bank of currently executing code (read-only) |
| DBR | Data Bank Register -- default bank for absolute addressing |
| D | Direct Page register -- base address for direct page (zero page) addressing |

### SNES Memory Map

```
$00:0000 - $00:1FFF    Low RAM (8KB, mirrored in banks $00-$3F)
$00:2000 - $00:7FFF    Hardware registers (PPU, APU, DMA, etc.)
$00:8000 - $3F:FFFF    ROM (LoROM lower banks)
$7E:0000 - $7E:1FFF    Low RAM (canonical location)
$7E:2000 - $7F:FFFF    Work RAM (120KB)
$80:0000 - $FF:FFFF    ROM upper/mirrored banks
```

## Storage Classes

R65 categorizes memory into storage classes using attributes on static variables. **Storage class is determined by mutability and attributes**.

### Direct Page: `#[zeropage]`

| Property | Value |
|----------|-------|
| Address range | `$0000` - `$00FF` |
| Cycle cost | 3-4 cycles |
| Pointer size | Requires zero-page location for indirect modes |

The fastest storage for variables, counters, and pointer bases. Direct page addressing uses 1-byte addresses.

```rust
#[zeropage(0x42)]
static mut TEMP: u8;              // Explicit address $42

#[zeropage]
static mut FLAGS: u8;             // Auto-allocated in zero page

#[zeropage(0x10, register)]
static mut SCRATCH0: u8;          // Scratch register for compiler temporaries
```

With explicit addresses, the programmer chooses the exact byte. With auto-allocation, the compiler finds the next available zero-page location.

### Low RAM: `#[lowram]`

| Property | Value |
|----------|-------|
| Address range | `$0000` - `$1FFF` |
| Cycle cost | 4-5 cycles |
| Note | Shares physical memory with zeropage ($0000-$00FF) |

For frequently accessed data that does not fit in the direct page:

```rust
#[lowram]
static mut JOYPAD_STATE: u16;
```

### Main RAM: `#[ram]`

| Property | Value |
|----------|-------|
| Address range | `$7E2000` - `$7FFFFF` |
| Cycle cost | 4-5 cycles |
| Long addressing | Requires 24-bit (far) pointers for bank $7E |

The primary storage for arrays, buffers, and large game state:

```rust
#[ram]
static mut BUFFER: [u8; 4096];

#[ram]
static mut PLAYER: Player;
```

Variables in `#[ram]` are in bank `$7E`. Taking their address produces a far pointer.

### Hardware I/O: `#[hw(addr)]`

| Property | Value |
|----------|-------|
| Addresses | PPU, APU, DMA, and other I/O registers |
| Cycle cost | 4-6 cycles |
| Volatile | Every access reads from or writes to hardware |

Hardware-mapped registers use `#[hw]` with an explicit address. All accesses are volatile: the compiler never caches, eliminates, or reorders them.

```rust
#[hw(0x4212)]
static mut HVBJOY: u8;

#[hw(0x2100)]
static mut INIDISP: u8;

loop {
    if HVBJOY & 0x01 != 0 { break; }  // Always reads hardware
}
```

### ROM (Immutable Statics)

| Property | Value |
|----------|-------|
| Address range | Bank-dependent |
| Cycle cost | 4-5 cycles |
| Attribute | None needed (determined by immutability) |

Immutable static variables are automatically placed in ROM. No storage attribute is needed:

```rust
static SINE_TABLE: [u8; 256] = [0; 256];     // ROM
static MESSAGE: [u8; 12] = "Hello World";     // ROM
static TILE_DATA: [u8; 4096] = [0; 4096];     // ROM
```

ROM statics inherit their bank from the `#[bank(n)]` directive.

### Stack (Automatic)

| Property | Value |
|----------|-------|
| Address range | Set by `#[stack]` attribute or hardware default |
| Cycle cost | 5-10 cycles |
| Managed by | Compiler (locals, parameters, preserved registers) |

Local variables and stack parameters are stored on the hardware stack. Stack-relative addressing (`LDA $nn,S`) is the slowest storage class.

```rust
#[stack(0x1F00, 0x1FFF)]  // Reserve stack region
```

## Pointer Types

### Near Pointer: `*T`

A near pointer is 2 bytes (16-bit). It addresses memory within the 64KB bank selected by DBR:

```rust
let ptr: *u8 = 0x2000;
let value = *ptr;           // Uses DBR for bank
```

Assembly: `LDA ($zp)` (indirect), `LDA ($zp),Y` (indirect indexed)

### Far Pointer: `far *T`

A far pointer is 3 bytes (24-bit). It addresses any location in the full 16MB address space:

```rust
let ptr: far *u8 = 0x7E_2000;  // Bank $7E, offset $2000
let value = *ptr;
```

Assembly: `LDA [$zp]` (indirect long), `LDA [$zp],Y` (indirect long indexed)

### Pointer to Slice: `*[T]`

An unsized array pointer points to a contiguous sequence of `T` with no known length. A `*[T; N]` (pointer to fixed-size array) implicitly coerces to `*[T]`:

```rust
fn process(data: *[u8]) {
    X = 0;
    loop {
        A = data[X];
        if A == 0 { break; }
        X++;
    }
}

static TABLE: [u8; 256] = [0; 256];
process(&TABLE);  // *[u8; 256] coerces to *[u8]
```

### Function Pointers

```rust
fn(u8) -> u8          // Near function pointer (2 bytes, JSR/RTS)
far fn(u8) -> u8      // Far function pointer (3 bytes, JSL/RTL)
```

### Null Pointers

Null is address zero. There are no automatic null checks:

```rust
let ptr: *u8 = 0x0000;
if ptr as u16 != 0 {     // Manual null check required
    let value = *ptr;
}
```

## Pointer Operations

### Address-Of: `&`

The `&` operator takes the address of a static variable:

```rust
#[zeropage(0x20)]
static mut TEMP: u8;

#[ram]
static mut BUFFER: [u8; 256];

let zp_ptr: *u8 = &TEMP;           // Near pointer (zero page is bank 0)
let ram_ptr: far *u8 = &BUFFER;    // Far pointer (RAM is bank $7E)
```

The compiler infers near or far based on the variable's storage class:
- `#[zeropage]`, `#[lowram]`, `#[hw]` produce near pointers (bank 0)
- Immutable statics (ROM) in bank 0 produce near pointers
- `#[ram]` produces far pointers (bank $7E)

Cannot take the address of register aliases (`&A` is an error).

### Dereference: `*`

```rust
let ptr: *u8 = 0x2000;
let value = *ptr;     // Read
*ptr = 42;            // Write
```

Zero-page pointers produce the most efficient indirect addressing:

```rust
#[zeropage(0x42)]
static mut PTR: *u8;
*PTR = 5;  // Generates: LDA #$05; STA ($42) -- 5 cycles
```

### Auto-Dereference for Struct Fields

Pointer-to-struct supports direct `.` field access:

```rust
struct Player { x: u8, y: u8, health: u16 }

#[zeropage]
static mut PTR: *Player;

PTR.x = 10;            // Equivalent to (*PTR).x = 10
let hp = PTR.health;   // Equivalent to (*PTR).health
```

### Indexing: `ptr[index]`

Pointer indexing is equivalent to `*(ptr + index)`:

```rust
#[zeropage(0x42)]
static mut PTR: *u8;

let value = PTR[Y];    // LDA ($42),Y -- indirect indexed
PTR[Y] = value;        // STA ($42),Y
```

Best performance with zero-page pointer + Y register.

### Pointer Arithmetic

Pointer arithmetic automatically scales by `sizeof(T)`:

```rust
let ptr: *u16 = 0x2000;
let next: *u16 = ptr + 1;    // Advances by 2 bytes (sizeof(u16))
let prev: *u16 = ptr - 1;    // Goes back 2 bytes
ptr += 10;                    // Advances by 20 bytes

let diff: u16 = next - ptr;   // Pointer difference (in elements)
```

Near pointers wrap at 64KB. Far pointers wrap at 16MB.

### Pointer Casting

```rust
// Pointer type reinterpretation
let u8_ptr: *u8 = 0x2000;
let u16_ptr = u8_ptr as *u16;

// Integer to pointer
let addr: u16 = 0x2000;
let ptr = addr as *u8;

// Pointer to integer
let addr = ptr as u16;

// Near to far (extends with DBR)
let near_ptr: *u8 = 0x2000;
let far_ptr = near_ptr as far *u8;
```

### Pointer Comparison

Pointers can be compared with all comparison operators:

```rust
let ptr1: *u8 = 0x2000;
let ptr2: *u8 = 0x2100;

if ptr1 < ptr2 { }         // Address comparison
if ptr1 == ptr2 { }        // Equality
if ptr1 as u16 != 0 { }    // Null check
```

### Slice Coercion

A `*[T; N]` implicitly coerces to `*[T]`:

```rust
static TABLE: [u8; 256] = [0; 256];

fn process(data: *[u8]) { /* ... */ }

process(&TABLE);  // *[u8; 256] coerces to *[u8]
```

## Addressing Mode Mapping

How R65 pointer operations map to 65816 addressing modes:

| R65 Syntax | Addressing Mode | Assembly | Cycles | Requirement |
|------------|----------------|----------|--------|-------------|
| `*PTR` (zp near) | DP Indirect | `LDA ($zp)` | 5-6 | Pointer in zero page |
| `PTR[Y]` (zp near) | DP Indirect Indexed | `LDA ($zp),Y` | 5-6 | Pointer in zero page |
| `*FAR_PTR` (zp far) | DP Indirect Long | `LDA [$zp]` | 6-7 | Pointer in zero page |
| `FAR_PTR[Y]` (zp far) | DP Indirect Long Indexed | `LDA [$zp],Y` | 6-7 | Pointer in zero page |
| Stack pointer param | Stack Relative Indirect | `LDA (d,S),Y` | 7-8 | Pointer on stack |

All indirect addressing modes require the pointer to reside in zero page or on the stack. Pointers stored in main RAM cannot be used for indirect addressing without first being loaded into zero page.

## Variable Initialization

R65 generates an `__init_start()` function that copies initial values from ROM to RAM for all static variables with initializers. This runs once at startup.

SNES RAM is unpredictable at power-on. Always initialize variables that need known values:

```rust
#[ram]
static mut SCORE: u16 = 0;           // Initialized by __init_start()
#[ram]
static mut LIVES: u8 = 3;            // Initialized by __init_start()
#[ram]
static mut BUFFER: [u8; 256];        // Uninitialized (contents unknown)
```

## Safety

R65 provides **no memory safety guarantees**. The programmer is responsible for:

- **Bounds checking**: Array and pointer indexing is unchecked. Out-of-bounds access is undefined behavior.
- **Null safety**: Dereferencing a null pointer is undefined behavior. Check manually with `ptr as u16 != 0`.
- **Initialization**: Uninitialized variables contain unpredictable values. SNES RAM has no defined power-on state.
- **Type safety**: Pointer casts (`as *T`) reinterpret memory with no validation.
- **Lifetime**: There is no tracking of pointer validity. Dangling pointers are the programmer's problem.

## Type Sizes

```
u8, i8, bool:           1 byte
u16, i16:               2 bytes
Near pointer (*T):      2 bytes
Far pointer (far *T):   3 bytes
Near fn ptr (fn()):     2 bytes
Far fn ptr (far fn()):  3 bytes
```

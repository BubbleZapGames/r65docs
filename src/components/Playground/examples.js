export const EXAMPLES = [
  {
    name: 'Buffer Fill',
    description: 'Zero-overhead pointer + register parameter passing',
    source: `fn fill(buffer: *u8, value: u8, count: u16) {
    while count > 0 {
        count--;
        buffer[count] = value;
    }
}
`,
  },
  {
    name: 'Hello Registers',
    description: 'Register binding and function basics',
    source: `// R65 Playground — Register binding example
//
// Functions bind parameters directly to CPU registers.
// No stack frames, no calling convention overhead.

#[zeropage]
static mut COUNTER: u8;

fn add_offset(value @ A: u8, offset @ X: u16) -> u8 {
    COUNTER++;
    let result @ A = A + 1;
    return result;
}

fn reset_counter() {
    COUNTER = 0;
}
`,
  },
  {
    name: 'Fibonacci',
    description: 'Loop-based fibonacci with zeropage variables',
    source: `// Fibonacci sequence using zeropage scratch variables
//
// Zeropage (direct page) access is the fastest memory
// on the 65816 — 1 cycle faster than absolute addressing.

#[zeropage]
static mut FIB_A: u8;

#[zeropage]
static mut FIB_B: u8;

#[zeropage]
static mut FIB_N: u8;

fn fibonacci(n @ A: u8) -> u8 {
    FIB_A = 0;
    FIB_B = 1;
    FIB_N = n;
    while FIB_N > 0 {
        let temp @ A = FIB_B;
        FIB_B = FIB_A + FIB_B;
        FIB_A = temp;
        FIB_N--;
    }
    return FIB_A;
}
`,
  },
  {
    name: 'Enum + Struct',
    description: 'Data types with hardware-mapped storage',
    source: `// Enums and structs — packed, no padding, no overhead.
//
// Structs are laid out in declaration order with no
// alignment padding. Enums are C-style integer constants.

enum Direction {
    North = 0,
    East,
    South,
    West,
}

struct Entity {
    x: u8,
    y: u8,
    facing: u8,
    health: u8,
}

#[ram]
static mut PLAYER: Entity = Entity {
    x: 128,
    y: 112,
    facing: 0,
    health: 100,
};

fn move_player(dir @ A: u8) {
    if dir == Direction::North as u8 {
        PLAYER.y--;
    } else if dir == Direction::South as u8 {
        PLAYER.y++;
    } else if dir == Direction::East as u8 {
        PLAYER.x++;
    } else if dir == Direction::West as u8 {
        PLAYER.x--;
    }
    PLAYER.facing = dir;
}
`,
  },
];

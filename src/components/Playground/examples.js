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
  {
    name: 'Interrupt Handler',
    description: 'NMI vblank interrupt with auto save/restore',
    source: `// Interrupt handlers — the compiler generates all the
// register save/restore code automatically.
//
// #[interrupt(nmi)] emits: PHP, PHB, PHA, PHX, PHY,
// then your code, then PLY, PLX, PLA, PLB, PLP, RTI.

#[zeropage]
static mut FRAME_COUNT: u16;

#[zeropage]
static mut NMI_READY: u8;

#[interrupt(nmi)]
fn vblank() {
    FRAME_COUNT++;
    NMI_READY = 1;
}

fn wait_for_vblank() {
    NMI_READY = 0;
    while NMI_READY == 0 {
        asm!("WAI");
    }
}
`,
  },
  {
    name: 'Array Sorting',
    description: 'Quicksort with structs and enums',
    source: `// Quicksort implementation demonstrating arrays,
// structs, enums, and recursive function calls.

enum Suit {
    Spades = 0,
    Hearts,
    Diamonds,
    Clubs,
}

struct Card {
    suit: u8,
    rank: u8,
}

#[ram]
static mut HAND: [Card; 8];

#[zeropage]
static mut TEMP_CARD: Card;

fn card_value(idx @ A: u8) -> u8 {
    let i @ X = idx as u16;
    let val @ A = HAND[X].suit * 13 + HAND[X].rank;
    return val;
}

fn swap_cards(i @ A: u8, j: u8) {
    let ix @ X = i as u16;
    TEMP_CARD.suit = HAND[X].suit;
    TEMP_CARD.rank = HAND[X].rank;

    let jx @ X = j as u16;
    let ia @ X = i as u16;
    HAND[ia as u16].suit = HAND[jx as u16].suit;
    HAND[ia as u16].rank = HAND[jx as u16].rank;

    HAND[jx as u16].suit = TEMP_CARD.suit;
    HAND[jx as u16].rank = TEMP_CARD.rank;
}
`,
  },
  {
    name: 'State Machine',
    description: 'Entity AI with state transitions',
    source: `// State machine pattern for game entity AI.
// Common in SNES games for enemy behavior.

enum AIState {
    Idle = 0,
    Patrol,
    Chase,
    Attack,
    Flee,
}

struct Enemy {
    x: u8,
    y: u8,
    state: u8,
    timer: u8,
    health: u8,
}

#[ram]
static mut ENEMIES: [Enemy; 4];

#[zeropage]
static mut PLAYER_X: u8;

#[zeropage]
static mut PLAYER_Y: u8;

fn update_enemy(idx @ A: u8) {
    let i @ X = idx as u16;
    let state @ A = ENEMIES[X].state;

    if state == AIState::Idle as u8 {
        ENEMIES[i].timer--;
        if ENEMIES[i].timer == 0 {
            ENEMIES[i].state = AIState::Patrol as u8;
            ENEMIES[i].timer = 60;
        }
    } else if state == AIState::Patrol as u8 {
        ENEMIES[i].x++;
        ENEMIES[i].timer--;
        if ENEMIES[i].timer == 0 {
            ENEMIES[i].state = AIState::Idle as u8;
            ENEMIES[i].timer = 30;
        }
    } else if state == AIState::Flee as u8 {
        if ENEMIES[i].x > PLAYER_X {
            ENEMIES[i].x++;
        } else {
            ENEMIES[i].x--;
        }
    }
}
`,
  },
];

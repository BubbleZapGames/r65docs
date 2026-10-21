// Homepage content: the #[soa] code sample, the showcase screenshots and a
// small highlighter for the sample.
import React from 'react';

// The #[soa] sample. Its assembly is real r65c output (default -O1), trimmed
// of .ACCU/.INDEX directives and with loop labels renamed for display.
export const SOA = {
  r65: `#[soa]
struct Enemy { kind: u8, hp: u8, x: u16 }

impl Enemy {
    fn hurt(self) { self.hp = self.hp - 1; }
}

#[lowram]
static mut POOL: [Enemy; 16];

fn tick() {
    for i in 0..16 { POOL[i].hurt(); }
}`,
  asm: `tick:
    LDX #$00
loop:
    CPX #$10
    BCS done
    DEC $0210,X    ; POOL__hp
    INX
    BRA loop
done:
    RTS`,
};

export const SHOTS = [
  {id: 'classickong', title: 'Classic Kong', kind: 'Full game',
    blurb: 'Classic Kong Complete, ported frame-for-frame from C to R65.',
    img: '/img/design/classickong.png', href: 'https://github.com/BubbleZapGames/classickong.r65'},
  {id: 'dizworld', title: 'Dizworld Flyer', kind: 'Mode 7',
    blurb: 'Perspective flying camera with HDMA and a sky horizon.',
    img: '/img/design/dizworld.png', href: '/examples#dizworld'},
  {id: 'platformer', title: 'Basic Platform', kind: 'Tilemaps',
    blurb: 'Platformer logic using the tilemap for ground detection.',
    img: '/img/design/platformer.png', href: '/examples#platformer'},
  {id: 'sprite_priority', title: 'Sprite Priority', kind: 'Sprites',
    blurb: 'Wasps orbiting a beehive, swapping priority each half-oval.',
    img: '/img/design/sprite_priority.png', href: '/examples#sprite_priority'},
  {id: 'irisHDMA', title: 'Iris Animation', kind: 'HDMA',
    blurb: 'Iris wipe using HDMA and window clipping.',
    img: '/img/design/irisHDMA.png', href: '/examples#irisHDMA'},
  {id: 'mosaicFade', title: 'Mosaic Fade', kind: 'PPU effects',
    blurb: 'A cycling mosaic pixelation effect on a background image.',
    img: '/img/design/mosaicFade.png', href: '/examples#mosaicFade'},
  {id: 'walkCycle', title: 'Walk Cycle', kind: 'Animation',
    blurb: 'D-pad controlled directional sprite animation.',
    img: '/img/design/walk.png', href: '/examples#walkCycle'},
  {id: 'snake', title: 'Snake', kind: 'Game',
    blurb: 'The classic, in a few hundred lines of R65.',
    img: '/img/design/snake.png', href: '/examples#snake'},
];

// A deliberately tiny highlighter: the caller's styles colour the token
// classes (com, attr, kw, ty, num, reg for R65; com, lbl, mn, num for asm).
const R65_RE = /(\/\/[^\n]*)|(#\[[^\]]*\])|\b(fn|let|mut|static|struct|impl|for|in|loop|if|else|return|self|const|enum|match)\b|\b(u8|u16|i8|i16|bool)\b|\b(0x[0-9A-Fa-f]+|\d+)\b|(@\s*[AXY]\b)/g;
const ASM_RE = /(;[^\n]*)|^(\s*[A-Za-z_][\w]*:)|\b(LDA|STA|LDX|CPX|INX|INC|DEC|ADC|CLC|BCS|BRA|RTS|RTI|REP|SEP|PHA|PLA)\b|(#?\$[0-9A-Fa-f]+(?:,[XY])?)/gm;

function tokenize(code, re, classes) {
  const out = [];
  let last = 0;
  let m;
  re.lastIndex = 0;
  while ((m = re.exec(code))) {
    if (m.index > last) out.push(code.slice(last, m.index));
    const g = m.slice(1).findIndex((x) => x !== undefined);
    out.push(<span key={m.index} className={classes[g]}>{m[0]}</span>);
    last = m.index + m[0].length;
  }
  out.push(code.slice(last));
  return out;
}

export function Code({code, lang, styles}) {
  const classes = lang === 'asm'
    ? [styles.com, styles.lbl, styles.mn, styles.num]
    : [styles.com, styles.attr, styles.kw, styles.ty, styles.num, styles.reg];
  return tokenize(code, lang === 'asm' ? ASM_RE : R65_RE, classes);
}

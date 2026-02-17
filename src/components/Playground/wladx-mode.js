// WLA-DX 65816 assembly syntax mode for CodeMirror 6

const MNEMONICS = new Set([
  // 65816 instructions
  'adc', 'and', 'asl', 'bcc', 'bcs', 'beq', 'bit', 'bmi', 'bne', 'bpl',
  'bra', 'brk', 'brl', 'bvc', 'bvs', 'clc', 'cld', 'cli', 'clv', 'cmp',
  'cop', 'cpx', 'cpy', 'dea', 'dec', 'dex', 'dey', 'eor', 'ina', 'inc',
  'inx', 'iny', 'jml', 'jmp', 'jsl', 'jsr', 'lda', 'ldx', 'ldy', 'lsr',
  'mvn', 'mvp', 'nop', 'ora', 'pea', 'pei', 'per', 'pha', 'phb', 'phd',
  'phk', 'php', 'phx', 'phy', 'pla', 'plb', 'pld', 'plp', 'plx', 'ply',
  'rep', 'rol', 'ror', 'rti', 'rtl', 'rts', 'sbc', 'sec', 'sed', 'sei',
  'sep', 'sta', 'stp', 'stx', 'sty', 'stz', 'tax', 'tay', 'tcd', 'tcs',
  'tdc', 'trb', 'tsb', 'tsc', 'tsx', 'txa', 'txs', 'txy', 'tya', 'tyx',
  'wai', 'wdm', 'xba', 'xce',
]);

const DIRECTIVES = new Set([
  '.db', '.dw', '.dl', '.dd', '.ds', '.dsb', '.dsw',
  '.define', '.def', '.undefine', '.undef',
  '.enum', '.ende',
  '.struct', '.endst',
  '.macro', '.endm',
  '.rept', '.endr',
  '.section', '.ends',
  '.slot', '.bank', '.org',
  '.lorom', '.hirom', '.exlorom', '.exhirom',
  '.snesheader', '.endsnes',
  '.snesnativevector', '.endnativevector',
  '.snesemuvector', '.endemuvector',
  '.rombanks', '.rombanksize', '.rombankmap', '.bankstotal', '.banksize',
  '.memorymap', '.endme', '.defaultslot', '.slotsize',
  '.base', '.accu', '.index',
  '.8bit', '.16bit', '.24bit',
  '.if', '.ifdef', '.ifndef', '.else', '.endif',
  '.incbin', '.include',
  '.printt', '.printv',
  '.fail',
  '.export', '.import',
  '.seed', '.dbrnd', '.dwrnd',
  '.background',
]);

export const wladx65816 = {
  name: 'wladx-65816',

  startState() {
    return {};
  },

  token(stream, state) {
    // Skip whitespace
    if (stream.eatSpace()) return null;

    // Comments: ; to end of line
    if (stream.eat(';')) {
      stream.skipToEnd();
      return 'comment';
    }

    // Strings
    if (stream.eat('"')) {
      while (!stream.eol()) {
        if (stream.eat('\\')) {
          stream.next(); // skip escaped char
        } else if (stream.eat('"')) {
          break;
        } else {
          stream.next();
        }
      }
      return 'string';
    }

    // Hex numbers: $FF or 0xFF
    if (stream.eat('$')) {
      stream.eatWhile(/[0-9a-fA-F]/);
      return 'number';
    }
    if (stream.match(/^0x[0-9a-fA-F]+/)) {
      return 'number';
    }

    // Binary numbers: %01010101
    if (stream.eat('%')) {
      stream.eatWhile(/[01]/);
      return 'number';
    }

    // Hash (immediate prefix)
    if (stream.eat('#')) {
      // Could be followed by < > : for bank/low/high byte operators
      stream.eat(/[<>:]/);
      return 'operator';
    }

    // Directives: .WORD
    if (stream.eat('.')) {
      stream.eatWhile(/[a-zA-Z0-9_]/);
      const word = stream.current().toLowerCase();
      if (DIRECTIVES.has(word)) {
        return 'keyword';
      }
      return 'keyword';  // treat all .xxx as directives
    }

    // + and - (anonymous labels / operators)
    if (stream.eat('+') || stream.eat('-')) {
      // Could be anonymous label references like +++ or ---
      while (stream.eat(stream.current()[0])) {}
      if (stream.eol() || stream.peek() === ' ' || stream.peek() === '\t') {
        return 'tag';
      }
      return 'operator';
    }

    // Words: mnemonics, labels, registers
    if (stream.match(/^[a-zA-Z_][a-zA-Z0-9_]*/)) {
      const word = stream.current();
      const lower = word.toLowerCase();

      // Check if it's a label (followed by colon)
      if (stream.eat(':')) {
        return 'tag';
      }

      // Mnemonics
      if (MNEMONICS.has(lower)) {
        return 'variableName.special';
      }

      // Common register names in operands
      if (lower === 'a' || lower === 'x' || lower === 'y' || lower === 's') {
        return 'variableName.definition';
      }

      return 'variableName';
    }

    // Decimal numbers
    if (stream.match(/^[0-9]+/)) {
      return 'number';
    }

    // Operators and punctuation
    if (stream.eat(/[,()=|&^~<>]/)) {
      return 'operator';
    }

    // Skip anything else
    stream.next();
    return null;
  },
};

/**
 * Expression parser for the slide rule's input box.
 *
 * A hand-written recursive descent parser rather than `new Function` or `eval`.
 * The page's CSP already forbids remote script and inline handler abuse, and a
 * user's typed arithmetic is exactly the kind of input that should never reach
 * an evaluator that can execute it.
 *
 * Two functions cross the seam. `parse` turns text into a tree, which the input
 * panel walks to show the user how their expression was grouped. `evaluate`
 * turns that tree into a number, converting trig from degrees on the way, since
 * a slide rule is graduated in degrees and nobody typing `sin(30)` into an
 * engineering tool means radians.
 *
 * Errors carry an `index` so the UI can put a caret under the offending
 * character rather than printing a stack trace.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SlideRuleParser = factory();
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const DEG = 180 / Math.PI;

  /**
   * How a sub-expression is named in an error message. A literal reports the
   * text the user typed rather than the number it evaluates to, so the message
   * matches what is on screen.
   */
  function describe(node) {
    if (!node) return '?';
    if (node.kind === 'number') return node.text !== undefined ? node.text : String(node.value);
    if (node.kind === 'unary') return `-${describe(node.argument)}`;
    if (node.kind === 'call') return `${node.source}(${describe(node.argument)})`;
    if (node.kind === 'binary') {
      return `${describe(node.left)} ${node.operator} ${describe(node.right)}`;
    }
    return '?';
  }

  /** Parse or evaluation failure, carrying the source position for the caret. */
  class ParseError extends Error {
    constructor(message, index) {
      super(message);
      this.name = 'ParseError';
      this.index = index;
    }
  }

  /**
   * Functions the rule can actually perform. `log` is accepted as an alias for
   * log10 because on a slide rule a bare "log" means base ten.
   */
  const FUNCTIONS = {
    sqrt: { arity: 1, domain: (x) => x >= 0, apply: Math.sqrt, label: 'sqrt' },
    cbrt: { arity: 1, domain: () => true, apply: Math.cbrt, label: 'cbrt' },
    ln: { arity: 1, domain: (x) => x > 0, apply: Math.log, label: 'ln' },
    log: { arity: 1, domain: (x) => x > 0, apply: Math.log10, label: 'log10' },
    log10: { arity: 1, domain: (x) => x > 0, apply: Math.log10, label: 'log10' },
    sin: {
      arity: 1, domain: () => true, label: 'sin',
      apply: (deg) => Math.sin(deg / DEG), degreesIn: true,
    },
    cos: {
      arity: 1, domain: () => true, label: 'cos',
      apply: (deg) => Math.cos(deg / DEG), degreesIn: true,
    },
    tan: {
      arity: 1, domain: () => true, label: 'tan',
      apply: (deg) => Math.tan(deg / DEG), degreesIn: true,
    },
    asin: {
      arity: 1, domain: (x) => x >= -1 && x <= 1, label: 'asin',
      apply: (x) => Math.asin(x) * DEG, degreesOut: true,
    },
    acos: {
      arity: 1, domain: (x) => x >= -1 && x <= 1, label: 'acos',
      apply: (x) => Math.acos(x) * DEG, degreesOut: true,
    },
    atan: {
      arity: 1, domain: () => true, label: 'atan',
      apply: (x) => Math.atan(x) * DEG, degreesOut: true,
    },
  };

  const OPERATORS = {
    '+': { prec: 1, right: false },
    '-': { prec: 1, right: false },
    '*': { prec: 2, right: false },
    '/': { prec: 2, right: false },
    '^': { prec: 3, right: true },
  };

  // Accepted spellings that are folded onto a canonical operator, so the tree
  // the UI displays never contains two different nodes for the same meaning.
  const ALIASES = { '×': '*', '·': '*', '÷': '/', '−': '-', '**': '^' };

  class Parser {
    constructor(text) {
      this.text = text;
      this.pos = 0;
    }

    peek(offset = 0) { return this.text[this.pos + offset]; }

    skipSpace() {
      while (this.pos < this.text.length && /\s/.test(this.text[this.pos])) {
        this.pos++;
      }
    }

    fail(message, index = this.pos) {
      // Clamp rather than let the caret renderer index past the end. One past
      // the last character is a position the user can actually see, which is
      // where an unclosed bracket should point.
      throw new ParseError(message, Math.max(0, Math.min(index, this.text.length + 1)));
    }

    /**
     * entry point: expression := term (('+' | '-') term)*
     */
    parseExpression() {
      let left = this.parseTerm();
      for (;;) {
        this.skipSpace();
        const ch = this.peek();
        const op = ch === '^' ? '^' : ALIASES[ch];
        if (ch !== '+' && ch !== '-' && op !== '*' && op !== '/') return left;
        this.pos++;
        const right = op === '^' ? this.parseExponent() : this.parseTerm();
        left = { kind: 'binary', operator: ch === '+' || ch === '-' ? ch : op, left, right };
      }
    }

    parseTerm() {
      let left = this.parseUnary();
      for (;;) {
        this.skipSpace();
        const ch = this.peek();
        const op = ch === '*' ? '*' : ch === '/' ? '/' : ALIASES[ch];
        if (op !== '*' && op !== '/') return left;
        this.pos++;
        const right = this.parseUnary();
        left = { kind: 'binary', operator: op, left, right };
      }
    }

    /**
     * `**` is a two character alias, so it has to be recognised before the
     * single character operators are considered or `2 ** 3` reads as `2 * (*3)`.
     */
    parseUnary() {
      this.skipSpace();
      const ch = this.peek();
      if (ch === '-') {
        this.pos++;
        return { kind: 'unary', operator: '-', argument: this.parseUnary() };
      }
      if (ch === '+') {
        this.pos++;
        return this.parseUnary();
      }
      return this.parseExponent();
    }

    /**
     * exponent := primary ('^' unary)?   right associative
     *
     * The exponent is parsed with parseUnary, not parseExponent, so that
     * `2 ^ -2` is a negative exponent rather than a syntax error. Right
     * associativity still holds because a unary sign only ever consumes the
     * single value in front of it: in `2 ^ -2 ^ 2` the inner -2 stops at the
     * next caret and parseExponent sees that caret to continue rightwards.
     */
    parseExponent() {
      const base = this.parsePrimary();
      this.skipSpace();
      if (this.text.startsWith('**', this.pos)) {
        this.pos += 2;
        return {
          kind: 'binary', operator: '^', left: base,
          right: this.parseSigned(), rightAssoc: true,
        };
      }
      if (this.peek() === '^') {
        this.pos++;
        return {
          kind: 'binary', operator: '^', left: base,
          right: this.parseSigned(), rightAssoc: true,
        };
      }
      return base;
    }

    /** A primary, optionally preceded by a sign. */
    parseSigned() {
      this.skipSpace();
      const ch = this.peek();
      if (ch === '-') {
        this.pos++;
        return { kind: 'unary', operator: '-', argument: this.parseExponent() };
      }
      if (ch === '+') {
        this.pos++;
        return this.parseExponent();
      }
      return this.parseExponent();
    }

    parsePrimary() {
      this.skipSpace();
      const ch = this.peek();
      if (ch === undefined) this.fail('unexpected end of expression');

      if (ch === '(') {
        this.pos++;
        const inner = this.parseExpression();
        this.skipSpace();
        if (this.peek() !== ')') this.fail('unclosed bracket', this.text.length);
        this.pos++;
        return inner;
      }

      if (/[0-9.]/.test(ch)) return this.parseNumber();

      if (/[A-Za-z]/.test(ch)) return this.parseCall();

      // Anything else is either a known operator spelling or a typo. Report the
      // operator spellings as mistakes rather than "unknown character" so the
      // message is actionable.
      if (ch === '*' || ch === '/') this.fail('nothing to operate on before this operator');
      this.fail(`unexpected character "${ch}"`);
      return null;
    }

    parseNumber() {
      const start = this.pos;
      while (this.pos < this.text.length && /[0-9]/.test(this.peek())) this.pos++;

      // A '.' is only part of the number when a digit follows it, so the
      // trailing dot in "2 + ." is reported rather than silently eaten.
      if (this.peek() === '.' && /[0-9]/.test(this.peek(1))) {
        this.pos++;
        while (this.pos < this.text.length && /[0-9]/.test(this.peek())) this.pos++;
      }

      if (this.peek() === 'e' || this.peek() === 'E') {
        const mark = this.pos;
        this.pos++;
        if (this.peek() === '+' || this.peek() === '-') this.pos++;
        if (!/[0-9]/.test(this.peek() || '')) {
          this.pos = mark;
          this.fail('exponent has no digits', mark);
        }
        while (this.pos < this.text.length && /[0-9]/.test(this.peek())) this.pos++;
      }

      const raw = this.text.slice(start, this.pos);
      const value = Number(raw);
      if (!Number.isFinite(value)) this.fail(`"${raw}" is not a number`, start);
      return { kind: 'number', value, text: raw };
    }

    parseCall() {
      const start = this.pos;
      while (this.pos < this.text.length && /[A-Za-z0-9]/.test(this.peek())) this.pos++;
      // Normalise case so SIN(30) and sin(30) both resolve. An unknown name is
      // reported here, at the point it was written, rather than deferred to
      // evaluate() where the character position is no longer available.
      const source = this.text.slice(start, this.pos);
      const name = source.toLowerCase();
      const fn = FUNCTIONS[name];
      if (!fn) this.fail(`unknown function "${source}"`, start);

      this.skipSpace();
      if (this.peek() !== '(') {
        // A bare known name is a typo rather than an unknown variable: this
        // expression language has no variables, so the fix is "add brackets".
        this.fail(`${name} needs brackets, as in ${name}(x)`, start);
      }

      this.pos++;
      const argument = this.parseExpression();
      this.skipSpace();
      if (this.peek() !== ')') this.fail(`unclosed bracket after ${name}(`, this.text.length);
      this.pos++;
      return { kind: 'call', name: fn.label, source: name, argument, position: start };
    }
  }

  /**
   * Parse expression text into a tree.
   * @param {string} text
   * @returns {object} root node
   * @throws {ParseError} with `index` pointing at the offending character
   */
  function parse(text) {
    if (typeof text !== 'string') throw new ParseError('expected a string', 0);
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      throw new ParseError('enter a calculation', 0);
    }

    const parser = new Parser(text);
    const ast = parser.parseExpression();

    // When the expression stops early, blame the first non-space character
    // rather than the whitespace that led up to it. Skipping before reading the
    // position is what put the caret under a space instead of the stray digit.
    const rest = parser.text.slice(parser.pos);
    const trailing = /^\s*(\S)/.exec(rest);
    if (trailing) {
      parser.fail(
        `unexpected "${trailing[1]}" after the expression`,
        parser.pos + trailing[0].length - 1,
      );
    }
    return ast;
  }

  /**
   * Reduce a parsed tree to a number, reporting domain errors as ParseError so
   * the caller has one failure type to render.
   */
  function evaluate(ast) {
    switch (ast.kind) {
      case 'number':
        return ast.value;

      case 'unary':
        return -evaluate(ast.argument);

      case 'binary': {
        const a = evaluate(ast.left);
        const b = evaluate(ast.right);
        switch (ast.operator) {
          case '+': return a + b;
          case '-': return a - b;
          case '*': return a * b;
          case '/':
            if (b === 0) throw new ParseError('division by zero', 0);
            return a / b;
          case '^': {
            const v = Math.pow(a, b);
            if (!Number.isFinite(v)) {
              throw new ParseError('that power has no finite value', 0);
            }
            return v;
          }
          default:
            throw new ParseError(`unknown operator "${ast.operator}"`, 0);
        }
      }

      case 'call': {
        const fn = FUNCTIONS[ast.source];
        const x = evaluate(ast.argument);

        // A domain failure is about the function, not about a specific
        // character, so the caret points at the function name. That position is
        // carried on the node rather than guessed here, because `evaluate` has
        // no cursor of its own to read it from.
        const at = ast.position !== undefined ? ast.position : 0;

        if (!fn.domain(x)) {
          throw new ParseError(
            `${fn.label} is undefined for ${describe(ast.argument)}`, at);
        }
        const v = fn.apply(x);
        if (typeof v === 'number' && !Number.isFinite(v)) {
          throw new ParseError(`${fn.label}(${describe(ast.argument)}) has no finite value`, at);
        }
        return v;
      }

      default:
        throw new ParseError(`cannot evaluate ${ast.kind}`, 0);
    }
  }

  return { parse, evaluate, ParseError, FUNCTIONS };
});
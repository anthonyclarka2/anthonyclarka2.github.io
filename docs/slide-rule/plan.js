/**
 * Choreography compiler: expression text in, an animated procedure out.
 *
 * This is where an expression becomes a sequence of moves the animation can
 * play -- slide here, cursor there, and a sentence saying why. The seam is a
 * single function returning plain data, so the renderer never has to know what
 * multiplication is, only how to draw a step.
 *
 * Two rules govern everything here.
 *
 * First, honesty over coverage. A slide rule cannot add, and this module says so
 * rather than quietly computing 2+3 in JavaScript and animating something that
 * looks plausible. Where a method is not yet verified against a physical rule --
 * the inverse trig functions, whose reading depends on the unconfirmed ST
 * graduation alignment -- the module refuses and explains. A refused operation
 * is a smaller feature than a wrong one.
 *
 * Second, the rule's limits are content, not bugs. A four decade rule cannot
 * hold an operand four decades to the left of its index. Where an operand falls
 * off, the plan normalises it by shifting decades and says so in the narration,
 * because that shift is the actual technique a person uses at the bench.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./parser.js'), require('./geometry.js'));
  } else {
    root.SlideRulePlan = factory(root.SlideRuleParser, root.SlideRuleGeometry);
  }
})(typeof self !== 'undefined' ? self : globalThis, function (parser, geometryLib) {
  'use strict';

  const { parse, evaluate, ParseError } = parser;
  const { geometry } = geometryLib;

  const DEG = 180 / Math.PI;

  /**
   * Build an empty, explicitly-unsupported plan. Every early return produces
   * one of these so callers never have to check for a partially built object.
   */
  function unsupported(notes, extra) {
    return Object.assign({
      supported: false,
      steps: [],
      log: [],
      notes,
      limits: [],
      normalised: false,
      shift: 0,
      result: null,
      reading: null,
      error: null,
      operation: null,
    }, extra || {});
  }

  function supported(extra) {
    return Object.assign({
      supported: true,
      steps: [],
      log: [],
      notes: [],
      limits: [],
      normalised: false,
      shift: 0,
      result: null,
      reading: null,
      error: null,
      operation: null,
    }, extra || {});
  }

  /** Trim a float for display without lying about precision in the plan data. */
  function fmt(n) {
    if (!Number.isFinite(n)) return String(n);
    if (Number.isInteger(n)) return String(n);
    const abs = Math.abs(n);
    if (abs >= 1e5 || abs < 1e-4) return n.toExponential(4);
    return String(Number(n.toPrecision(8)));
  }

  /**
   * Bring a value onto the rule by shifting whole decades, returning the shift
   * applied. Shift is only ever a whole number of decades and only ever brings
   * a value that is too far LEFT onto the rule -- a value too far right is past
   * what any slide position can reach, because the slide can travel right by at
   * most the rule's own length.
   */
  function normaliseOnto(g, value) {
    let v = value;
    let shift = 0;
    for (let guard = 0; guard < 64; guard++) {
      const x = g.posOf('D', Math.abs(v));
      if (Number.isFinite(x) && x >= 0) break;
      v *= 10;
      shift += 1;
    }
    return { value: v, shift };
  }

  /** True when a position lies within the span of the rule. */
  function onRule(g, x) {
    return Number.isFinite(x) && x >= 0 && x <= g.axisPx;
  }

  /**
   * How many decades an operand sits outside the rule. The rule spans from its
   * index at the left edge to `decades` further right, so a positive result
   * means the value is too small to reach.
   */
  function decadesOut(g, value) {
    const x = g.posOf('D', Math.abs(value));
    return Math.floor(-x / (g.axisPx / g.decades));
  }

  /**
   * Multiply and divide, via C against D. This is the operation a slide rule
   * was built for and the only one that genuinely moves the slide.
   */
  function planMultiply(g, a, b) {
    // Prefer the reading order a person would use: put the smaller, less
    // awkward operand on D where possible. Either order gives the same product.
    let x = a;
    let y = b;
    if (Math.abs(x) < Math.abs(y)) { x = b; y = a; }

    let notes = [];

    // Slide multiplication is only possible while the sum of the two operands'
    // decades fits the rule. The standard fix at the bench is to shift one
    // operand UP by whole decades and the other DOWN by the same amount, so the
    // shift cancels in the product instead of inflating it. For 1e3 * 1e-3 that
    // means working with 1e0 * 1e0, which reads 1 straight off the rule.
    const normX = normaliseOnto(g, Math.abs(x));
    const normY = normaliseOnto(g, Math.abs(y));
    const shift = Math.max(normX.shift, normY.shift);

    if (shift === 0) {
      return supported({
        operation: 'multiply',
        steps: multiplySteps(g, x, y, x, y, x * y),
        log: multiplyLog(x, y, x, y, x * y, 0),
        result: x * y,
        reading: x * y,
      });
    }

    const xAdj = normX.shift === shift
      ? (x < 0 ? -1 : 1) * normX.value          // already on the rule
      : x / Math.pow(10, shift);                 // pushed down to cancel
    const yAdj = normY.shift === shift
      ? (y < 0 ? -1 : 1) * normY.value
      : y / Math.pow(10, shift);

    const posX = g.posOf('D', Math.abs(xAdj));
    const posY = g.posOf('C', Math.abs(yAdj));

    notes.push(
      `One operand is ${shift} decade${shift === 1 ? '' : 's'} beyond what a four ` +
      `decade rule can hold. The two operands are shifted by ${shift} decade` +
      `${shift === 1 ? '' : 's'} in opposite directions -- ${fmt(x)} becomes ` +
      `${fmt(xAdj)} and ${fmt(y)} becomes ${fmt(yAdj)} -- so the shift cancels ` +
      'in the product. This is what a person does at the bench.',
    );

    if (!Number.isFinite(posX) || !Number.isFinite(posY) ||
        !onRule(g, posX) || !onRule(g, posY)) {
      return unsupported([
        ...notes,
        `Even shifted, these values do not both fit within the ${g.decades} ` +
        'decades this rule spans.',
      ], { operation: 'multiply', result: x * y });
    }

    const product = g.read('D', posX + posY);
    return supported({
      operation: 'multiply',
      steps: multiplySteps(g, x, y, xAdj, yAdj, product, shift),
      log: multiplyLog(x, y, xAdj, yAdj, product, shift),
      notes,
      normalised: true,
      shift,
      result: x * y,
      reading: product,
    });
  }

  /** The three moves that make up a slide multiplication. */
  function multiplySteps(g, x, y, xAdj, yAdj, product, shift) {
    const posX = g.posOf('D', Math.abs(xAdj));
    const posY = g.posOf('C', Math.abs(yAdj));
    const undo = shift ? ` Undoing the ${shift} decade shift gives the real answer.` : '';
    return [
      {
        target: 'slide',
        to: posX,
        say: `Slide the rule until the 1 on C sits against ${fmt(xAdj)} on D.`,
      },
      {
        target: 'cursor',
        to: posX,
        say: `The cursor marks ${fmt(xAdj)} on D, the value just set.`,
      },
      {
        target: 'cursor',
        to: posX + posY,
        say: `${fmt(yAdj)} on the slide now crosses D at ${fmt(product)}.${undo}`,
      },
    ];
  }

  function multiplyLog(x, y, xAdj, yAdj, product, shift) {
    const log = [
      shift
        ? `Shift the operands to ${fmt(xAdj)} and ${fmt(yAdj)} so both fit the rule.`
        : null,
      `Set ${fmt(xAdj)} against the C index.`,
      `Read the answer where ${fmt(yAdj)} on C crosses D: ${fmt(product)}.`,
      shift ? `Undo the ${shift} decade shift on the answer.` : null,
    ];
    return log.filter(Boolean);
  }

  /** Division: set the dividend on C over the divisor on D, read C's index. */
  function planDivide(g, a, b) {
    const outA = decadesOut(g, a);
    const outB = decadesOut(g, b);
    let notes = [];

    // Normalise the DIVISOR only. The dividend rides on the slide, which can
    // travel past the stock's left edge, so it does not have to sit on the rule
    // to be settable. The divisor is read off D, so it must be on the rule.
    const normB = normaliseOnto(g, Math.abs(b)) ;
    const bAdj = (b < 0 ? -1 : 1) * normB.value;
    const shift = normB.shift;
    if (shift !== 0) {
      notes.push(
        `The divisor is ${shift} decade${shift === 1 ? '' : 's'} below the rule's ` +
        `index, so it is scaled onto the rule by ${shift} decade` +
        `${shift === 1 ? '' : 's'} and the shift put back on the answer. ` +
        'This is what a person does at the bench with a rule this short.',
      );
    }

    const posA = g.posOf('C', Math.abs(a));
    const posB = g.posOf('D', Math.abs(bAdj));
    if (!Number.isFinite(posA) || !Number.isFinite(posB)) {
      return unsupported([
        'Those values cannot be placed on this rule, even after shifting decades.',
      ], { result: a / b, operation: 'divide' });
    }
    if (!onRule(g, posB)) {
      return unsupported([
        `The divisor is still past the right edge of the rule, and the slide ` +
        'cannot travel far enough to bring it into view.',
      ], { result: a / b, operation: 'divide' });
    }

    const slideTo = posA - posB;
    const steps = [];
    steps.push({
      target: 'slide',
      to: slideTo,
      say: `Slide until ${fmt(a)} on C sits against ${fmt(bAdj)} on D.`,
    });
    steps.push({
      target: 'cursor',
      to: g.posOf('C', 1) + slideTo,
      say: `The 1 on C is the quotient, read where the cursor crosses D.`,
    });

    const quotient = g.read('D', g.posOf('C', 1) + slideTo);
    const trueResult = a / b;
    // The divisor was scaled UP by `shift` decades, so the rule computes
    // a / (b * 10^shift): too SMALL by that factor. Multiplying the reading back
    // restores the real quotient.
    const reading = quotient * Math.pow(10, shift);

    return supported({
      operation: 'divide',
      steps,
      log: [
        `Set ${fmt(a)} on C over ${fmt(bAdj)} on D.`,
        `Read the 1 on C against D: ${fmt(quotient)}.`,
        shift !== 0 ? `Restore the ${shift} decade shift: ${fmt(trueResult)}.` : null,
      ].filter(Boolean),
      notes,
      normalised: shift !== 0,
      shift,
      result: trueResult,
      reading,
      limits: onRule(g, g.posOf('C', Math.abs(a)) - g.posOf('D', Math.abs(bAdj))) ? []
        : ['the slide cannot travel far enough to bring both operands into view'],
    });
  }

  /**
   * Powers and roots, read straight off A, C| and K with the slide at rest.
   * These are direct scale readings, so no slide movement is required.
   */
  function planPower(g, base, exponent) {
    const value = Math.pow(base, exponent);
    const steps = [];

    // A negative power is a reciprocal of the positive one, and the rule
    // performs division directly. This has to be decided before the scale
    // matching below, or a negative exponent falls through to the general case
    // and gets refused for a calculation the instrument can do.
    if (exponent < 0) {
      const recip = planPower(g, base, -exponent);
      if (!recip.supported) {
        return unsupported(recip.notes.concat([
          `So the reciprocal of that, ${fmt(value)}, is out of reach too.`,
        ]), { operation: 'power', result: value });
      }
      const pos = g.posOf('D', Math.abs(value));
      const notes = recip.notes.concat([
        'A negative power has no scale of its own. It is read as the ' +
        'reciprocal of the positive power, which the rule does by division.',
      ]);
      const limits = recip.limits.slice();
      if (!Number.isFinite(pos) || pos < 0 || pos > g.axisPx) {
        notes.push(`The answer ${fmt(value)} lies off the scale.`);
        limits.push('answer outside the rule');
      }
      return supported({
        operation: 'power',
        steps: recip.steps.concat([{
          target: 'cursor',
          to: pos,
          say: `Take the reciprocal: the answer is ${fmt(value)}.`,
        }]),
        log: recip.log.concat([`A negative power is a reciprocal: ${fmt(value)}.`]),
        notes,
        limits,
        result: value,
        reading: value,
      });
    }

    // For a power the cursor goes on the BASE, because the base's graduation is
    // what the A and K scales are graduated to meet. For a root the relationship
    // runs the other way: the cursor goes on the RESULT, whose graduation on
    // A or K is the root itself. Getting this backwards is not a rounding
    // error -- putting the cursor on 144 instead of 12 reads 20736.
    // A root is recognised by its exponent, not by whether the value happens to
    // round trip. 7 ^ 3 also satisfies pow(result, 1/3) == base, so testing the
    // arithmetic labels a cube as a cube root and puts the cursor on the answer
    // instead of the base, which reads 49 rather than 343.
    const isRoot = Math.abs(exponent - 0.5) < 1e-12 ||
      Math.abs(exponent - 1 / 3) < 1e-12;
    const looksRoot = isRoot;
    const onScale = looksRoot ? value : base;
    const scale = exponent === 2 || exponent === 0.5 ? 'A' : 'K';
    const scaleNote = scale === 'A'
      ? 'The A scale carries squares: its 7 graduation sits where D reads 49, ' +
        'and its 7 also sits where D reads 49 read as the root. A takes the ' +
        'square root of whatever D shows beneath it.'
      : 'The K scale carries cubes: its 3 graduation sits where D reads 27, and ' +
        'K takes the cube root of whatever D shows beneath it.';

    if (exponent === 2 || exponent === 0.5 || exponent === 3 || exponent === 1 / 3) {
      const pos = g.posOf(scale, Math.abs(onScale));
      // Declared before the steps that narrate it.
      const reading = looksRoot ? g.read(scale, pos) : g.read('D', pos);
      steps.push({
        target: 'cursor',
        to: pos,
        say: looksRoot
          ? `Move the cursor to ${fmt(Math.abs(onScale))} on D, where ${scale} reads its root.`
          : `Move the cursor to ${fmt(Math.abs(onScale))} on the ${scale} scale.`,
      });
      steps.push({
        target: 'cursor',
        to: pos,
        say: looksRoot
          ? `The ${scale} scale reads ${fmt(reading)} there.`
          : `Read against D: ${fmt(value)}.`,
      });

      // For a power this is what D shows under the base's graduation. For a root it
      // is the scale's own graduation, which is the answer -- D under the cursor
      // still shows the radicand, so reading D there reports the input instead.
      const notes = [scaleNote];
      const x = g.posOf('D', Math.abs(onScale));
      const limits = [];

      if (!Number.isFinite(pos) || pos < 0 || pos > g.axisPx) {
        notes.push(
          `${fmt(onScale)} lies outside the rule's span, so the cursor cannot ` +
          `physically reach it. The answer ${fmt(value)} is still correct.`,
        );
        limits.push('operand outside the rule');
      }

      return supported({
        operation: looksRoot ? 'root' : 'power',
        steps,
        log: [
          looksRoot
            ? `Set the cursor on ${fmt(Math.abs(onScale))} of D; ${scale} reads its root there.`
            : `Set the cursor on ${fmt(Math.abs(onScale))} of ${scale}.`,
          `Read ${fmt(reading)}.`,
        ],
        notes,
        limits,
        result: value,
        reading,
      });
    }

    if (exponent < 0) {
      // A negative power is a reciprocal, which the rule does directly by
      // dividing 1 by the positive power. Refusing it would be wrong.
      const recip = planPower(g, base, -exponent);
      if (!recip.supported) return recip;
      const pos = g.posOf('D', Math.abs(value));
      const stepsNeg = recip.steps.concat([{
        target: 'cursor',
        to: pos,
        say: `Take the reciprocal: the answer is ${fmt(value)}.`,
      }]);
      return supported({
        operation: 'power',
        steps: stepsNeg,
        log: recip.log.concat([`A negative power is a reciprocal: ${fmt(value)}.`]),
        notes: recip.notes.concat([
          'A negative power has no scale of its own. It is read as the ' +
          'reciprocal of the positive power, which the rule performs directly.',
        ]),
        limits: recip.limits,
        result: value,
        reading: value,
      });
    }

    {
      // A general exponent has no dedicated scale on the rule. Repeating a
      // multiplication is the honest fallback.
      // eslint-disable-next-line no-lone-blocks
      const notes = [
        `This rule has no scale for the power ${fmt(exponent)}. ` +
        'Raise by repeated multiplication on C against D instead.',
      ];
      if (Number.isInteger(exponent) && exponent > 0 && exponent <= 8) {
        // Each pass multiplies the running value by the base, so the slide is
        // set against what we have so far and read at the running product.
        // Reading the base every time would just square it repeatedly instead
        // of raising it.
        let acc = 1;
        const st = [];
        const final = [];
        for (let i = 0; i < exponent; i++) {
          const slideTo = g.posOf('D', acc);
          st.push({
            target: 'slide',
            to: slideTo,
            say: i === 0
              ? `Set the C index against ${fmt(base)} on D.`
              : `Re-set the C index against the running value ${fmt(acc)}.`,
          });
          const readAt = g.read('D', g.posOf('C', base) + slideTo);
          acc = readAt;
          st.push({
            target: 'cursor',
            to: g.posOf('D', acc),
            say: `That reads ${fmt(acc)} on D.`,
          });
          final.push(acc);
        }

        const offRule = final.some((v) => {
          const x = g.posOf('D', v);
          return !Number.isFinite(x) || x < 0 || x > g.axisPx;
        });
        const limitNotes = offRule
          ? [`The running value leaves the ${g.decades} decades this rule spans ` +
             `before the last pass. The result ${fmt(value)} is correct, but the ` +
             'rule cannot hold every intermediate, which is exactly why nobody ' +
             'does large powers this way.']
          : [];
        const allLimits = offRule ? ['intermediate leaves the rule'] : [];

        if (offRule) {
          // Still return the true value, but do not claim the rule performed it.
          return supported({
            operation: 'power',
            steps: st,
            log: [`Raise ${fmt(base)} to ${exponent} by repeated multiplication.`,
              `Result ${fmt(value)}, though the rule runs out of scale part way.`],
            notes: notes.concat(limitNotes),
            limits: allLimits,
            result: value,
            reading: value,
          });
        }

        return supported({
          operation: 'power',
          steps: st,
          log: [`Raise ${fmt(base)} to ${exponent} by repeated multiplication.`,
            `Result ${fmt(value)}.`],
          notes,
          result: value,
          reading: acc,
        });
      }
      return unsupported(notes.concat([
        `The answer, ${fmt(value)}, will not fit within the ${g.decades} ` +
        'decades this rule spans, and there is no scale for this power.',
      ]), { result: value, operation: 'power' });
    }
  }

  /**
   * Sine, cosine and tangent, read off the projected S and T scales against CI.
   * Note the sine is NOT read off D: at an S graduation D shows cosecant.
   */
  function planTrig(g, name, degrees) {
    const scale = name === 'tan' ? 'T' : 'S';

    // There is no cosine scale. cos(t) is sin(90 - t), so the cursor goes to the
    // complementary angle on S. Asking S directly for the cosine would read
    // sin(cos(t)) and report a wrong answer that looks plausible.
    const onScale = name === 'cos' ? Math.abs(90 - Math.abs(degrees)) : Math.abs(degrees);
    const value = name === 'tan'
      ? Math.tan(degrees / DEG)
      : (name === 'sin' ? Math.sin : Math.cos)(degrees / DEG);

    const pos = g.posOf(scale, onScale);
    const steps = [];
    steps.push({
      target: 'cursor',
      to: pos,
      say: name === 'cos'
        ? `Cosine is read as sine of the complement: put the cursor at ${fmt(onScale)} degrees on S, since cos(${fmt(Math.abs(degrees))}) = sin(${fmt(onScale)}).`
        : `Move the cursor to ${fmt(onScale)} degrees on the ${scale} scale.`,
    });
    steps.push({
      target: 'cursor',
      to: pos,
      say: `Read the answer against CI: ${fmt(value)}.`,
    });

    const notes = [
      name === 'cos'
        ? 'There is no C scale on a slide rule. The cosine of an angle is read ' +
          'as the sine of its complement, which is why the cursor is set to ' +
          `${fmt(onScale)} degrees rather than ${fmt(Math.abs(degrees))}.`
        : name === 'sin'
          ? 'Sine is read against CI, not D. Under an S graduation D shows the ' +
            'cosecant, which is why the reciprocal scale is needed.'
          : 'Tangent is read against CI for the same reason as sine.',
    ];

    let limits = [];
    if (pos < 0) {
      notes.push(
        `${fmt(degrees)} degrees sits left of the index, on the part of the slide ` +
        'that overhangs the stock. The cursor reaches it, but the reading runs off the scale.',
      );
      limits.push('angle on the overhang');
    }
    if (pos > g.axisPx) {
      notes.push(
        `${fmt(degrees)} degrees is too small to show on this scale. ` +
        'A real rule would use the ST scale for it.',
      );
      limits.push('angle too small to resolve');
    }

    return supported({
      operation: name,
      steps,
      log: [name === 'cos'
        ? `Read cos(${fmt(Math.abs(degrees))}) as sin of ${fmt(onScale)} degrees.`
        : `Set the cursor on ${fmt(onScale)} degrees of ${scale}.`,
      `Read ${fmt(value)} against CI.`],
      notes,
      limits,
      result: value,
      reading: g.read('CI', pos),
    });
  }

  /**
   * Recursively plan the root of the tree. Returns a supported plan for the
   * outermost operation, or an unsupported one explaining why not.
   */
  function planNode(g, node) {
    switch (node.kind) {
      case 'number':
        return unsupported(['That is just a number, not a calculation.']);

      case 'unary':
        // A leading minus is a sign convention, not a calculation.
        return planNode(g, node.argument);

      case 'call': {
        const value = evaluate(node);
        if (node.source === 'sqrt' || node.source === 'cbrt') {
          const inner = evaluate(node.argument);
          return planPower(g, inner, node.source === 'sqrt' ? 0.5 : 1 / 3);
        }
        if (node.source === 'ln' || node.source === 'log10' || node.source === 'log') {
          // Reading a logarithm needs the Ln or C scales read against D, and the
          // plan verified that; the narration explains the two step read.
          const pos = g.posOf('D', value);
          const scale = node.source === 'ln' ? 'Ln' : 'C';
          const steps = [
            {
              target: 'cursor',
              to: pos,
              say: `Put the cursor on ${fmt(evaluate(node.argument))} on D.`,
            },
            {
              target: 'cursor',
              to: pos,
              say: node.source === 'ln'
                ? `Read the Ln scale against it: ${fmt(value)}.`
                : `Read the mantissa on ${scale} and count the decades on D to get ${fmt(value)}.`,
            },
          ];
          return supported({
            operation: node.source,
            steps,
            log: [steps[0].say, steps[1].say],
            notes: node.source === 'ln'
              ? ['The Ln scale on a four decade rule tops out at 9.21, so ln of ' +
                 'anything above e^9.21 has no graduation to read.']
              : [],
            result: value,
            reading: g.read('D', pos),
          });
        }
        if (node.source === 'sin' || node.source === 'cos' || node.source === 'tan') {
          return planTrig(g, node.source, evaluate(node.argument));
        }
        if (node.source === 'asin' || node.source === 'acos' || node.source === 'atan') {
          return unsupported([
            'Inverse trigonometry is not implemented yet. It depends on the ST ' +
            'scale graduations lining up with the projected scales, and that ' +
            'alignment has not been verified against a physical rule. Guessing ' +
            'it would produce an animation that looks right and teaches the ' +
            'wrong method.',
          ], { operation: node.source, result: value });
        }
        return unsupported([`${node.source} has no scale on this rule.`], { result: value });
      }

      case 'binary': {
        const op = node.operator;
        if (op === '+' || op === '-') {
          const word = op === '+' ? 'add' : 'subtract';
          return unsupported([
            `A slide rule cannot ${word}. That is the single most important thing ` +
            'to know about the instrument: it multiplies and divides by counting ' +
            'distances, but it has no way to line up two numbers and read the ' +
            'gap between them.',
          ], { operation: op, result: evaluate(node) });
        }
        if (op === '*' || op === '/') {
          const a = evaluate(node.left);
          const b = evaluate(node.right);
          return op === '*' ? planMultiply(g, a, b) : planDivide(g, a, b);
        }
        if (op === '^') {
          const base = evaluate(node.left);
          const exponent = evaluate(node.right);
          return planPower(g, base, exponent);
        }
        return unsupported([`${op} has no place on a slide rule.`]);
      }

      default:
        return unsupported(['That cannot be planned.']);
    }
  }

  /**
   * Compile expression text into an animation plan.
   *
   * @param {string} text user typed expression
   * @param {{axisPx:number, decades:number}} rule geometry
   * @returns {object} a plan; always has `supported`, `steps`, `notes`
   */
  function plan(text, rule) {
    let ast;
    try {
      ast = parse(text);
    } catch (err) {
      if (err instanceof ParseError) {
        return unsupported([err.message], { error: err });
      }
      throw err;
    }

    let result;
    try {
      result = evaluate(ast);
    } catch (err) {
      if (err instanceof ParseError) {
        return unsupported([err.message], { error: err });
      }
      throw err;
    }

    const g = geometry(rule || { axisPx: 1180, decades: 4 });
    const out = planNode(g, ast);

    // Fill in what every plan reports, using the true arithmetic result so the
    // UI can always show what the answer is even when the rule cannot show it.
    out.text = text;
    out.ast = ast;
    if (out.result === null || out.result === undefined) out.result = result;

    if (out.supported && out.reading !== null && Number.isFinite(out.reading)) {
      out.error = out.result !== 0
        ? Math.abs((out.reading - out.result) / out.result) * 100
        : 0;
    }
    return out;
  }

  return { plan };
});
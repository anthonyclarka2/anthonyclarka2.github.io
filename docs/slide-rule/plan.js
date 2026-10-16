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
   * Bring a value onto the rule's single decade, returning what was left out.
   *
   * The stock carries one decade of graduations, so an operand has to be brought
   * into [1, 10) before it can be set on it. The decades that came off are
   * carried in the reader's head and put back on the answer, which is the whole
   * of what "placing the decimal point" means on an instrument like this. Doing
   * it in one place is why multiplication and division no longer refuse every
   * operand above ten, which they did while the model gave the stock four
   * decades to work with.
   */
  function onDecade(value) {
    const abs = Math.abs(value);
    if (!Number.isFinite(abs) || abs <= 0) return { value: abs, shift: 0 };
    const shift = Math.floor(Math.log10(abs) + 1e-12);
    return { value: abs / Math.pow(10, shift), shift };
  }

  /** True when a position lies within the span of the rule. */
  function onRule(g, x) {
    return Number.isFinite(x) && x >= 0 && x <= g.axisPx;
  }

  /**
   * The rule's span as prose.
   *
   * It is ONE decade -- the graduated length of the stock -- and saying "the 1
   * decades this rule spans" is the kind of sentence that makes a reader
   * distrust the rest of the page. Kept in one place so the narrations that
   * mention the span cannot drift apart.
   */
  function spanText(g) {
    return g.decades === 1
      ? 'the single decade this rule spans'
      : `the ${g.decades} decades this rule spans`;
  }

  /**
   * The narration for operands that had to be brought down onto the rule.
   *
   * Said once, plainly, because it is the step a learner misses: the rule does
   * not carry 144, it carries 1.44, and the hundreds are arithmetic the reader
   * does in their head.
   */
  function decadeNote(moved) {
    const shifted = moved.filter((m) => m.from !== m.to);
    if (shifted.length === 0) return [];
    const list = shifted.map((m) => `${fmt(m.from)} as ${fmt(m.to)}`).join(' and ');
    return [
      `${list}. An operand above ten does not fit the stock's one decade, so it `
      + 'is brought down to its own mantissa and the decades are put back on the '
      + 'answer. That is what a person does with the decimal point.',
    ];
  }

  /**
   * Multiply and divide, via C against D. This is the operation a slide rule
   * was built for and the only one that genuinely moves the slide.
   *
   * Both operations come down to the same two settings, which is why they are
   * written together here and why the instrument shows them on adjacent rows:
   *
   *   - the LEFT index of C against a value on D multiplies by what C's marks
   *     read, and the RIGHT index does the same ten times smaller. A reader
   *     picks whichever keeps the answer on the stock, and carries the ten.
   *   - for division the cursor goes on the dividend, the divisor is brought
   *     under it, and the answer is read at C's index -- again whichever index
   *     is on the stock, and again carrying the ten.
   *
   * Everything is stated in mantissas: the operands are brought to [1, 10) and
   * the decades are arithmetic the reader does with the decimal point.
   */
  function planMultiply(g, a, b) {
    // The larger operand stays on D, where the answer is read; the smaller rides
    // the slide. Either order gives the same product.
    let x = a;
    let y = b;
    if (Math.abs(x) < Math.abs(y)) { x = b; y = a; }

    const nx = onDecade(x);
    const ny = onDecade(y);
    const sign = (x < 0) !== (y < 0) ? -1 : 1;
    const posX = g.posOf('D', nx.value);
    const posY = g.posOf('C', ny.value);

    // Past ten the product runs off the end of the stock, and a reader moves to
    // C's right index instead: the same setting, the answer one place smaller.
    const straight = posX + posY;
    const wrapped = posX - g.axisPx + posY;
    const useWrapped = !onRule(g, straight) && onRule(g, wrapped);
    const from = useWrapped ? posX - g.axisPx : posX;
    const cursorTo = useWrapped ? wrapped : straight;
    const decades = nx.shift + ny.shift + (useWrapped ? 1 : 0);
    const shown = g.read('D', cursorTo);
    const reading = sign * shown * Math.pow(10, decades);

    const index = useWrapped ? 'right-hand index (the 10) of C' : 'index of C';
    const steps = [
      {
        target: 'slide',
        to: from,
        say: `Slide the rule until the ${index} sits against ${fmt(nx.value)} on D.`,
      },
      {
        target: 'cursor',
        to: posX,
        say: `The cursor marks ${fmt(nx.value)} on D, the value just set.`,
      },
      {
        target: 'cursor',
        to: cursorTo,
        say: `${fmt(ny.value)} on the slide now crosses D at ${fmt(shown)}`
          + `${useWrapped ? ', read against the right-hand index' : ''}`
          + `${decades ? `, and carrying the decades off the operands gives ${fmt(reading)}` : ''}.`,
      },
    ];

    const notes = decadeNote([
      { from: Math.abs(x), to: nx.value },
      { from: Math.abs(y), to: ny.value },
    ]);
    if (useWrapped) {
      notes.push(
        `${fmt(nx.value)} times ${fmt(ny.value)} passes ten, so the answer is read `
        + 'against the right-hand index of C rather than the left. That is the '
        + 'same setting read one place smaller, and it is why the rule has an '
        + 'index at each end.',
      );
    }

    return supported({
      operation: 'multiply',
      steps,
      log: [
        decimalsNote(nx, ny),
        `Set ${fmt(nx.value)} against the ${index}.`,
        `Read the answer where ${fmt(ny.value)} on C crosses D: ${fmt(shown)}.`,
        decades ? `Put the decades back: ${fmt(reading)}.` : null,
      ].filter(Boolean),
      notes,
      result: x * y,
      reading,
      // A real rule multiplies any pair of mantissas, so there is nothing here
      // that the instrument cannot do. The limit list stays empty on purpose.
      limits: [],
    });
  }

  /** The one-line log entry for operands that came down a decade or more. */
  function decimalsNote(nx, ny) {
    const moved = [nx, ny].filter((n) => n.shift !== 0);
    if (moved.length === 0) return null;
    const total = moved.reduce((sum, n) => sum + n.shift, 0);
    return `Bring the operands onto the rule, carrying ${total} decade`
      + `${total === 1 ? '' : 's'}.`;
  }

  /** Division: the dividend over the divisor, read at C's index. */
  function planDivide(g, a, b) {
    const na = onDecade(a);
    const nb = onDecade(b);
    const sign = (a < 0) !== (b < 0) ? -1 : 1;
    const posA = g.posOf('D', na.value);
    const posB = g.posOf('C', nb.value);

    // The slide brings the divisor under the dividend. The offset is the same
    // whichever index is read afterwards, so only WHICH index changes.
    const slideTo = posA - posB;
    const atLeft = slideTo;
    const atRight = slideTo + g.axisPx;
    // The quotient is read at whichever of C's two indexes is on the stock. A
    // quotient below one puts the left index off the left edge, and then it is
    // the right index that is read and the ten that is carried.
    const useRight = !onRule(g, atLeft) && onRule(g, atRight);
    const cursorTo = useRight ? atRight : atLeft;
    const decades = na.shift - nb.shift + (useRight ? -1 : 0);
    const shown = g.read('D', cursorTo);
    const reading = sign * shown * Math.pow(10, decades);
    const trueResult = a / b;

    const steps = [
      {
        target: 'cursor',
        to: posA,
        say: `Put the cursor on ${fmt(na.value)} on D, the dividend brought onto the rule.`,
      },
      {
        target: 'slide',
        to: slideTo,
        say: `Slide the rule until ${fmt(nb.value)} on C sits under the cursor, `
          + `against the ${fmt(na.value)} on D.`,
      },
      {
        target: 'cursor',
        to: cursorTo,
        say: `Read the ${useRight ? 'right-hand index (the 10)' : 'index'} of C `
          + `against D: ${fmt(shown)}`
          + `${decades ? `, and carrying the decades gives ${fmt(reading)}` : ''}.`,
      },
    ];

    const notes = decadeNote([
      { from: Math.abs(a), to: na.value },
      { from: Math.abs(b), to: nb.value },
    ]);
    if (useRight) {
      notes.push(
        `${fmt(na.value)} over ${fmt(nb.value)} is less than one, so the answer is `
        + 'read at the right-hand index of C and comes out ten times smaller than '
        + 'the graduation it is read against. That is the same setting read the '
        + 'other way, and it is why the rule has an index at each end.',
      );
    }
    const limits = !onRule(g, cursorTo)
      ? ['the slide cannot travel far enough to bring both operands into view']
      : [];

    return supported({
      operation: 'divide',
      steps,
      log: [
        decimalsNote(na, nb),
        `Set the cursor on ${fmt(na.value)} on D, and bring ${fmt(nb.value)} on C under it.`,
        `Read the ${useRight ? 'right-hand' : 'left-hand'} index of C against D: ${fmt(shown)}.`,
        decades ? `Put the decades back: ${fmt(trueResult)}.` : null,
      ].filter(Boolean),
      notes,
      limits,
      result: trueResult,
      reading,
    });
  }

  /**
   * Powers and roots, read straight off A, B and K with the slide at rest.
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

    /* Which scale carries which direction of the relationship, and how the
       operand is brought onto the rule.

       A and K are D's own graduations compressed two and three times, so the
       rule reads v^2 and v^3 by setting the cursor on v on D and looking at A or
       K, and it reads roots the other way round: the cursor goes on the value on
       A or K and D underneath shows the root. That is the direction the
       instrument works in, and getting it backwards is not a rounding error --
       putting the cursor on 144 instead of 12 reads 20736.

       The operand is then brought inside one cycle of the scale it is set on, and
       the decades that came off it are carried into the answer, which is exactly
       what a reader does with the decimal point. A square root shifts by an EVEN
       number of decades, because A carries two decades of value and half a decade
       is not a decade anyone can place; a cube root shifts by a multiple of
       three. */
    const isRoot = Math.abs(exponent - 0.5) < 1e-12 ||
      Math.abs(exponent - 1 / 3) < 1e-12;
    const answerScale = exponent === 2 || exponent === 0.5 ? 'A' : 'K';
    const cycles = answerScale === 'A' ? 2 : 3;
    // The operand is the number that goes ON the rule in both directions: the
    // base for a power, the radicand for a root. The scale it is set on and the
    // scale the answer is read from are what swap over.
    const operand = Math.abs(base);
    const operandCycle = isRoot ? cycles : 1;
    const shift = operandCycle * Math.floor(Math.log10(operand) / operandCycle + 1e-12);
    const mantissa = operand / Math.pow(10, shift);
    const cursorScale = isRoot ? answerScale : 'D';
    const readScale = isRoot ? 'D' : answerScale;

    const scaleNote = answerScale === 'A'
      ? 'The A scale is D\'s graduations compressed twice over: its 2 sits where ' +
        'D reads the square root of 2, and the square of 7 is read from D\'s 7 ' +
        'underneath its 49.'
      : 'The K scale is D\'s graduations compressed three times over: its 2 sits ' +
        'where D reads the cube root of 2, and the cube of 7 is read from D\'s 7 ' +
        'underneath its 343.';

    if (exponent === 2 || exponent === 0.5 || exponent === 3 || exponent === 1 / 3) {
      const pos = g.posOf(cursorScale, mantissa);
      // What the rule itself shows at the cursor, before the carried decades are
      // put back.
      const shown = g.read(readScale, pos);
      // The decades carried off the operand, brought back on the answer: doubled
      // and tripled for a power because the value is squared or cubed, and divided
      // the same way for a root.
      const reading = shown * Math.pow(10, isRoot ? shift / cycles : shift * cycles);
      const carried = Math.abs(shift) > 1e-9;

      const steps = [
        {
          target: 'cursor',
          to: pos,
          say: isRoot
            ? `Move the cursor to ${fmt(mantissa)} on ${answerScale}, where D reads its root.`
            : `Move the cursor to ${fmt(mantissa)} on D.`,
        },
        {
          target: 'cursor',
          to: pos,
          say: isRoot
            ? `Read ${fmt(shown)} on D there${carried ? `, and carry the ${shift} decades off the operand: ${fmt(value)}` : ''}.`
            : `Read ${fmt(shown)} on ${answerScale} under the cursor${carried ? `, and carry the ${shift} decades off the operand: ${fmt(value)}` : ''}.`,
        },
      ];

      const notes = [scaleNote];
      const limits = [];
      if (carried) {
        notes.push(
          `${fmt(operand)} does not fit one cycle of ${cursorScale}, so it is ` +
          `brought down ${Math.abs(shift)} decade${Math.abs(shift) === 1 ? '' : 's'} ` +
          `to ${fmt(mantissa)} and the same decades are carried back out of the ` +
          'answer. That is what a person does with the decimal point.',
        );
      }

      if (!Number.isFinite(pos) || pos < 0 || pos > g.axisPx) {
        notes.push(
          `${fmt(mantissa)} lies outside the rule's span, so the cursor cannot ` +
          `physically reach it. The answer ${fmt(value)} is still correct.`,
        );
        limits.push('operand outside the rule');
      }

      return supported({
        operation: isRoot ? 'root' : 'power',
        steps,
        log: [
          isRoot
            ? `Set the cursor on ${fmt(mantissa)} of ${answerScale}; D reads its root there.`
            : `Set the cursor on ${fmt(mantissa)} of D.`,
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
          ? [`The running value leaves ${spanText(g)} ` +
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
        `The answer, ${fmt(value)}, will not fit within ${spanText(g)}, ` +
        'and there is no scale for this power.',
      ]), { result: value, operation: 'power' });
    }
  }

  /**
   * Sine, cosine and tangent, read off the projected S and T scales against D.
   *
   * The trig scales are laid out so that D carries TEN TIMES the trig value:
   * sin 30 degrees sits over D's 5, not over D's 0.5, because both scales share
   * the same one-decade length and a sine never exceeds one. The reader places
   * the decimal point, which is exactly what an instrument of this period asks
   * of them.
   *
   * This replaced a reading against CI. CI at an S graduation shows the
   * reciprocal of the D reading -- the cosecant over ten -- so the plan used to
   * report a number that looked like an answer and was not one. D is printed on
   * both faces, so a sine can be read whichever side is up; that is what settled
   * the old question of whether the two scales had to come from different faces.
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
    // What the cursor actually shows on D, and what that means. Both are carried:
    // the narration names the number a reader would see, the result is the
    // decimal the reader writes down.
    const onD = g.read('D', pos);
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
      say: `Read the answer on D: ${fmt(onD)}. The ${name} is ${fmt(value)}, `
        + `one place left of what D shows.`,
    });

    const notes = [
      name === 'cos'
        ? 'There is no C scale on a slide rule. The cosine of an angle is read ' +
          'as the sine of its complement, which is why the cursor is set to ' +
          `${fmt(onScale)} degrees rather than ${fmt(Math.abs(degrees))}.`
        : name === 'sin'
          ? 'Sine is read against D, which carries ten times the trig value. The ' +
            'cursor sits where D shows ' + fmt(onD) + '; the sine is a tenth of that.'
          : 'Tangent is read against D, as ten times the tangent, for the same ' +
            'reason as sine: a tangent below 45 degrees is less than one.',
    ];

    let limits = [];
    if (pos < 0) {
      // Below the smallest angle the row carries. It is not "left of the index on
      // the overhang": nothing is printed there, and the row simply begins at its
      // first graduation.
      notes.push(
        `${fmt(onScale)} degrees is smaller than the ${scale} row begins at, so ` +
        'there is no graduation to set the cursor on. A rule answers this with ' +
        'its ST row, which carries angles below the ones S and T can resolve.',
      );
      limits.push('angle below the row');
    }
    if (pos > g.axisPx + 1e-9) {
      notes.push(
        name === 'tan'
          ? `${fmt(onScale)} degrees is past 45, where the tangent exceeds one and ` +
            'its graduation would run off the end of the stock. That is what the ' +
            'ST row is for.'
          : `${fmt(onScale)} degrees is past the end of the S row.`,
      );
      limits.push('angle past the end of the row');
    }

    return supported({
      operation: name,
      steps,
      log: [name === 'cos'
        ? `Read cos(${fmt(Math.abs(degrees))}) as sin of ${fmt(onScale)} degrees.`
        : `Set the cursor on ${fmt(onScale)} degrees of ${scale}.`,
      `Read ${fmt(value)} on D, one place left of its ${fmt(onD)}.`],
      notes,
      limits,
      result: value,
      // The number the rule actually shows, divided by the ten the layout asks
      // the reader to carry in their head. Kept as the divided value so that the
      // error the page reports is the error of the answer, not of the carriage.
      reading: onD / 10,
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
          // The rule carries L, the common logarithm, printed on the back and
          // read against D. A natural logarithm has no scale of its own on this
          // instrument: it is a common logarithm multiplied by ln(10), which is
          // one more setting, and the narration says so rather than pretending
          // the instrument can do it in a single read.
          const argument = evaluate(node.argument);
          const pos = g.posOf('D', argument);
          const common = Math.log10(argument);
          const steps = [
            {
              target: 'cursor',
              to: pos,
              say: `Put the cursor on ${fmt(argument)} on D.`,
            },
            {
              target: 'cursor',
              to: pos,
              say: node.source === 'ln'
                ? `Read L against it: ${fmt(common)}. The natural log is that `
                  + `times 2.3026, one more setting on C and D: ${fmt(value)}.`
                : `Read L against it: ${fmt(value)}.`,
            },
          ];
          const notes = node.source === 'ln'
            ? ['The rule has no natural-log scale. ln of a number is its common '
               + 'logarithm multiplied by ln(10), so it takes two settings: read '
               + 'L for the common logarithm, then multiply by 2.3026.']
            : [];
          return supported({
            operation: node.source,
            steps,
            log: [steps[0].say, steps[1].say],
            notes,
            result: value,
            // For a common logarithm the rule reads the answer exactly. For a
            // natural one it reads the common logarithm and the multiplication
            // is a second setting, so the plan's own value is what the two
            // settings arrive at; reporting the first read here would show a
            // percentage error that measures the conversion factor, not a
            // mistake.
            reading: node.source === 'ln' ? value : g.read('L', pos),
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

    // The default geometry is the instrument's own: one decade, and the axis the
    // graduated length is measured at in rule units. A caller that passes its own
    // `rule` -- the page does -- overrides both.
    const g = geometry(rule || { axisPx: 1544, decades: 1 });
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
  // ============================================================================
  // 1. MOTEUR DE RENDU MATHÉMATIQUE LATEX NATIF (100% AUTONOME HORS-LIGNE)
  // ============================================================================

  const LATEX_SYMBOLS = {
    '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ', '\\epsilon': 'ε',
    '\\varepsilon': 'ε', '\\zeta': 'ζ', '\\eta': 'η', '\\theta': 'θ', '\\vartheta': 'ϑ',
    '\\iota': 'ι', '\\kappa': 'κ', '\\lambda': 'λ', '\\mu': 'μ', '\\nu': 'ν',
    '\\xi': 'ξ', '\\pi': 'π', '\\rho': 'ρ', '\\sigma': 'σ', '\\tau': 'τ',
    '\\upsilon': 'υ', '\\phi': 'φ', '\\varphi': 'ϕ', '\\chi': 'χ', '\\psi': 'ψ',
    '\\omega': 'ω',
    '\\Gamma': 'Γ', '\\Delta': 'Δ', '\\Theta': 'Θ', '\\Lambda': 'Λ', '\\Xi': 'Ξ',
    '\\Pi': 'Π', '\\Sigma': 'Σ', '\\Upsilon': 'Υ', '\\Phi': 'Φ', '\\Psi': 'Ψ',
    '\\Omega': 'Ω',
    '\\pm': '±', '\\mp': '∓', '\\times': '×', '\\div': '÷', '\\cdot': '·',
    '\\ast': '∗', '\\star': '⋆', '\\circ': '∘', '\\bullet': '•',
    '\\leq': '≤', '\\le': '≤', '\\geq': '≥', '\\ge': '≥', '\\neq': '≠', '\\ne': '≠',
    '\\approx': '≈', '\\equiv': '≡', '\\sim': '∼', '\\simeq': '≃', '\\propto': '∝',
    '\\infty': '∞', '\\partial': '∂', '\\nabla': '∇', '\\forall': '∀', '\\exists': '∃',
    '\\nexists': '∄', '\\emptyset': '∅', '\\varnothing': '∅',
    '\\in': '∈', '\\notin': '∉', '\\ni': '∋', '\\subset': '⊂', '\\subseteq': '⊆',
    '\\supset': '⊃', '\\supseteq': '⊇', '\\cup': '∪', '\\cap': '∩',
    '\\to': '→', '\\rightarrow': '→', '\\leftarrow': '←', '\\leftrightarrow': '↔',
    '\\Rightarrow': '⇒', '\\Leftarrow': '⇐', '\\Leftrightarrow': '⇔', '\\iff': '⇔',
    '\\mapsto': '↦', '\\implies': '⇒',
    '\\dots': '…', '\\cdots': '⋯', '\\ldots': '…', '\\vdots': '⋮',
    '\\quad': ' ', '\\qquad': '  ', '\\,': ' ', '\\;': ' ', '\\!': ''
  };

  const LATEX_FUNCTIONS = new Set([
    'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan',
    'sinh', 'cosh', 'tanh', 'ln', 'log', 'exp', 'lim', 'sup', 'inf', 'max', 'min',
    'det', 'dim', 'ker', 'deg', 'gcd', 'Pr', 'arg'
  ]);

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function extractBracedArg(str, startIndex) {
    let i = startIndex;
    while (i < str.length && str[i] === ' ') i++;
    if (i >= str.length) return { content: '', nextIndex: i };
    if (str[i] !== '{') {
      if (str[i] === '\\') {
        let j = i + 1;
        while (j < str.length && /[a-zA-Z]/.test(str[j])) j++;
        return { content: str.slice(i, j), nextIndex: j };
      }
      return { content: str[i], nextIndex: i + 1 };
    }
    let depth = 0;
    let contentStart = i + 1;
    for (; i < str.length; i++) {
      if (str[i] === '{' && (i === 0 || str[i - 1] !== '\\')) depth++;
      else if (str[i] === '}' && (i === 0 || str[i - 1] !== '\\')) {
        depth--;
        if (depth === 0) {
          return { content: str.slice(contentStart, i), nextIndex: i + 1 };
        }
      }
    }
    return { content: str.slice(contentStart), nextIndex: str.length };
  }

  function parseLatexExpression(latex) {
    if (!latex) return '';
    let s = String(latex).trim();
    s = s.replace(/^\$\$([\s\S]*)\$\$$/, '$1').replace(/^\$([\s\S]*)\$$/, '$1');
    s = s.replace(/\\left\s*([()[\]|])/g, '$1').replace(/\\right\s*([()[\]|])/g, '$1');
    s = s.replace(/\\left\\\{/g, '{').replace(/\\right\\\}/g, '}');

    let out = '';
    let i = 0;
    while (i < s.length) {
      const ch = s[i];

      if (ch === ' ') {
        i++;
        continue;
      }

      // Environments: \begin{pmatrix} ... \end{pmatrix}
      if (s.startsWith('\\begin{', i)) {
        const envNameObj = extractBracedArg(s, i + 6);
        const envName = envNameObj.content;
        const endTag = `\\end{${envName}}`;
        const endIdx = s.indexOf(endTag, envNameObj.nextIndex);
        if (endIdx !== -1) {
          const body = s.slice(envNameObj.nextIndex, endIdx);
          const rows = body.split(/\\\\/).map((r) => r.trim()).filter(Boolean);
          let matrixHtml = '<span class="math-matrix">';
          for (const row of rows) {
            const cells = row.split('&');
            matrixHtml += '<span class="math-matrix-row">';
            for (const cell of cells) {
              matrixHtml += `<span class="math-matrix-cell">${parseLatexExpression(cell.trim())}</span>`;
            }
            matrixHtml += '</span>';
          }
          matrixHtml += '</span>';
          out += matrixHtml;
          i = endIdx + endTag.length;
          continue;
        }
      }

      if (ch === '\\') {
        let j = i + 1;
        if (j < s.length && !/[a-zA-Z]/.test(s[j])) {
          const twoChar = s.slice(i, j + 1);
          if (LATEX_SYMBOLS[twoChar] !== undefined) {
            out += `<span class="math-op">${escapeHtml(LATEX_SYMBOLS[twoChar])}</span>`;
          } else {
            out += escapeHtml(s[j]);
          }
          i = j + 1;
          continue;
        }
        while (j < s.length && /[a-zA-Z]/.test(s[j])) j++;
        const cmd = s.slice(i, j);
        const cmdName = cmd.slice(1);

        if (cmd === '\\frac' || cmd === '\\dfrac' || cmd === '\\tfrac') {
          const num = extractBracedArg(s, j);
          const den = extractBracedArg(s, num.nextIndex);
          out += `<span class="math-frac"><span class="math-frac-num">${parseLatexExpression(num.content)}</span><span class="math-frac-den">${parseLatexExpression(den.content)}</span></span>`;
          i = den.nextIndex;
          continue;
        }

        if (cmd === '\\sqrt') {
          let nextIdx = j;
          let rootIndexHtml = '';
          while (nextIdx < s.length && s[nextIdx] === ' ') nextIdx++;
          if (s[nextIdx] === '[') {
            const closeBracket = s.indexOf(']', nextIdx + 1);
            if (closeBracket !== -1) {
              const rootDegree = s.slice(nextIdx + 1, closeBracket);
              rootIndexHtml = `<sup class="math-sup">${parseLatexExpression(rootDegree)}</sup>`;
              nextIdx = closeBracket + 1;
            }
          }
          const rad = extractBracedArg(s, nextIdx);
          out += `${rootIndexHtml}<span class="math-sqrt"><span class="math-sqrt-stem">√</span><span class="math-sqrt-content">${parseLatexExpression(rad.content)}</span></span>`;
          i = rad.nextIndex;
          continue;
        }

        if (cmd === '\\vec' || cmd === '\\overrightarrow') {
          const arg = extractBracedArg(s, j);
          out += `<span class="math-vec">${parseLatexExpression(arg.content)}</span>`;
          i = arg.nextIndex;
          continue;
        }

        if (cmd === '\\overline' || cmd === '\\bar') {
          const arg = extractBracedArg(s, j);
          out += `<span style="border-top:1.3px solid currentColor;padding-top:1px;">${parseLatexExpression(arg.content)}</span>`;
          i = arg.nextIndex;
          continue;
        }

        if (cmd === '\\text' || cmd === '\\mathrm' || cmd === '\\mathbf') {
          const arg = extractBracedArg(s, j);
          const weight = cmd === '\\mathbf' ? 'font-weight:700;' : '';
          out += `<span style="font-style:normal;${weight}">${escapeHtml(arg.content)}</span>`;
          i = arg.nextIndex;
          continue;
        }

        if (cmd === '\\int' || cmd === '\\oint' || cmd === '\\sum' || cmd === '\\prod' || cmd === '\\lim') {
          const symMap = { '\\int': '∫', '\\oint': '∮', '\\sum': '∑', '\\prod': '∏', '\\lim': 'lim' };
          let k = j;
          let subContent = '';
          let supContent = '';
          for (let pass = 0; pass < 2; pass++) {
            while (k < s.length && s[k] === ' ') k++;
            if (s[k] === '_') {
              const subObj = extractBracedArg(s, k + 1);
              subContent = subObj.content;
              k = subObj.nextIndex;
            } else if (s[k] === '^') {
              const supObj = extractBracedArg(s, k + 1);
              supContent = supObj.content;
              k = supObj.nextIndex;
            }
          }
          const isLim = cmd === '\\lim';
          out += `<span class="math-bigint-wrap">` +
            (supContent ? `<span class="math-bigint-sup">${parseLatexExpression(supContent)}</span>` : '') +
            `<span class="math-bigint-sym" style="${isLim ? 'font-size:1em;font-weight:600;' : ''}">${symMap[cmd]}</span>` +
            (subContent ? `<span class="math-bigint-sub">${parseLatexExpression(subContent)}</span>` : '') +
            `</span>`;
          i = k;
          continue;
        }

        if (LATEX_FUNCTIONS.has(cmdName)) {
          out += `<span class="math-op" style="font-style:normal;font-weight:500;">${escapeHtml(cmdName)}</span>`;
          i = j;
          continue;
        }

        if (LATEX_SYMBOLS[cmd] !== undefined) {
          const sym = LATEX_SYMBOLS[cmd];
          const isGreekLower = /^\\[a-z]+$/.test(cmd) && /[α-ωϑϕϵ]/.test(sym);
          out += `<span class="${isGreekLower ? '' : 'math-op'}">${escapeHtml(sym)}</span>`;
          i = j;
          continue;
        }

        out += `<span>${escapeHtml(cmdName)}</span>`;
        i = j;
        continue;
      }

      if (ch === '^') {
        const sup = extractBracedArg(s, i + 1);
        out += `<sup class="math-sup">${parseLatexExpression(sup.content)}</sup>`;
        i = sup.nextIndex;
        continue;
      }

      if (ch === '_') {
        const sub = extractBracedArg(s, i + 1);
        out += `<sub class="math-sub">${parseLatexExpression(sub.content)}</sub>`;
        i = sub.nextIndex;
        continue;
      }

      if (ch === '{') {
        const grp = extractBracedArg(s, i);
        out += parseLatexExpression(grp.content);
        i = grp.nextIndex;
        continue;
      }

      if (/[0-9]/.test(ch)) {
        out += `<span class="math-num">${ch}</span>`;
        i++;
        continue;
      }

      if (/[+\-=*/<>(),[\]|!]/.test(ch)) {
        const charDisplay = ch === '-' ? '−' : ch;
        out += `<span class="math-op">${escapeHtml(charDisplay)}</span>`;
        i++;
        continue;
      }

      out += `<span>${escapeHtml(ch)}</span>`;
      i++;
    }
    return out;
  }

  function renderLatexToHtml(latex, displayMode = true) {
    const inner = parseLatexExpression(latex);
    return `<span class="math-expr ${displayMode ? 'math-block-display' : ''}">${inner}</span>`;
  }

  function renderRichTextWithLatex(rawText) {
    if (!rawText) return '<span style="color:var(--text-muted);font-style:italic;">Cliquez pour écrire au clavier ou taper du $LaTeX$...</span>';
    const text = String(rawText);
    const tokenRegex = /(\$\$[\s\S]+?\$\$|\$[^$\n]+\$)/g;
    const parts = text.split(tokenRegex);
    return parts.map((part) => {
      if (part.startsWith('$$') && part.endsWith('$$')) {
        return renderLatexToHtml(part.slice(2, -2), true);
      }
      if (part.startsWith('$') && part.endsWith('$')) {
        return renderLatexToHtml(part.slice(1, -1), false);
      }
      return escapeHtml(part);
    }).join('');
  }


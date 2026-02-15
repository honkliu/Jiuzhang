import { marked } from 'marked';
import { markedTerminal } from 'marked-terminal';
import unicodeMath from 'unicode-math';

// Configure marked to use terminal renderer
marked.use(markedTerminal({
  reflowText: true,
  width: 80,
  showSectionPrefix: false,
  unescape: true,
  emoji: false,
}));

/**
 * Build a LaTeX to Unicode conversion map from the unicode-math library
 */
function buildLatexToUnicodeMap() {
  const map = {};

  // Convert unicode-math data to a simple lookup map
  for (const [latexCmd, data] of Object.entries(unicodeMath)) {
    if (data.codePoint) {
      map[latexCmd] = String.fromCodePoint(data.codePoint);
    }
  }

  // Add Greek letters and common math symbols that might be missing
  const additionalMappings = {
    // Greek lowercase
    '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ',
    '\\epsilon': 'ε', '\\varepsilon': 'ε', '\\zeta': 'ζ', '\\eta': 'η',
    '\\theta': 'θ', '\\vartheta': 'ϑ', '\\iota': 'ι', '\\kappa': 'κ',
    '\\lambda': 'λ', '\\mu': 'μ', '\\nu': 'ν', '\\xi': 'ξ',
    '\\pi': 'π', '\\varpi': 'ϖ', '\\rho': 'ρ', '\\varrho': 'ϱ',
    '\\sigma': 'σ', '\\varsigma': 'ς', '\\tau': 'τ', '\\upsilon': 'υ',
    '\\phi': 'φ', '\\varphi': 'φ', '\\chi': 'χ', '\\psi': 'ψ', '\\omega': 'ω',

    // Greek uppercase
    '\\Gamma': 'Γ', '\\Delta': 'Δ', '\\Theta': 'Θ', '\\Lambda': 'Λ',
    '\\Xi': 'Ξ', '\\Pi': 'Π', '\\Sigma': 'Σ', '\\Upsilon': 'Υ',
    '\\Phi': 'Φ', '\\Psi': 'Ψ', '\\Omega': 'Ω',

    // Number sets
    '\\mathbb{C}': 'ℂ', '\\mathbb{R}': 'ℝ', '\\mathbb{Q}': 'ℚ',
    '\\mathbb{Z}': 'ℤ', '\\mathbb{N}': 'ℕ', '\\mathbb{I}': '𝕀',

    // Special symbols
    '\\hbar': 'ℏ', '\\ell': 'ℓ',
  };

  return { ...additionalMappings, ...map };
}

const LATEX_TO_UNICODE = buildLatexToUnicodeMap();

/**
 * Converts LaTeX notation to Unicode symbols for better terminal display
 */
function convertLatexToUnicode(latex) {
  let result = latex;

  // Sort commands by length (longest first) to avoid partial matches
  // e.g., \infty should be matched before \in
  const sortedCommands = Object.entries(LATEX_TO_UNICODE).sort((a, b) => b[0].length - a[0].length);

  // Replace LaTeX commands with Unicode equivalents
  for (const [latexCmd, unicode] of sortedCommands) {
    const escaped = latexCmd.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
    result = result.replace(new RegExp(escaped, 'g'), unicode);
  }

  // Handle superscripts (limited to single digits and simple cases)
  result = result.replace(/\^([0-9])/g, (match, digit) => {
    const superscripts = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
    return superscripts[parseInt(digit)];
  });

  // Handle subscripts (limited to single digits and simple cases)
  result = result.replace(/_([0-9])/g, (match, digit) => {
    const subscripts = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
    return subscripts[parseInt(digit)];
  });

  // Handle simple superscript letters (limited support)
  result = result.replace(/\^([a-z])/g, (match, letter) => {
    const superLetters = { 'n': 'ⁿ', 'i': 'ⁱ', 'x': 'ˣ', 'y': 'ʸ' };
    return superLetters[letter] || `^${letter}`;
  });

  // Handle subscript letters (limited support)
  result = result.replace(/_([a-z])/g, (match, letter) => {
    const subLetters = { 'n': 'ₙ', 'x': 'ₓ', 'i': 'ᵢ', 'j': 'ⱼ' };
    return subLetters[letter] || `_${letter}`;
  });

  // Clean up remaining LaTeX artifacts (braces, etc.)
  // Only remove simple braces that were used for grouping
  result = result.replace(/\{([^}]*)\}/g, '$1');

  return result;
}

/**
 * Renders LaTeX expressions to plain text representation
 * Handles multiple LaTeX formats:
 * - Inline: $...$ or \(...\)
 * - Display: $$...$$ or \[...\]
 * - Square bracket format: [ ... ]
 */
function renderLatex(text) {
  if (!text) return text;

  let result = text;

  // Handle display math with square brackets [ ... ] (common in some systems)
  // Match pattern: [ ...latex... ] potentially followed by space and backslash
  result = result.replace(/\[\s*([^\]]+?)\s*\](\s*\\)?/g, (match, latex, trailing) => {
    // Check if it looks like LaTeX (has backslashes or common math symbols)
    if (/\\[a-zA-Z]+|[\{\}_\^]/.test(latex)) {
      // Clean up the latex content - remove trailing backslashes and extra spaces
      const cleanLatex = latex.trim().replace(/\\+$/, '');
      // Convert to Unicode for better readability
      const unicodeLatex = convertLatexToUnicode(cleanLatex);
      return `\n  📐 ${unicodeLatex}\n`;
    }
    return match; // Not LaTeX, keep original
  });

  // Handle display math ($$...$$) - keep these prominently displayed
  result = result.replace(/\$\$([^\$]+)\$\$/g, (match, latex) => {
    const unicodeLatex = convertLatexToUnicode(latex.trim());
    return `\n\n  📐 ${unicodeLatex}\n`;
  });

  // Handle display math with \[...\]
  result = result.replace(/\\\[([^\]]+)\\\]/g, (match, latex) => {
    const unicodeLatex = convertLatexToUnicode(latex.trim());
    return `\n\n  📐 ${unicodeLatex}\n`;
  });

  // Then handle inline math ($...$) - keep readable in context
  result = result.replace(/\$([^\$]+)\$/g, (match, latex) => {
    const unicodeLatex = convertLatexToUnicode(latex.trim());
    return `⟨${unicodeLatex}⟩`;
  });

  // Handle inline math with \(...\)
  result = result.replace(/\\\(([^)]+)\\\)/g, (match, latex) => {
    const unicodeLatex = convertLatexToUnicode(latex.trim());
    return `⟨${unicodeLatex}⟩`;
  });

  return result;
}

/**
 * Renders markdown content to terminal-formatted text
 * Preserves the original content structure
 */
function renderMarkdown(text) {
  if (!text) return text;

  try {
    // First process LaTeX before markdown to avoid conflicts
    const withLatex = renderLatex(text);

    // Then render markdown
    const rendered = marked.parse(withLatex);

    // Remove trailing newlines
    return rendered.replace(/\n+$/, '');
  } catch (err) {
    // If rendering fails, return original text
    return text;
  }
}

/**
 * Main render function for messages
 * Respects the raw message and only enhances display
 */
export function renderMessage(text) {
  if (!text || typeof text !== 'string') return text || '';

  // Check if the message contains markdown or LaTeX indicators
  const hasMarkdown = /[*_`#\[\]]/g.test(text);
  const hasLatex = /\$.*?\$/g.test(text);

  if (!hasMarkdown && !hasLatex) {
    // Plain text, return as is
    return text;
  }

  // Render with markdown and LaTeX support
  return renderMarkdown(text);
}

export default { renderMessage };

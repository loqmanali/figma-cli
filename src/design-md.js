/**
 * DESIGN.md importer.
 *
 * Parses the "Machine-readable tokens" JSON block at the end of a DESIGN.md
 * (the format produced by Figma extraction tools like figma-extract.md, the
 * `tokens-studio` exporter, and similar). Returns a normalized token map
 * ready for figma-cli's `tokens import` pipeline.
 *
 * Expected document layout:
 *   ## 11. Machine-readable tokens
 *   ```json design-tokens
 *   { "color": {...}, "typography": {...}, "spacing": {...},
 *     "radius": {...}, "shadow": {...}, "fonts": [...] }
 *   ```
 *
 * Section 7 ("Components") and the various tables (Color, Typography, Radius)
 * earlier in the file are summarized into a compact context string so the
 * `/design` command in figmachat can drop a token + component list into its
 * system prompt without bloating it with 7000 lines of structure.
 */

import fs from 'fs';
import YAML from 'yaml';

const JSON_BLOCK_RE = /```json\s+design-tokens\s*\n([\s\S]*?)\n```/;

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n?/;

/** Normalize a value like "16px" / "1.5px" / "9999px" into a plain number, or
 * pass through unchanged if it's not a px-suffixed number. */
function stripPx(v) {
  if (typeof v !== 'string') return v;
  const m = v.match(/^([\d.]+)\s*px$/);
  return m ? parseFloat(m[1]) : v;
}

/**
 * Convert a getdesign.md / awesome-design-md style YAML frontmatter design
 * spec (top-level `colors:`, `typography:`, `rounded:` / `radius:`,
 * `spacing:`, optional `components:`) into the same shape our internal
 * pipeline expects: `{ color, typography, radius, spacing, shadow, fonts, meta }`.
 */
function normalizeYamlSpec(spec) {
  const out = { color: {}, typography: {}, radius: {}, spacing: {}, shadow: {}, meta: {} };
  // colors (both `colors:` and `color:` are accepted)
  const colors = spec.colors || spec.color || {};
  for (const [k, v] of Object.entries(colors)) out.color[k] = v;
  // typography — figma-cli's importer expects { fontFamily, fontSize, fontWeight, lineHeight, letterSpacing }
  const ty = spec.typography || {};
  for (const [name, t] of Object.entries(ty)) {
    if (typeof t !== 'object') continue;
    out.typography[name] = {
      fontFamily: t.fontFamily,
      fontSize: stripPx(t.fontSize),
      fontWeight: t.fontWeight,
      lineHeight: t.lineHeight,
      letterSpacing: t.letterSpacing,
    };
  }
  // radii — accept `rounded:` (Stitch style), `radius:` (our style), `radii:`
  const radii = spec.rounded || spec.radius || spec.radii || {};
  for (const [k, v] of Object.entries(radii)) {
    const n = typeof v === 'number' ? v : stripPx(v);
    if (typeof n === 'number') out.radius[k] = n;
  }
  // spacing
  const sp = spec.spacing || {};
  for (const [k, v] of Object.entries(sp)) {
    const n = typeof v === 'number' ? v : stripPx(v);
    if (typeof n === 'number') out.spacing[k] = n;
  }
  // shadows — keep as-is, we don't auto-create variables from these yet
  if (spec.shadows) out.shadow = spec.shadows;
  if (spec.shadow) out.shadow = spec.shadow;
  // meta
  out.meta = {
    source: spec.name || spec.title,
    generated: spec.version || spec.date,
  };
  // components (just names — useful for the figmachat context)
  if (spec.components && typeof spec.components === 'object') {
    out._componentNames = Object.keys(spec.components);
  }
  return out;
}

export function parseDesignMd(filepath) {
  const text = fs.readFileSync(filepath, 'utf-8');

  // Format A: YAML frontmatter (Stitch / getdesign.md / awesome-design-md style)
  const fmMatch = text.match(FRONTMATTER_RE);
  if (fmMatch) {
    let spec;
    try {
      spec = YAML.parse(fmMatch[1]);
    } catch (e) {
      throw new Error(`YAML frontmatter in ${filepath} is not valid: ${e.message}`);
    }
    if (spec && (spec.colors || spec.color || spec.typography)) {
      const tokens = normalizeYamlSpec(spec);
      return {
        tokens,
        meta: {
          source: tokens.meta.source || filepath.split('/').pop().replace(/\.md$/, ''),
          generated: tokens.meta.generated,
          identity: spec.description,
          components: tokens._componentNames || [],
        },
      };
    }
    // Otherwise fall through to Format B detection
  }

  // Format B: `## Machine-readable tokens` + ```json design-tokens block
  // (our original DESIGN.md extraction format)
  const match = text.match(JSON_BLOCK_RE);
  if (!match) {
    throw new Error(
      `Couldn't parse ${filepath}. Expected one of:\n` +
      `  - YAML frontmatter with top-level \`colors:\` / \`typography:\` (Stitch / getdesign.md style)\n` +
      `  - "## Machine-readable tokens" section with a \`\`\`json design-tokens\`\`\` block`
    );
  }
  let tokens;
  try {
    tokens = JSON.parse(match[1]);
  } catch (e) {
    throw new Error(`Token JSON block is not valid JSON: ${e.message}`);
  }

  // Pull the document summary fields too — useful for the figmachat context.
  const identityMatch = text.match(/^\*\*In one line:\*\*\s+(.+)$/m);
  const sourceMatch = text.match(/^source:\s+(.+)$/m);
  const componentSections = [...text.matchAll(/^### Page:\s+(.+)$/gm)]
    .map(m => m[1].trim())
    .filter(p => !/^(About|Read me|Color|Effects|Spacing block|Screens|Utilities)$/i.test(p));

  return {
    tokens,
    meta: {
      source: tokens.meta?.source || sourceMatch?.[1] || 'unknown',
      generated: tokens.meta?.generated,
      identity: identityMatch?.[1],
      components: componentSections,
    },
  };
}

/** Produce a one-shot summary string for figmachat to drop into the system prompt. */
export function summarizeForLLM({ tokens, meta }) {
  const colors = Object.entries(tokens.color || {});
  const types = Object.keys(tokens.typography || {});
  const radii = Object.keys(tokens.radius || {});
  const shadows = Object.keys(tokens.shadow || {});

  const lines = [
    `Design system loaded: ${meta.source}`,
  ];
  if (meta.identity) lines.push(`Style: ${meta.identity}`);

  // Color tokens — list the first 40 by usage (the file already orders them
  // by usage count). Naming this section explicitly so the model knows these
  // are the canonical token names to use in `var:` references.
  if (colors.length) {
    const sample = colors.slice(0, 40)
      .map(([k, v]) => `var:${k}=${v}`)
      .join(', ');
    lines.push(`Color tokens (${colors.length} total, top by usage): ${sample}`);
    if (colors.length > 40) lines.push(`  …and ${colors.length - 40} more — call \`figma-cli var list\` for the full set.`);
  }
  if (types.length) lines.push(`Typography tokens (${types.length}): ${types.join(', ')}`);
  if (radii.length) lines.push(`Radius tokens (${radii.length}): ${radii.join(', ')}`);
  if (shadows.length) lines.push(`Shadow tokens (${shadows.length}): use sparingly — they're long compositions`);
  if (meta.components?.length) {
    lines.push(`Existing component pages: ${meta.components.slice(0, 50).join(', ')}`);
  }
  lines.push('');
  lines.push(`HARD RULES while this design system is loaded:`);
  lines.push(`- ALWAYS use \`bg="var:<name>"\` / \`color="var:<name>"\` for colors, never raw hex.`);
  lines.push(`- For text styles, match by purpose to the typography token names above.`);
  lines.push(`- For radii, match by name (e.g. radius-md = 2px).`);
  lines.push(`- If the user asks for a component already listed under "Existing component pages", PREFER using the existing component over creating a new one. Hint: 'figma-cli find "<name>"' to locate it.`);
  return lines.join('\n');
}

/** Build the JSON payload that figma-cli's `tokens import` already consumes. */
export function toTokensImportJson({ tokens }) {
  // figma-cli `tokens import` accepts a flat or nested map. We flatten color
  // / radius into the W3C-token-spec-ish shape it already understands.
  const out = {
    color: {},
    radius: {},
    typography: {},
  };
  for (const [name, value] of Object.entries(tokens.color || {})) {
    out.color[name] = { value, type: 'color' };
  }
  for (const [name, value] of Object.entries(tokens.radius || {})) {
    const num = parseFloat(value);
    if (Number.isFinite(num)) out.radius[name] = { value: num, type: 'number' };
  }
  for (const [name, ts] of Object.entries(tokens.typography || {})) {
    out.typography[name] = {
      value: {
        fontFamily: ts.fontFamily,
        fontSize: ts.fontSize,
        fontWeight: ts.fontWeight,
        lineHeight: ts.lineHeight,
        letterSpacing: ts.letterSpacing,
      },
      type: 'typography',
    };
  }
  return out;
}

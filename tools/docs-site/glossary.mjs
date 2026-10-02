// tools/docs-site/glossary.mjs
// The glossary in the portal (SPEC-0003): one page listing every term the repo has settled, and a
// link to it from a term's first mention in each chain document. Like the SRS view it is a view and
// not a stage: nothing is written to docs/, and the terms come from the model read() in
// scripts/check-glossary.js gives, the one the hooks check, in whichever of the two formats the
// file is written. Nothing here reads the disk: collect() in chain.mjs hands the model in.
export const GLOSSARY_LINK = "/glossary/";

const key = name => name.trim().replace(/\s+/g, " ").toLowerCase();
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// What a term's entry is called on the page. Prefixed so it cannot meet the id Starlight gives the
// entry's heading, or an item ID on a document's page.
export const anchorOf = term => `term-${term.slug}`;

// What prose a term is never linked inside: code, a link that is already one, inline or by
// reference, an HTML tag, a URL.
const PROTECTED = /(`+[^`]*`+|!?\[[^\]]*\](?:\([^)]*\)|\[[^\]]*\])|<[^>]+>|https?:\/\/[^\s)]+)/g;
// A name is matched whole and in any case, longest first, so "install plan" is not read as "install".
// One that is part of a path, a file name or a hyphenated word is that word and not the term.
const EDGE = "[\\p{L}\\p{N}_/\\\\-]";

const matchers = new WeakMap();
function matcherOf(glossary) {
    if (matchers.has(glossary)) return matchers.get(glossary);
    const byName = new Map();
    for (const term of glossary.terms) for (const name of term.names) if (!byName.has(key(name))) byName.set(key(name), term);
    const names = [...byName.keys()].sort((a, b) => b.length - a.length).map(n => escape(n).replace(/ /g, "\\s+"));
    const matcher = names.length
        ? { byName, re: new RegExp(`(?<!${EDGE})(?:${names.join("|")})(?!${EDGE}|\\.[\\p{L}\\p{N}])`, "giu") }
        : null;
    matchers.set(glossary, matcher);
    return matcher;
}

// One line of prose with each term it mentions linked to its entry. `seen` is the terms already
// linked, by slug, and the caller keeps one per document: a term is linked where a reader first
// meets it, and is plain text after that. `page` is where the entries are, "" on the glossary itself.
export function linkTerms(text, glossary, seen = new Set(), page = GLOSSARY_LINK) {
    const matcher = glossary && matcherOf(glossary);
    if (!matcher) return text;
    return text.split(PROTECTED).map((part, i) => i % 2 ? part : part.replace(matcher.re, whole => {
        const term = matcher.byName.get(key(whole));
        if (!term || seen.has(term.slug)) return whole;
        seen.add(term.slug);
        return `[${whole}](${page}#${anchorOf(term)})`;
    })).join("");
}

// A definition as it is written, with the other terms it uses linked to their own entries. Fenced
// code is left exactly as written.
function definitionOf(term, glossary) {
    const seen = new Set([term.slug]);
    let fenced = false;
    return term.definition.split("\n").map(line => {
        if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; return line; }
        return fenced ? line : linkTerms(line, glossary, seen, "");
    }).join("\n");
}

// The page as markdown for Starlight: the glossary's own lead, then an entry per term in
// alphabetical order, whatever order and format the file holds them in. Each entry is a heading, so
// the page's table of contents is the list of terms, and carries the anchor a mention links to.
export function glossaryPage(glossary) {
    const out = [glossary.description || "The terms this project uses, one entry each."];
    if (!glossary.terms.length) {
        out.push("", "No terms yet. The `domain-modeling` skill writes an entry the moment a term is settled; this page picks it up on reload.");
        return out.join("\n");
    }
    out.push("", `A term's first mention in a document is a link to its entry here. Read live from \`${glossary.file}\`.`);
    const terms = [...glossary.terms].sort((a, b) => a.term.localeCompare(b.term, undefined, { sensitivity: "base" }));
    for (const term of terms) {
        out.push("", `## <span id="${anchorOf(term)}"></span>${term.term}`, "");
        out.push(definitionOf(term, glossary) || "No definition yet.");
        if (term.aliases.length) out.push("", `Also: ${term.aliases.join(", ")}.`);
        if (term.avoid.length) out.push("", `Avoid: ${term.avoid.join(", ")}.`);
    }
    return out.join("\n");
}

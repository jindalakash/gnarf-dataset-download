// Text helpers. The PDF uses jsPDF's built-in Helvetica, which only covers
// the Windows-1252 character set, so anything outside it is mapped to a
// close ASCII equivalent rather than printed as garbage.

const SUPERSCRIPTS = { 1: '¹', 2: '²', 3: '³' }

const REPLACEMENTS = [
    [/[‘’‚′]/g, "'"],
    [/[“”„″]/g, '"'],
    [/[–—−]/g, '-'],
    [/…/g, '...'],
    [/[   ]/g, ' '],
    [/[≤]/g, '<='],
    [/[≥]/g, '>='],
    [/[•●]/g, '-'],
]

export const toPdfText = (s) => {
    if (s === null || s === undefined) {
        return ''
    }
    let out = String(s).normalize('NFC')
    for (const [re, rep] of REPLACEMENTS) {
        out = out.replace(re, rep)
    }
    // Keep Latin-1 (covers French/Spanish/Portuguese accents); drop the rest.
    // eslint-disable-next-line no-control-regex
    return out.replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ]/g, '?')
}

/** Convert the small amount of HTML used in constants into plain text. */
export const htmlToText = (html) => {
    if (!html) {
        return ''
    }
    return toPdfText(
        String(html)
            .replace(/<sup>\s*(\d)\s*<\/sup>/gi, (_, d) => SUPERSCRIPTS[d] || `^${d}`)
            .replace(/<sup>(.*?)<\/sup>/gi, '^$1')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/(p|div|h\d|li|tr)>/gi, '\n')
            .replace(/<li[^>]*>/gi, '- ')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim()
    )
}

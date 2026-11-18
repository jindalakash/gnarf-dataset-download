// Evaluates the d2-autogen-forms rule formulas stored in the dataStore, e.g.
//   { formula: { value: "<%- GNARF_Introduction_Noma != 3 && GNARF_Introduction_Noma != '' %>",
//                condition: "true" },
//     dataElements: [{ code: "GNARF_Introduction_Noma" }] }
// The data entry form substitutes each listed data element code with its
// current value (a string, '' when empty) and compares the result with
// `condition`. We do the same so the PDF matches what the form shows.

const stripTemplate = (value) =>
    String(value)
        .replace(/^\s*<%[-=]?/, '')
        .replace(/%>\s*$/, '')
        .trim()

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * @param {object} rule  { formula: { value, condition }, dataElements: [{ code }] }
 * @param {(code: string) => string} getValue  value of a data element (default COC), '' if empty
 * @returns {boolean} true if the rule's condition holds
 */
export const evaluateRule = (rule, getValue) => {
    if (!rule?.formula?.value) {
        return true
    }
    let expr = stripTemplate(rule.formula.value)
    const codes = (rule.dataElements || [])
        .map((d) => d.code)
        .filter(Boolean)
        .sort((a, b) => b.length - a.length)
    for (const code of codes) {
        const re = new RegExp(`(?<![\\w.])${escapeRegExp(code)}(?![\\w])`, 'g')
        expr = expr.replace(re, JSON.stringify(getValue(code) ?? ''))
    }
    try {
        // Formulas come from the instance's own dataStore configuration
        // (admin-maintained), the same source the data entry form evaluates.
        const result = new Function(`"use strict"; return (${expr});`)()
        return String(result) === String(rule.formula.condition ?? 'true')
    } catch (e) {
        console.warn('Could not evaluate rule', rule.formula.value, e)
        return true
    }
}

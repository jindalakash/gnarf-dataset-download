// Builds a print model of a d2-autogen-forms data set (such as NTD GNARF):
// tabs -> sections -> table blocks, following the same dataStore
// configuration the data entry form uses:
//   - tabs.order          integer part = tab, decimal part = position in tab
//   - tabs.rules.visible  whether a tab is open for this org unit/period
//   - viewType            'table' | 'grid' | 'grid-category-columns'
//   - categoryOptionFilter, dataElementsToExclude, columnsConfig,
//     columnsOrder, enableGroups, texts.header/footer, data element texts
// The output is renderer-agnostic: pdf.js turns it into autoTable calls.

import { evaluateRule } from './rules.js'
import { htmlToText, toPdfText } from './text.js'

/** Compare tab orders like 15.2 < 15.9 < 15.11 (version-style, not decimal). */
export const compareOrder = (a, b) => {
    const pa = String(a).split('.').map(Number)
    const pb = String(b).split('.').map(Number)
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] ?? -1) - (pb[i] ?? -1)
        if (d !== 0) {
            return d
        }
    }
    return 0
}

const tabKeyOf = (order) => Number(String(order).split('.')[0])

const cartesian = (lists) =>
    lists.reduce(
        (acc, list) => acc.flatMap((prefix) => list.map((x) => [...prefix, x])),
        [[]]
    )

const OTHER_TAB_KEY = 9999

/**
 * Index metadata once per data set.
 * @param {object} meta { dataSet, dataElements[], categoryCombos[], optionSets[], constants[], config }
 */
export const indexMetadata = (meta) => {
    const deById = new Map(meta.dataElements.map((d) => [d.id, d]))
    const deByCode = new Map(
        meta.dataElements.filter((d) => d.code).map((d) => [d.code, d])
    )
    const ccById = new Map()
    let defaultCocId = null
    for (const cc of meta.categoryCombos) {
        const cocByOptions = new Map()
        for (const coc of cc.categoryOptionCombos || []) {
            const key = (coc.categoryOptions || [])
                .map((o) => o.id)
                .sort()
                .join('.')
            cocByOptions.set(key, coc)
        }
        const isDefault = cc.name === 'default' || cc.isDefault
        if (isDefault && cc.categoryOptionCombos?.length) {
            defaultCocId = cc.categoryOptionCombos[0].id
        }
        ccById.set(cc.id, { ...cc, isDefault, cocByOptions })
    }
    const optionSetById = new Map(meta.optionSets.map((o) => [o.id, o]))
    const constantByCode = new Map(
        meta.constants.map((c) => [c.code, c.description || c.name || ''])
    )
    return {
        ...meta,
        deById,
        deByCode,
        ccById,
        defaultCocId,
        optionSetById,
        constantByCode,
        sectionConfig: meta.config?.sections || {},
        dataElementConfig: meta.config?.dataElements || {},
    }
}

/** Value lookups bound to one org unit + period (values may be empty for blank forms). */
const makeValueAccess = (idx, values) => {
    const get = (deId, cocId) => values.get(`${deId}.${cocId || idx.defaultCocId}`) ?? ''
    const getByCode = (code) => {
        const de = idx.deByCode.get(code)
        return de ? get(de.id, idx.defaultCocId) : ''
    }
    return { get, getByCode }
}

/**
 * Work out the tabs, in form order, and whether each is open for the
 * country/period given its current answers (values).
 */
export const listTabs = (idx, values) => {
    const { getByCode } = makeValueAccess(idx, values)
    const tabs = new Map()
    const sections = [...idx.dataSet.sections]
    for (const s of sections) {
        const cfg = idx.sectionConfig[s.code] || {}
        const order = cfg.tabs?.order ?? `${OTHER_TAB_KEY}.${s.sortOrder}`
        const key = cfg.tabs ? tabKeyOf(order) : OTHER_TAB_KEY
        if (!tabs.has(key)) {
            tabs.set(key, { key, sections: [] })
        }
        tabs.get(key).sections.push({ section: s, cfg, order })
    }
    const list = [...tabs.values()].sort((a, b) => a.key - b.key)
    for (const tab of list) {
        tab.sections.sort(
            (a, b) =>
                compareOrder(a.order, b.order) ||
                a.section.sortOrder - b.section.sortOrder
        )
        const lead = tab.sections[0]
        tab.title =
            tab.key === OTHER_TAB_KEY ? 'Other sections' : toPdfText(lead.section.displayName || lead.section.name)
        tab.id = String(tab.key)
        // A tab is open when its rule-bearing sections (the lead section in
        // GNARF) all evaluate to visible.
        const rules = tab.sections
            .map((x) => x.cfg.tabs?.rules?.visible)
            .filter(Boolean)
        tab.open = rules.every((r) => evaluateRule(r, getByCode))
    }
    return list
}

const formatValue = (idx, de, raw) => {
    if (raw === '' || raw === null || raw === undefined) {
        return ''
    }
    if (de.optionSet) {
        const os = idx.optionSetById.get(de.optionSet.id)
        const opt = os?.options?.find((o) => o.code === raw)
        return toPdfText(opt ? opt.name : raw)
    }
    if (de.valueType === 'TRUE_ONLY') {
        return raw === 'true' ? 'Yes' : raw
    }
    if (de.valueType === 'BOOLEAN') {
        return raw === 'true' ? 'Yes' : raw === 'false' ? 'No' : raw
    }
    return toPdfText(raw)
}

const deLabel = (idx, de) => {
    const constantCode = idx.dataElementConfig[de.code]?.texts?.name?.code
    if (constantCode && idx.constantByCode.has(constantCode)) {
        return htmlToText(idx.constantByCode.get(constantCode))
    }
    return toPdfText(de.formName || de.displayFormName || de.name)
}

const optionNames = (idx, de) =>
    idx.optionSetById
        .get(de.optionSet?.id)
        ?.options?.map((o) => toPdfText(o.name)) || []

/** One cell; `kind` drives styling in the renderer. */
const valueCell = (idx, ctx, de, cocId) => {
    if (ctx.greyed.has(`${de.id}.${cocId || idx.defaultCocId}`)) {
        return { content: '', kind: 'grey' }
    }
    if (!ctx.withData) {
        return {
            content: de.valueType === 'TRUE_ONLY' ? '[   ]' : '',
            kind: 'value',
        }
    }
    return { content: formatValue(idx, de, ctx.get(de.id, cocId)), kind: 'value' }
}

const excludedCodes = (cfg, getByCode) => {
    const out = new Set()
    for (const rule of cfg.dataElementsToExclude || []) {
        if (evaluateRule(rule, getByCode)) {
            for (const c of rule.codesToExclude || []) {
                out.add(c.code)
            }
        }
    }
    return out
}

/** Restrict category options per categoryOptionFilter (e.g. detailed vs basic age groups). */
const filterCategories = (categories, cfg, getByCode) => {
    const filter = cfg.categoryOptionFilter
    if (!filter?.config?.length) {
        return categories
    }
    const value = getByCode(filter.dataElementCode) || ''
    const referenced = new Set()
    const allowed = new Set()
    for (const entry of filter.config) {
        const codes = entry.children?.length
            ? entry.children.map((c) => c.categoryOptionCode)
            : [entry.code]
        codes.forEach((c) => referenced.add(c))
        referenced.add(entry.code)
        if ((entry.showWhenValue || []).includes(value)) {
            codes.forEach((c) => allowed.add(c))
        }
    }
    return categories.map((cat) => {
        const touches = cat.categoryOptions.some((o) => referenced.has(o.code))
        return touches
            ? { ...cat, categoryOptions: cat.categoryOptions.filter((o) => allowed.has(o.code)) }
            : cat
    })
}

const buildTableView = (idx, ctx, des) => {
    const body = []
    const head = []
    for (const de of des) {
        const cc = idx.ccById.get(de.categoryCombo?.id)
        let label = deLabel(idx, de)
        if (!ctx.withData && de.optionSet) {
            label += `\nOptions: ${optionNames(idx, de).join(' / ')}`
        }
        if (!cc || cc.isDefault) {
            body.push([{ content: label, kind: 'label' }, valueCell(idx, ctx, de)])
        } else {
            for (const coc of cc.categoryOptionCombos) {
                body.push([
                    { content: `${label} - ${toPdfText(coc.name)}`, kind: 'label' },
                    valueCell(idx, ctx, de, coc.id),
                ])
            }
        }
    }
    return body.length ? [{ kind: 'table', layout: 'form', head, body }] : []
}

const buildCategoryColumnsView = (idx, ctx, cfg, des) => {
    // Consecutive data elements sharing a category combo share one table.
    const groups = []
    for (const de of des) {
        const ccId = de.categoryCombo?.id
        const last = groups[groups.length - 1]
        if (last && last.ccId === ccId) {
            last.des.push(de)
        } else {
            groups.push({ ccId, des: [de] })
        }
    }
    const blocks = []
    for (const g of groups) {
        const cc = idx.ccById.get(g.ccId)
        if (!cc || cc.isDefault) {
            const body = g.des.map((de) => [
                { content: deLabel(idx, de), kind: 'label' },
                valueCell(idx, ctx, de),
            ])
            blocks.push({
                kind: 'table',
                layout: 'grid',
                head: [[{ content: '', kind: 'head' }, { content: 'Value', kind: 'head' }]],
                body,
            })
            continue
        }
        const cats = filterCategories(cc.categories, cfg, ctx.getByCode).filter(
            (c) => c.categoryOptions.length
        )
        const columns = cartesian(cats.map((c) => c.categoryOptions)).map((opts) => {
            const key = opts
                .map((o) => o.id)
                .sort()
                .join('.')
            return cc.cocByOptions.get(key)?.id || null
        })
        const head = cats.map((cat, level) => {
            const span = cats.slice(level + 1).reduce((n, c) => n * c.categoryOptions.length, 1)
            const repeat = cats.slice(0, level).reduce((n, c) => n * c.categoryOptions.length, 1)
            const row = []
            if (level === 0) {
                row.push({ content: '', rowSpan: cats.length, kind: 'head' })
            }
            for (let r = 0; r < repeat; r++) {
                for (const o of cat.categoryOptions) {
                    row.push({ content: toPdfText(o.displayFormName || o.name), colSpan: span, kind: 'head' })
                }
            }
            return row
        })
        const body = g.des.map((de) => [
            { content: deLabel(idx, de), kind: 'label' },
            ...columns.map((cocId) =>
                cocId ? valueCell(idx, ctx, de, cocId) : { content: '', kind: 'grey' }
            ),
        ])
        blocks.push({ kind: 'table', layout: 'grid', head, body })
    }
    return blocks
}

const buildGridView = (idx, ctx, cfg, des) => {
    const colOrder = []
    const rows = new Map()
    const deColumn = new Map()
    for (const de of des) {
        const parts = toPdfText(de.formName || de.displayFormName || de.name).split(' - ')
        const col = parts.length > 1 ? parts.pop() : 'Value'
        const rowKey = parts.join(' - ')
        if (!colOrder.includes(col)) {
            colOrder.push(col)
        }
        deColumn.set(de.code, col)
        if (!rows.has(rowKey)) {
            const group = cfg.enableGroups && parts.length > 1 ? parts[0] : null
            const label = cfg.enableGroups && parts.length > 1 ? parts.slice(1).join(' - ') : rowKey
            rows.set(rowKey, { group, label, cells: new Map(), override: null })
        }
        const row = rows.get(rowKey)
        row.cells.set(col, de)
        if (!row.override && idx.dataElementConfig[de.code]?.texts?.name?.code) {
            row.override = deLabel(idx, de)
        }
    }
    // columnsOrder: { dataElementCode: position }
    for (const [code, pos] of Object.entries(cfg.columnsOrder || {})) {
        const col = deColumn.get(code)
        if (col !== undefined) {
            colOrder.splice(colOrder.indexOf(col), 1)
            colOrder.splice(Math.min(pos, colOrder.length), 0, col)
        }
    }
    // columnsConfig: hide disease columns that are not open for this country
    const hidden = new Set()
    for (const [code, c] of Object.entries(cfg.columnsConfig || {})) {
        const col = deColumn.get(code)
        if (col !== undefined && c.rules?.visible && !evaluateRule(c.rules.visible, ctx.getByCode)) {
            hidden.add(col)
        }
    }
    const cols = colOrder.filter((c) => !hidden.has(c))
    if (!cols.length) {
        return []
    }
    const head = [[{ content: '', kind: 'head' }, ...cols.map((c) => ({ content: c, kind: 'head' }))]]
    const body = []
    let lastGroup = null
    for (const row of rows.values()) {
        if (![...row.cells.keys()].some((c) => cols.includes(c))) {
            continue
        }
        if (row.group && row.group !== lastGroup) {
            body.push([{ content: row.group, colSpan: cols.length + 1, kind: 'group' }])
            lastGroup = row.group
        }
        body.push([
            { content: row.override || row.label, kind: 'label' },
            ...cols.map((c) => {
                const de = row.cells.get(c)
                return de ? valueCell(idx, ctx, de) : { content: '', kind: 'grey' }
            }),
        ])
    }
    return [{ kind: 'table', layout: 'grid', head, body, wide: cols.length > 8 }]
}

/** Answer-option legend for grid sections in blank forms. */
const optionLegend = (idx, des) => {
    const seen = new Map()
    for (const de of des) {
        if (de.optionSet && !seen.has(de.optionSet.id)) {
            seen.set(de.optionSet.id, optionNames(idx, de))
        }
    }
    return [...seen.values()].map((names) => names.join('  |  '))
}

/**
 * Build the printable form.
 * @param idx       result of indexMetadata
 * @param values    Map "deId.cocId" -> raw value (used for rules even for blank forms)
 * @param tabIds    which tab ids to include
 * @param withData  print values (true) or blank cells (false)
 */
export const buildForm = (idx, values, { tabIds, withData }) => {
    const access = makeValueAccess(idx, values)
    const greyed = new Set()
    for (const s of idx.dataSet.sections) {
        for (const g of s.greyedFields || []) {
            greyed.add(`${g.dataElement.id}.${g.categoryOptionCombo.id}`)
        }
    }
    const ctx = { ...access, withData, greyed }
    const wanted = new Set(tabIds)
    const tabs = listTabs(idx, values).filter((t) => wanted.has(t.id))
    return tabs.map((tab) => ({
        id: tab.id,
        title: tab.title,
        open: tab.open,
        sections: tab.sections
            .filter(({ cfg }, i) => i === 0 || !cfg.tabs?.rules?.visible || evaluateRule(cfg.tabs.rules.visible, access.getByCode))
            .map(({ section, cfg }) => {
                const exclude = excludedCodes(cfg, access.getByCode)
                const des = section.dataElements
                    .map((d) => idx.deById.get(d.id))
                    .filter((d) => d && !exclude.has(d.code))
                const viewType = cfg.viewType || 'table'
                const blocks =
                    viewType === 'grid'
                        ? buildGridView(idx, ctx, cfg, des)
                        : viewType === 'grid-category-columns' || viewType === 'grid-with-combos'
                          ? buildCategoryColumnsView(idx, ctx, cfg, des)
                          : buildTableView(idx, ctx, des)
                const header = cfg.texts?.header?.code && htmlToText(idx.constantByCode.get(cfg.texts.header.code))
                const footer = cfg.texts?.footer?.code && htmlToText(idx.constantByCode.get(cfg.texts.footer.code))
                return {
                    code: section.code,
                    title: toPdfText(section.displayName || section.name),
                    header: header || '',
                    footer: footer || '',
                    legend: !withData && viewType !== 'table' ? optionLegend(idx, des) : [],
                    blocks,
                }
            }),
    }))
}

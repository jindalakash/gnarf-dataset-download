import assert from 'node:assert/strict'
import { test } from 'node:test'
import { evaluateRule } from '../src/lib/rules.js'
import { buildForm, compareOrder, indexMetadata, listTabs } from '../src/lib/model.js'
import { renderPdf } from '../src/lib/pdf.js'
import { htmlToText } from '../src/lib/text.js'

const visible = (code) => ({
    formula: { value: `<%- ${code} != 3 && ${code} != 2 && ${code} != '' %>`, condition: 'true' },
    dataElements: [{ code }],
})

const opt = (id, code, name = code) => ({ id, code, name })
const age = [opt('a0', 'P0Y_P9999Y_ALL_AGES', 'All ages'), opt('a1', 'P00Y_P01Y', '<1'), opt('a2', 'P01Y_P05Y', '1-4'), opt('b1', 'PLS5Y', '<5')]
const sex = [opt('m', 'M', 'Male'), opt('f', 'F', 'Female')]
const cocs = []
for (const s of sex) for (const a of age) cocs.push({ id: `c_${s.id}_${a.id}`, name: `${s.name}, ${a.name}`, categoryOptions: [{ id: s.id }, { id: a.id }] })

const meta = () =>
    indexMetadata({
        dataSet: {
            id: 'DS',
            code: 'NTD_GNARF',
            displayName: 'NTD GNARF',
            sections: [
                { id: 's1', code: 'SE_INTRODUCTION_ENDEMICITY', name: 'Status of Reporting', sortOrder: 1, dataElements: [{ id: 'iNoma' }, { id: 'iYaws' }] },
                { id: 's2', code: 'SE_COUNTRY_PROGRESS', name: 'Country progress', sortOrder: 2, dataElements: [{ id: 'cpN' }, { id: 'cpY' }] },
                { id: 's3', code: 'SE_NOMA', name: 'Noma', sortOrder: 3, dataElements: [{ id: 'nBasic' }] },
                { id: 's4', code: 'SE_NOMA_HS', name: 'Noma: health status', sortOrder: 4, dataElements: [{ id: 'nCases' }], greyedFields: [{ dataElement: { id: 'nCases' }, categoryOptionCombo: { id: 'c_f_a0' } }] },
                { id: 's5', code: 'SE_NOMA_ADD', name: 'Noma: additional', sortOrder: 5, dataElements: [{ id: 'nText' }] },
                { id: 's6', code: 'SE_YAWS', name: 'Yaws', sortOrder: 6, dataElements: [{ id: 'yBasic' }] },
            ],
        },
        dataElements: [
            { id: 'iNoma', code: 'GNARF_Introduction_Noma', name: 'Noma', valueType: 'INTEGER', optionSet: { id: 'osI' }, categoryCombo: { id: 'def' } },
            { id: 'iYaws', code: 'GNARF_Introduction_Yaws', name: 'Yaws', valueType: 'INTEGER', optionSet: { id: 'osI' }, categoryCombo: { id: 'def' } },
            { id: 'cpN', code: '11_Endemic_Status_NOMA', formName: 'Technical - 1. Scientific - 11 - Noma', valueType: 'INTEGER', categoryCombo: { id: 'def' } },
            { id: 'cpY', code: '11_Endemic_Status_YAWS', formName: 'Technical - 1. Scientific - 11 - Yaws', valueType: 'INTEGER', categoryCombo: { id: 'def' } },
            { id: 'nBasic', code: 'NTD_AGE_GRP_NA_NOM', name: 'Basic ages only', valueType: 'TRUE_ONLY', categoryCombo: { id: 'def' } },
            { id: 'nCases', code: 'NTD_SUSPECTED_NOM', formName: 'Suspected cases', valueType: 'INTEGER', categoryCombo: { id: 'sexAge' } },
            { id: 'nText', code: 'NTD_NOMA_TEXT', name: 'Comments – “notes”', valueType: 'TEXT', categoryCombo: { id: 'def' } },
            { id: 'yBasic', code: 'NTD_AGE_GRP_NA_YAW', name: 'Basic ages only', valueType: 'TRUE_ONLY', categoryCombo: { id: 'def' } },
        ],
        categoryCombos: [
            { id: 'def', name: 'default', categories: [], categoryOptionCombos: [{ id: 'DEF', name: 'default', categoryOptions: [] }] },
            { id: 'sexAge', name: 'Sex x Age', categories: [{ id: 'cs', code: 'SEX', name: 'Sex', categoryOptions: sex }, { id: 'ca', code: 'AGE', name: 'Age', categoryOptions: age }], categoryOptionCombos: cocs },
        ],
        optionSets: [{ id: 'osI', options: [{ code: '1', name: 'Yes, endemic' }, { code: '2', name: 'No, not endemic' }, { code: '3', name: 'No data' }, { code: '4', name: 'Yes, surveillance' }] }],
        constants: [{ code: 'C_ROW', description: '11 Endemic status<sup>1</sup>' }, { code: 'C_FOOT', description: '<p>Footer &amp; note</p>' }],
        config: {
            sections: {
                SE_INTRODUCTION_ENDEMICITY: { tabs: { order: 0.3 }, viewType: 'table' },
                SE_COUNTRY_PROGRESS: {
                    tabs: { order: 1.1 },
                    viewType: 'grid',
                    enableGroups: true,
                    columnsConfig: {
                        '11_Endemic_Status_NOMA': { rules: { visible: visible('GNARF_Introduction_Noma') } },
                        '11_Endemic_Status_YAWS': { rules: { visible: visible('GNARF_Introduction_Yaws') } },
                    },
                },
                SE_NOMA: { tabs: { order: 20.1, rules: { visible: visible('GNARF_Introduction_Noma') } }, viewType: 'table' },
                SE_NOMA_HS: {
                    tabs: { order: 20.2 },
                    viewType: 'grid-category-columns',
                    categoryOptionFilter: {
                        dataElementCode: 'NTD_AGE_GRP_NA_NOM',
                        config: [
                            { code: 'P0Y_P9999Y_ALL_AGES', children: [], showWhenValue: ['false', 'true', ''] },
                            { code: 'DETAILED', children: [{ categoryOptionCode: 'P00Y_P01Y' }, { categoryOptionCode: 'P01Y_P05Y' }], showWhenValue: ['false', ''] },
                            { code: 'BASIC', children: [{ categoryOptionCode: 'PLS5Y' }], showWhenValue: ['true'] },
                        ],
                    },
                },
                SE_NOMA_ADD: { tabs: { order: 20.11 }, viewType: 'table', texts: { footer: { code: 'C_FOOT' } } },
                SE_YAWS: { tabs: { order: 30.1, rules: { visible: visible('GNARF_Introduction_Yaws') } }, viewType: 'table' },
            },
            dataElements: { '11_Endemic_Status_NOMA': { texts: { name: { code: 'C_ROW' } } } },
        },
    })

const vals = (obj) => new Map(Object.entries(obj))

test('rule evaluation mirrors the form formula', () => {
    const r = visible('GNARF_Introduction_Noma')
    assert.equal(evaluateRule(r, () => '1'), true)
    assert.equal(evaluateRule(r, () => '4'), true)
    assert.equal(evaluateRule(r, () => '2'), false)
    assert.equal(evaluateRule(r, () => '3'), false)
    assert.equal(evaluateRule(r, () => ''), false)
})

test('section order is version-style', () => {
    assert.ok(compareOrder('15.9', '15.11') < 0)
    assert.ok(compareOrder('15.2', '15.11') < 0)
    assert.ok(compareOrder('2.1', '15.1') < 0)
})

test('tabs open only for diseases answered yes', () => {
    const idx = meta()
    const tabs = listTabs(idx, vals({ 'iNoma.DEF': '1', 'iYaws.DEF': '2' }))
    assert.deepEqual(tabs.map((t) => [t.title, t.open]), [
        ['Status of Reporting', true],
        ['Country progress', true],
        ['Noma', true],
        ['Yaws', false],
    ])
    const none = listTabs(idx, vals({}))
    assert.deepEqual(none.filter((t) => t.open).map((t) => t.id), ['0', '1'])
})

test('category filter, greyed cells, grid columns and values', () => {
    const idx = meta()
    const v = vals({ 'iNoma.DEF': '1', 'iYaws.DEF': '3', 'nCases.c_m_a1': '7', 'cpN.DEF': '5', 'nText.DEF': 'hello' })
    const form = buildForm(idx, v, { tabIds: ['1', '20'], withData: true })
    // Country progress: Yaws column hidden, row label from constant, group row
    const cp = form[0].sections[0].blocks[0]
    assert.deepEqual(cp.head[0].map((c) => c.content), ['', 'Noma'])
    assert.equal(cp.body[0][0].content, 'Technical')
    assert.equal(cp.body[1][0].content, '11 Endemic status¹')
    assert.equal(cp.body[1][1].content, '5')
    // Noma HS: detailed ages (basic box unticked): All ages, <1, 1-4 per sex
    const hs = form[1].sections[1].blocks[0]
    assert.deepEqual(hs.head[1].map((c) => c.content), ['All ages', '<1', '1-4', 'All ages', '<1', '1-4'])
    assert.equal(hs.head[0][1].colSpan, 3)
    assert.equal(hs.body[0][2].content, '7')
    assert.equal(hs.body[0][4].kind, 'grey') // female, all ages is greyed
    // order 20.11 comes after 20.2, footer text from constant
    assert.equal(form[1].sections[2].footer, 'Footer & note')
    // Latin-1 safe text
    assert.equal(form[1].sections[2].blocks[0].body[0][0].content, 'Comments - "notes"')

    const basic = buildForm(idx, vals({ 'iNoma.DEF': '1', 'nBasic.DEF': 'true' }), { tabIds: ['20'], withData: false })
    assert.deepEqual(basic[0].sections[1].blocks[0].head[1].map((c) => c.content), ['All ages', '<5', 'All ages', '<5'])
    assert.equal(basic[0].sections[1].blocks[0].body[0][1].content, '')
})

test('blank form shows options and no values', () => {
    const idx = meta()
    const form = buildForm(idx, vals({ 'iNoma.DEF': '1' }), { tabIds: ['0'], withData: false })
    const row = form[0].sections[0].blocks[0].body[0]
    assert.match(row[0].content, /Options: Yes, endemic \/ No, not endemic/)
    assert.equal(row[1].content, '')
    const filled = buildForm(idx, vals({ 'iNoma.DEF': '1' }), { tabIds: ['0'], withData: true })
    assert.equal(filled[0].sections[0].blocks[0].body[0][1].content, 'Yes, endemic')
})

test('renders a PDF', () => {
    const idx = meta()
    const v = vals({ 'iNoma.DEF': '1', 'nCases.c_m_a1': '7' })
    for (const withData of [true, false]) {
        const form = buildForm(idx, v, { tabIds: ['0', '1', '20'], withData })
        const doc = renderPdf(form, { dataSetName: 'NTD GNARF', orgUnitName: 'Senegal', period: '2024', withData, appVersion: '1.0.0' })
        const bytes = doc.output('arraybuffer')
        assert.ok(bytes.byteLength > 2000)
        assert.ok(doc.getNumberOfPages() >= 3)
    }
})

test('htmlToText', () => {
    assert.equal(htmlToText('<p>A&nbsp;b</p><p>c<sup>3</sup></p>'), 'A b\nc³')
})

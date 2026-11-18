// Renders the print model from model.js into a PDF with jsPDF + autoTable.
// Landscape A4; one tab starts on a new page; wide grids (e.g. Country
// progress with one column per disease) split across pages horizontally,
// repeating the row-label column.

import { jsPDF } from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import { toPdfText } from './text.js'

const GREEN = [17, 87, 64] // #115740, the GNARF section title colour
const LIGHT = [232, 241, 237]
const GREY = [200, 200, 200]
const MARGIN = 28

const cellStyles = {
    head: { fillColor: LIGHT, textColor: 20, fontStyle: 'bold', halign: 'center', valign: 'middle' },
    label: { fontStyle: 'normal', textColor: 20 },
    value: { textColor: 0, halign: 'left' },
    grey: { fillColor: GREY },
    group: { fillColor: [245, 245, 245], fontStyle: 'bold', textColor: GREEN },
}

const toAutoTableRow = (row) =>
    row.map((c) => ({
        content: c.content ?? '',
        colSpan: c.colSpan,
        rowSpan: c.rowSpan,
        styles: cellStyles[c.kind] || {},
    }))

const pageWidth = (doc) => doc.internal.pageSize.getWidth()
const pageHeight = (doc) => doc.internal.pageSize.getHeight()

const ensureSpace = (doc, y, needed) => {
    if (y + needed > pageHeight(doc) - MARGIN - 14) {
        doc.addPage()
        return MARGIN
    }
    return y
}

const writeParagraph = (doc, text, y, { size = 8, color = 60, style = 'normal' } = {}) => {
    if (!text) {
        return y
    }
    doc.setFont('helvetica', style)
    doc.setFontSize(size)
    doc.setTextColor(color)
    const lines = doc.splitTextToSize(text, pageWidth(doc) - MARGIN * 2)
    for (const line of lines) {
        y = ensureSpace(doc, y, size + 2)
        doc.text(line, MARGIN, y + size)
        y += size + 2
    }
    return y + 4
}

const titleBar = (doc, text, y, { size = 10, height = 18 } = {}) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(size)
    const lines = doc.splitTextToSize(text, pageWidth(doc) - MARGIN * 2 - 12)
    const h = Math.max(height, lines.length * (size + 2) + 8)
    y = ensureSpace(doc, y, h + 30)
    doc.setFillColor(...GREEN)
    doc.rect(MARGIN, y, pageWidth(doc) - MARGIN * 2, h, 'F')
    doc.setTextColor(255)
    lines.forEach((l, i) => doc.text(l, MARGIN + 6, y + size + 3 + i * (size + 2)))
    return y + h + 4
}

const renderBlock = (doc, block, y) => {
    const isForm = block.layout === 'form'
    const nCols = Math.max(...block.body.map((r) => r.reduce((n, c) => n + (c.colSpan || 1), 0)), 1)
    const usable = pageWidth(doc) - MARGIN * 2
    const labelWidth = isForm ? usable * 0.62 : Math.min(230, usable * 0.4)
    const fontSize = isForm ? 8 : nCols > 14 ? 6 : 7
    autoTable(doc, {
        startY: y,
        margin: { left: MARGIN, right: MARGIN, top: MARGIN, bottom: MARGIN + 14 },
        head: block.head.length ? block.head.map(toAutoTableRow) : undefined,
        body: block.body.map(toAutoTableRow),
        theme: 'grid',
        showHead: 'everyPage',
        styles: {
            font: 'helvetica',
            fontSize,
            cellPadding: 3,
            lineColor: [170, 170, 170],
            lineWidth: 0.4,
            overflow: 'linebreak',
            valign: 'top',
            minCellHeight: isForm ? 16 : 13,
        },
        columnStyles: {
            0: { cellWidth: labelWidth },
            ...(isForm ? { 1: { cellWidth: usable - labelWidth } } : {}),
        },
        horizontalPageBreak: Boolean(block.wide),
        horizontalPageBreakRepeat: block.wide ? 0 : undefined,
        rowPageBreak: 'avoid',
    })
    return doc.lastAutoTable.finalY + 8
}

/**
 * @param form   output of buildForm
 * @param info   { dataSetName, orgUnitName, period, withData, appVersion, generatedBy }
 * @returns jsPDF document
 */
export const renderPdf = (form, info) => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4', compress: true })
    const modeLabel = info.withData ? 'With data' : 'Blank form (without data)'
    doc.setProperties({
        title: `${info.dataSetName} - ${info.orgUnitName} - ${info.period}`,
        subject: modeLabel,
        creator: `GNARF Form Download v${info.appVersion} - Filoi Private Limited`,
    })

    // Cover block
    let y = MARGIN
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.setTextColor(...GREEN)
    doc.text(toPdfText(info.dataSetName), MARGIN, y + 18)
    y += 32
    const rows = [
        ['Organisation unit', info.orgUnitName],
        ['Period', info.period],
        ['Content', modeLabel],
        ['Tabs included', form.map((t) => t.title).join(', ')],
        ['Generated', `${new Date().toLocaleString()}${info.generatedBy ? ` by ${info.generatedBy}` : ''}`],
    ]
    autoTable(doc, {
        startY: y,
        margin: { left: MARGIN, right: MARGIN },
        body: rows.map(([k, v]) => [
            { content: k, styles: { fontStyle: 'bold', cellWidth: 120 } },
            toPdfText(v),
        ]),
        theme: 'plain',
        styles: { fontSize: 9, cellPadding: 3 },
    })
    y = doc.lastAutoTable.finalY + 12

    form.forEach((tab, ti) => {
        if (ti > 0) {
            doc.addPage()
            y = MARGIN
        }
        y = titleBar(doc, tab.title + (tab.open ? '' : '  (tab not open for this organisation unit)'), y, { size: 13, height: 24 })
        for (const section of tab.sections) {
            y = titleBar(doc, section.title, y + 4)
            y = writeParagraph(doc, section.header, y)
            for (const block of section.blocks) {
                y = ensureSpace(doc, y, 40)
                y = renderBlock(doc, block, y)
            }
            if (section.legend.length) {
                y = writeParagraph(doc, 'Answer options:', y, { style: 'bold' })
                for (const line of section.legend) {
                    y = writeParagraph(doc, line, y - 2)
                }
            }
            y = writeParagraph(doc, section.footer, y, { size: 7, color: 90 })
        }
    })

    // Footer on every page
    const total = doc.getNumberOfPages()
    for (let p = 1; p <= total; p++) {
        doc.setPage(p)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7)
        doc.setTextColor(120)
        const fy = pageHeight(doc) - 14
        doc.text(
            toPdfText(`${info.dataSetName} | ${info.orgUnitName} | ${info.period} | ${modeLabel}`),
            MARGIN,
            fy
        )
        doc.text(`Page ${p} of ${total}`, pageWidth(doc) - MARGIN, fy, { align: 'right' })
        doc.text(
            `GNARF Form Download v${info.appVersion} - Developed by Filoi Private Limited`,
            pageWidth(doc) / 2,
            fy,
            { align: 'center' }
        )
    }
    return doc
}

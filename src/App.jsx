import { useConfig, useDataEngine } from '@dhis2/app-runtime'
import {
    Button,
    ButtonStrip,
    Checkbox,
    CircularLoader,
    NoticeBox,
    Radio,
    SingleSelectField,
    SingleSelectOption,
    Tag,
} from '@dhis2/ui'
import React, { useEffect, useMemo, useState } from 'react'
import classes from './App.module.css'
import { fetchDataSets, fetchMetadata, fetchValues } from './lib/api.js'
import { buildForm, indexMetadata, listTabs } from './lib/model.js'
import { renderPdf } from './lib/pdf.js'

const DEFAULT_DATASET_CODE = 'NTD_GNARF'

const yearOptions = () => {
    const now = new Date().getFullYear()
    return Array.from({ length: 12 }, (_, i) => String(now - i))
}

const safeName = (s) => s.replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '')

const MyApp = () => {
    const engine = useDataEngine()
    const { appVersion } = useConfig()
    const version = appVersion?.full || '1.0.0'

    const [dataSets, setDataSets] = useState(null)
    const [dataSetId, setDataSetId] = useState('')
    const [meta, setMeta] = useState(null)
    const [orgUnit, setOrgUnit] = useState('')
    const [period, setPeriod] = useState(String(new Date().getFullYear() - 1))
    const [values, setValues] = useState(null)
    const [scope, setScope] = useState('full')
    const [selected, setSelected] = useState([])
    const [showClosed, setShowClosed] = useState(false)
    const [busy, setBusy] = useState('')
    const [error, setError] = useState(null)

    // 1. data sets with an autogen-forms configuration
    useEffect(() => {
        fetchDataSets(engine)
            .then((list) => {
                setDataSets(list)
                const def = list.find((d) => d.code === DEFAULT_DATASET_CODE) || list[0]
                if (def) {
                    setDataSetId(def.id)
                }
            })
            .catch(setError)
    }, [engine])

    // 2. metadata for the chosen data set
    useEffect(() => {
        if (!dataSetId || !dataSets) {
            return
        }
        const ds = dataSets.find((d) => d.id === dataSetId)
        setMeta(null)
        setValues(null)
        setOrgUnit('')
        setBusy('Loading form structure…')
        fetchMetadata(engine, ds.id, ds.code)
            .then((m) => setMeta(indexMetadata(m)))
            .catch(setError)
            .finally(() => setBusy(''))
    }, [engine, dataSetId, dataSets])

    // 3. current answers for org unit + period (they decide which tabs are open)
    useEffect(() => {
        if (!meta || !orgUnit || !period) {
            return
        }
        let cancelled = false
        setValues(null)
        setSelected([])
        setBusy('Reading answers for this organisation unit…')
        fetchValues(engine, meta.dataSet.id, orgUnit, period)
            .then((v) => !cancelled && setValues(v))
            .catch((e) => !cancelled && setError(e))
            .finally(() => !cancelled && setBusy(''))
        return () => {
            cancelled = true
        }
    }, [engine, meta, orgUnit, period])

    const tabs = useMemo(() => (meta && values ? listTabs(meta, values) : []), [meta, values])
    const openTabs = tabs.filter((t) => t.open)
    const listedTabs = showClosed ? tabs : openTabs
    const chosenIds = scope === 'full' ? openTabs.map((t) => t.id) : selected

    const toggleTab = (id) =>
        setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))

    const download = async (withData) => {
        setError(null)
        setBusy(withData ? 'Building PDF with data…' : 'Building blank PDF…')
        // let the loader paint before the synchronous PDF work
        await new Promise((r) => setTimeout(r, 50))
        try {
            const form = buildForm(meta, values, { tabIds: chosenIds, withData })
            const ou = meta.dataSet.organisationUnits.find((o) => o.id === orgUnit)
            const doc = renderPdf(form, {
                dataSetName: meta.dataSet.displayName,
                orgUnitName: ou?.displayName || orgUnit,
                period,
                withData,
                appVersion: version,
            })
            const part = scope === 'full' ? 'full' : chosenIds.length === 1 ? safeName(form[0]?.title || 'tab') : `${chosenIds.length}tabs`
            doc.save(
                `${safeName(meta.dataSet.code || 'GNARF')}_${safeName(ou?.displayName || orgUnit)}_${period}_${part}_${withData ? 'with-data' : 'blank'}.pdf`
            )
        } catch (e) {
            console.error(e)
            setError(e)
        } finally {
            setBusy('')
        }
    }

    const ready = meta && values && chosenIds.length > 0 && !busy

    return (
        <div className={classes.page}>
            <header className={classes.header}>
                <h1>GNARF Form Download</h1>
                <p>
                    Download the form for one organisation unit as a PDF, exactly as it is laid out in data entry:
                    blank, or filled with the data already entered.
                </p>
            </header>

            {error && (
                <NoticeBox error title="Something went wrong" className={classes.notice}>
                    {error.message || String(error)}
                </NoticeBox>
            )}

            {!dataSets && !error && <CircularLoader small />}

            {dataSets && dataSets.length === 0 && (
                <NoticeBox warning title="No GNARF data set found">
                    No data set with a GNARF form configuration is available to your user.
                </NoticeBox>
            )}

            {dataSets && dataSets.length > 0 && (
                <section className={classes.card}>
                    <h2>1. Choose what to download</h2>
                    <div className={classes.row}>
                        <SingleSelectField
                            label="Data set"
                            selected={dataSetId}
                            onChange={({ selected }) => setDataSetId(selected)}
                            className={classes.field}
                        >
                            {dataSets.map((d) => (
                                <SingleSelectOption key={d.id} value={d.id} label={d.displayName} />
                            ))}
                        </SingleSelectField>

                        <SingleSelectField
                            label="Organisation unit (country)"
                            selected={orgUnit}
                            onChange={({ selected }) => setOrgUnit(selected)}
                            filterable
                            noMatchText="No match"
                            placeholder={meta ? 'Select a country' : 'Loading…'}
                            disabled={!meta}
                            className={classes.fieldWide}
                        >
                            {(meta?.dataSet.organisationUnits || []).map((o) => (
                                <SingleSelectOption key={o.id} value={o.id} label={o.displayName} />
                            ))}
                        </SingleSelectField>

                        <SingleSelectField
                            label="Period (year)"
                            selected={period}
                            onChange={({ selected }) => setPeriod(selected)}
                            className={classes.fieldSmall}
                        >
                            {yearOptions().map((y) => (
                                <SingleSelectOption key={y} value={y} label={y} />
                            ))}
                        </SingleSelectField>
                    </div>
                </section>
            )}

            {busy && (
                <div className={classes.busy}>
                    <CircularLoader small /> <span>{busy}</span>
                </div>
            )}

            {meta && values && (
                <section className={classes.card}>
                    <h2>2. Choose tabs</h2>
                    <p className={classes.hint}>
                        {openTabs.length} of {tabs.length} tabs are open for this organisation unit and period,
                        based on the answers in the Introduction tab.
                    </p>
                    <Radio
                        label={`Full data set (all ${openTabs.length} open tabs)`}
                        checked={scope === 'full'}
                        onChange={() => setScope('full')}
                        value="full"
                        name="scope"
                    />
                    <Radio
                        label="Selected tabs only"
                        checked={scope === 'select'}
                        onChange={() => setScope('select')}
                        value="select"
                        name="scope"
                    />
                    {scope === 'select' && (
                        <div className={classes.tabPicker}>
                            <div className={classes.tabTools}>
                                <Button small onClick={() => setSelected(listedTabs.map((t) => t.id))}>
                                    Select all
                                </Button>
                                <Button small onClick={() => setSelected([])}>
                                    Clear
                                </Button>
                                <Checkbox
                                    label="Also show tabs not open for this country"
                                    checked={showClosed}
                                    onChange={({ checked }) => setShowClosed(checked)}
                                    dense
                                />
                            </div>
                            <div className={classes.tabGrid}>
                                {listedTabs.map((t) => (
                                    <Checkbox
                                        key={t.id}
                                        label={
                                            <span>
                                                {t.title} {!t.open && <Tag neutral>not open</Tag>}
                                            </span>
                                        }
                                        checked={selected.includes(t.id)}
                                        onChange={() => toggleTab(t.id)}
                                        dense
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </section>
            )}

            {meta && values && (
                <section className={classes.card}>
                    <h2>3. Download PDF</h2>
                    <ButtonStrip>
                        <Button primary disabled={!ready} onClick={() => download(true)}>
                            Download with data
                        </Button>
                        <Button disabled={!ready} onClick={() => download(false)}>
                            Download without data (blank form)
                        </Button>
                    </ButtonStrip>
                    {values.size === 0 && (
                        <p className={classes.hint}>
                            No data has been entered for this organisation unit and period yet, so only the
                            Introduction and Country progress tabs are open.
                        </p>
                    )}
                </section>
            )}

            <footer className={classes.footer}>
                Version {version} · Developed by Filoi Private Limited
            </footer>
        </div>
    )
}

export default MyApp

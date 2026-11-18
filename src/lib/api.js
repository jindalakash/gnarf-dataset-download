// DHIS2 Web API access through the app-runtime data engine.

const NAMESPACE = 'd2-autogen-forms'

const chunk = (arr, n) => {
    const out = []
    for (let i = 0; i < arr.length; i += n) {
        out.push(arr.slice(i, i + n))
    }
    return out
}

const fetchByIds = async (engine, resource, ids, fields) => {
    const results = []
    for (const part of chunk([...new Set(ids)].filter(Boolean), 100)) {
        const { r } = await engine.query({
            r: {
                resource,
                params: { filter: `id:in:[${part.join(',')}]`, fields, paging: false },
            },
        })
        results.push(...r[resource])
    }
    return results
}

/** Data sets that have a d2-autogen-forms configuration (GNARF and its approval copy). */
export const fetchDataSets = async (engine) => {
    const { keys, ds } = await engine.query({
        keys: { resource: `dataStore/${NAMESPACE}` },
        ds: {
            resource: 'dataSets',
            params: { fields: 'id,code,displayName,periodType', filter: 'code:like:GNARF', paging: false },
        },
    })
    const configured = new Set(keys)
    return ds.dataSets
        .filter((d) => configured.has(d.code))
        .sort((a, b) => a.displayName.localeCompare(b.displayName))
}

/** Everything needed to lay out the form, fetched once per data set. */
export const fetchMetadata = async (engine, dataSetId, dataSetCode) => {
    const { dataSet, config } = await engine.query({
        dataSet: {
            resource: `dataSets/${dataSetId}`,
            params: {
                fields: [
                    'id,code,displayName,periodType',
                    'organisationUnits[id,displayName,level]',
                    'sections[id,code,name,displayName,sortOrder,dataElements[id],greyedFields[dataElement[id],categoryOptionCombo[id]]]',
                    'dataSetElements[categoryCombo[id],dataElement[id,code,name,displayName,formName,displayFormName,valueType,optionSet[id],categoryCombo[id]]]',
                ].join(','),
            },
        },
        config: { resource: `dataStore/${NAMESPACE}/${dataSetCode}` },
    })

    const dataElements = dataSet.dataSetElements.map(({ dataElement, categoryCombo }) => ({
        ...dataElement,
        // a data set element can override the data element's category combo
        categoryCombo: categoryCombo || dataElement.categoryCombo,
    }))

    const sectionsConfig = config?.dataSets?.[dataSetCode] || {}
    const constantCodes = new Set()
    for (const s of Object.values(sectionsConfig.sections || {})) {
        for (const t of Object.values(s.texts || {})) {
            t?.code && constantCodes.add(t.code)
        }
    }
    for (const d of Object.values(config?.dataElements || {})) {
        d?.texts?.name?.code && constantCodes.add(d.texts.name.code)
    }

    const [categoryCombos, optionSets, constants] = await Promise.all([
        fetchByIds(
            engine,
            'categoryCombos',
            dataElements.map((d) => d.categoryCombo?.id),
            'id,name,isDefault,categories[id,code,name,categoryOptions[id,code,name,displayFormName]],categoryOptionCombos[id,name,categoryOptions[id]]'
        ),
        fetchByIds(
            engine,
            'optionSets',
            dataElements.map((d) => d.optionSet?.id),
            'id,options[code,name~rename(rawName),displayName~rename(name)]'
        ),
        constantCodes.size
            ? engine
                  .query({
                      c: {
                          resource: 'constants',
                          params: {
                              filter: `code:in:[${[...constantCodes].join(',')}]`,
                              fields: 'code,description,displayDescription',
                              paging: false,
                          },
                      },
                  })
                  .then(({ c }) =>
                      c.constants.map((k) => ({ code: k.code, description: k.displayDescription || k.description }))
                  )
            : [],
    ])

    return {
        dataSet: {
            ...dataSet,
            organisationUnits: [...dataSet.organisationUnits].sort((a, b) =>
                a.displayName.localeCompare(b.displayName)
            ),
        },
        dataElements,
        categoryCombos,
        optionSets,
        constants,
        config: {
            sections: sectionsConfig.sections || {},
            dataElements: config?.dataElements || {},
        },
    }
}

/** Values for one org unit + period, keyed "dataElementId.categoryOptionComboId". */
export const fetchValues = async (engine, dataSetId, orgUnit, period) => {
    const { v } = await engine.query({
        v: {
            resource: 'dataValueSets',
            params: { dataSet: dataSetId, orgUnit, period },
        },
    })
    const map = new Map()
    for (const dv of v.dataValues || []) {
        map.set(`${dv.dataElement}.${dv.categoryOptionCombo}`, dv.value)
    }
    return map
}

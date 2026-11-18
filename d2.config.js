/** @type {import('@dhis2/cli-app-scripts').D2Config} */
const config = {
    type: 'app',
    name: 'gnarf-dataset-download',
    title: 'GNARF Form Download',
    description:
        'Download the GNARF data set as a PDF form, blank or with data, for one organisation unit and period. Developed by Filoi Private Limited.',
    // author is read from package.json ("Filoi Private Limited") and written
    // to the manifest as "developer"; version is read from package.json too.
    minDHIS2Version: '2.39',
    entryPoints: {
        app: './src/App.jsx',
    },
}

module.exports = config

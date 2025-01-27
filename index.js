require('dotenv').config()
const axios = require('axios')
const fs = require('fs/promises')
let memory = require('./memory.json')

const { D4_SIGN_API_TOKEN, D4_CRYPT_KEY } = process.env

if (!D4_SIGN_API_TOKEN || !D4_CRYPT_KEY) 
    throw new Error ('Token and/or crypt key missing')

const d4signBaseRequest = axios.create({
    baseURL: 'https://secure.d4sign.com.br/api/v1',
    params: {
        tokenAPI: D4_SIGN_API_TOKEN,
        cryptKey: D4_CRYPT_KEY
    },
})

const readFromDocsDatabase = () =>
    fs.readFile('documents.json')
        .then(JSON.parse)

const updateMemory = args => 
    new Promise(r => r(memory = { ...memory, ...args }))
        .then(mem => fs.writeFile('memory.json', JSON.stringify(mem)))

const updateDocs = payload =>
    readFromDocsDatabase()
        .then(documents => fs.writeFile('documents.json', JSON.stringify([...documents, ...payload.documents])))
        .then(() => payload)

const getDocuments = () => 
    d4signBaseRequest.get('/documents', { params: { pg: memory.lastProcessedPage + 1 } })
        .then(({ data }) => ({
            pageInfo: data[0],
            documents: data.slice(1)
        }))
        .then(updateDocs)

const getDocDownloadUrl = doc => 
    d4signBaseRequest.post(`/documents/${doc.uuidDoc}/download`)
        .then(({ data }) => data)

const downloadDoc = url => axios.get(url, { responseType: 'arraybuffer' }).then(res => res.data)

const setDocumentAsProcessed = doc =>
    readFromDocsDatabase()
        .then(docs => docs.map(item => (item.uuidDoc === doc.uuidDoc ? { ...item, ...doc, processed: true } : item)))
        .then(docs => fs.writeFile('./documents.json', JSON.stringify(docs)))

const saveFile = (fileName, doc) =>
    fs.writeFile(`./downloads/${fileName}.zip`, doc)

const sleep = time => new Promise(r => setTimeout(r, time));

const main = async () => {
    while (!memory.fetchedAllDocs) {
        await getDocuments()
            .then(({ pageInfo }) => updateMemory({ 
                lastProcessedPage: pageInfo.current_page, 
                fetchedAllDocs: pageInfo.current_page === pageInfo.total_pages 
            }))
    }

    const fileContent = await readFromDocsDatabase()
    const unprocessedDocs = fileContent.filter(({ processed }) => !processed)

    for (const doc of unprocessedDocs) {
        const { url } = await getDocDownloadUrl(doc);
        const downloadedDoc = await downloadDoc(url)
        await saveFile(doc.nameDoc, downloadedDoc);
        await setDocumentAsProcessed(doc)
        await sleep(1000)
    }
}

main().then(() => console.log('✅ Finished processing'))
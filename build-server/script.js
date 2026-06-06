import {path} from 'path'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import {fs} from 'fs'
import {exec} from 'child_process'
import {mime} from 'mime-types'
import {Redis} from 'ioredis'


const publisher = new Redis('')


const s3Client = new S3Client({
    region: 'ap-south-2',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
})

const PROJECT_ID = process.env.PROJECT_ID


function publishLog(log) {
    publisher.publish(`logs:${PROJECT_ID}`, JSON.stringify({ log }))
}

async function init() {
    console.log('Executing script.js')
    publishLog('Build Started...')
    const outDirPath = path.join(__dirname, 'output')

    const p = exec(`cd ${outDirPath} && bun install && bun run build`)

    p.stdout.on('data', function (data) {
        console.log(data.toString())
        publishLog(data.toString())
    })

    p.stdout.on('error', function (data) {
        console.log('Error', data.toString())
        publishLog(`error: ${data.toString()}`)
    })

    p.on('close', async function () {
        console.log('Build Complete')
        publishLog(`Build Complete`)
        const distFolderPath = path.join(__dirname, 'output', 'dist')
        const distFolderContents = fs.readdirSync(distFolderPath, { recursive: true })

        publishLog(`Starting to upload`)
        for (const file of distFolderContents) {
            const filePath = path.join(distFolderPath, file)
            if (fs.lstatSync(filePath).isDirectory()) continue;

            console.log('uploading', filePath)
            publishLog(`uploading ${file}`)

            const command = new PutObjectCommand({
                Bucket: 'deployit-outputsrishi',
                Key: `__outputs/${PROJECT_ID}/${file}`,
                Body: fs.createReadStream(filePath),
                ContentType: mime.lookup(filePath)
            })

            await s3Client.send(command)
            publishLog(`uploaded ${file}`)
            console.log('uploaded', filePath)
        }
        publishLog(`Done`)
        console.log('Done...')
    })
}

init()
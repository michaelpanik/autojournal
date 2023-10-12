import * as dotenv from 'dotenv'
dotenv.config()
import { Dropbox } from "dropbox";
import { google } from 'googleapis';
import * as FfmpegCommand from 'fluent-ffmpeg'
import { createReadStream } from 'fs'
import * as path from 'path'
import { writeFile, readdir, unlink } from 'fs/promises'
import axios, { AxiosResponse } from 'axios';
import * as FormData from 'form-data'

type VoiceMemo = {
    name: string
    url: string
    path: string
}

const dropbox = new Dropbox({
    accessToken: process.env.DROPBOX_ACCESS_TOKEN
})

const googleDocs = google.docs('v1')
const googleDrive = google.drive('v3')

const handler = async () => {
    for (const file of await readdir('./tmp')) {
        await unlink(path.join('./tmp', file));
    }

    const auth = new google.auth.GoogleAuth({
        keyFile: 'credentials.json',
        scopes: [
            "https://www.googleapis.com/auth/documents",
            "https://www.googleapis.com/auth/drive",
            "https://www.googleapis.com/auth/drive.file",
        ]
    })
    google.options({ auth: await auth.getClient() })


    // Collect all audio files in the dropbox folder.
    if (!process.env.DROPBOX_AUDIO_FOLDER) throw new Error("No audio folder is defined.")

    const voiceMemos: VoiceMemo[] = []

    const res = await dropbox.filesListFolder({ path: process.env.DROPBOX_AUDIO_FOLDER })
    const files = await res.result.entries
    for (const file of files) {

        const { result } = await dropbox.filesGetTemporaryLink({ path: file.path_display || "" })

        voiceMemos.push({
            name: result.metadata.name,
            url: result.link,
            path: file.path_display
        })
    }

    // If no audio files, **EXIT**.
    if (!voiceMemos.length) throw new Error("No voice memos available.")

    // Get the current week of the year.
    const today = new Date();
    const currentYear = today.getFullYear()
    const formattedDate = today.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-')
    const firstOfYear = new Date(currentYear, 0, 1);
    const currentWeek = Math.ceil((((today.getTime() - firstOfYear.getTime()) / 86400000) + firstOfYear.getDay() + 1) / 7);
    const weekFolderName = `week_${currentWeek.toString().padStart(2, "0")}`

    // If no folder for the year (`[YYYY]`) exists in Google Drive folder `journals`, create one.
    let yearFolder
    const { data: { files: yearFolders } } = await googleDrive.files.list({
        q: `name ='${currentYear}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
    })
    if (!yearFolders?.length) {
        const newFolder = await googleDrive.files.create({
            requestBody: {
                name: `${currentYear}`,
                mimeType: 'application/vnd.google-apps.folder',
            }
        })

        yearFolder = newFolder.data
    } else {
        yearFolder = yearFolders[0]
    }

    // If no folder for the week number (`week_[WW]`) exists in Google Drive folder for current year, create one.
    let weekFolder
    const { data: { files: weekFolders } } = await googleDrive.files.list({
        q: `name ='${weekFolderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
    })
    if (!weekFolders?.length) {
        const newFolder = await googleDrive.files.create({
            requestBody: {
                name: weekFolderName,
                parents: [
                    (yearFolder.id || "")
                ],
                mimeType: 'application/vnd.google-apps.folder',
            }
        })
        weekFolder = newFolder.data
    } else {
        weekFolder = weekFolders[0]
    }

    // Use FFMPEG to combine into one audio file.
    let promises = voiceMemos.map(async (voiceMemo, i) => {
        const res = await axios({ url: voiceMemo.url, responseType: "arraybuffer" })
        const filePath = `tmp/${formattedDate}_${i}.m4a`
        await writeFile(filePath, res.data)
        return filePath
    })

    const filePaths = await Promise.all(promises)
    const combineAudioFiles = (): Promise<void> => {
        return new Promise((res, rej) => {
            const combinedAudioCommand = FfmpegCommand()

            for (const path of filePaths) {
                console.log(path)
                combinedAudioCommand.addInput(path)
            }

            combinedAudioCommand
                .mergeToFile(`${formattedDate}.m4a`, 'tmp')
                .on('end', () => {
                    res()
                })
                .on('error', (err) => {
                    return rej(new Error(err))
                })
        })
    }
    await combineAudioFiles()

    // Upload new audio file to Drive, in `week_[WW]/audio` with name `[MM-DD-YYYY].m4a`.
    await googleDrive.files.create({
        media: {
            mimeType: 'audio/m4a',
            body: createReadStream(`${formattedDate}.m4a`)
        },
        requestBody: {
            name: `${formattedDate}.m4a`,
            parents: [(weekFolder.id || "")]
        }
    })

    // Send audio file to Whisper to convert to text.
    let transcriptText
    try {
        const formData = new FormData()
        // formData.append('file', new Blob([readFileSync(`${formattedDate}.m4a`)]))
        formData.append('file', createReadStream(`${formattedDate}.m4a`))
        formData.append('model', 'whisper-1')

        const json = await axios({
            method: 'POST',
            url: 'https://api.openai.com/v1/audio/transcriptions',
            headers: {
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                ...formData.getHeaders()
            },
            data: formData
        })
        transcriptText = json.data.text
    } catch (error) {
        console.error(error.response.data)
    }

    // Delete all files in dropbox folder.

    // Store text as Google Doc, named `[MM-DD-YYYY]-transcript`, in current week's folder.
    try {
        const doc = await googleDrive.files.create({
            requestBody: {
                mimeType: 'application/vnd.google-apps.document',
                name: `${formattedDate}-transcript`,
                parents: [weekFolder.id || ""]
            }
        })

        const documentId = await doc.data.id

        const updateRes = await googleDocs.documents.batchUpdate({
            documentId: documentId,
            requestBody: {
                requests: [
                    {
                        insertText: {
                            text: transcriptText,
                            endOfSegmentLocation: {
                                segmentId: ""
                            }
                        }
                    }
                ]
            }
        })

        console.log(`Successfully created document with ID ${documentId}`)
    } catch (error) {
        console.error(error)
    }

    // Send output text to ChatGPT to summarize.
    let summaryText
    const summaryRes = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-3.5-turbo',
        messages: [
            {
                role: "user",
                content: `Summarize this transcript into a daily journal entry: ${transcriptText}`,
            }
        ]
    }, {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        }
    })

    summaryText = summaryRes.data.choices[0].message.content
    /* {
  id: 'cmpl-6ql1xmLM9ooUzXKhLIg29rYQ4OYjT',
  object: 'text_completion',
  created: 1678031861,
  model: 'text-davinci-003',
  choices: [
    {
      text: '\n\nToday I tested uploading data',
      index: 0,
      logprobs: null,
      finish_reason: 'length'
    }
  ],
  usage: { prompt_tokens: 78, completion_tokens: 7, total_tokens: 85 }
}
     */

    // Store summary as Google Doc, named `[MM-DD-YYYY]-summary`, in current week's folder.
    try {
        const doc = await googleDrive.files.create({
            requestBody: {
                mimeType: 'application/vnd.google-apps.document',
                name: `${formattedDate}-summary`,
                parents: [weekFolder.id || ""]
            }
        })

        const documentId = await doc.data.id

        const updateRes = await googleDocs.documents.batchUpdate({
            documentId: documentId,
            requestBody: {
                requests: [
                    {
                        insertText: {
                            text: summaryText,
                            endOfSegmentLocation: {
                                segmentId: ""
                            }
                        }
                    }
                ]
            }
        })

        await dropbox.filesDeleteBatch({
            entries: voiceMemos.map(voiceMemo => { return { path: voiceMemo.path } })
        })
    } catch (error) {
        console.error(error)
    }
}

handler()
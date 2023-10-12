import * as dotenv from 'dotenv'
dotenv.config()
import axios from 'axios';
import { drive_v3, google } from 'googleapis';

const main = async () => {
    // 1. Get the current week of the year.
    const today = new Date();
    const currentYear = today.getFullYear()
    const formattedDate = today.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-')
    const firstOfYear = new Date(currentYear, 0, 1);
    const currentWeek = Math.ceil((((today.getTime() - firstOfYear.getTime()) / 86400000) + firstOfYear.getDay() + 1) / 7);
    const weekFolderName = `week_${currentWeek.toString().padStart(2, "0")}`

    // 1. Collect all summary files in the weeks folder in Google Drive.
    const googleDocs = google.docs('v1')
    const googleDrive = google.drive('v3')

    const auth = new google.auth.GoogleAuth({
        keyFile: 'credentials.json',
        scopes: [
            "https://www.googleapis.com/auth/documents",
            "https://www.googleapis.com/auth/drive",
            "https://www.googleapis.com/auth/drive.file",
        ]
    })
    google.options({ auth: await auth.getClient() })

    const { data: { files: weekFolders } } = await googleDrive.files.list({
        q: `name = '${weekFolderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
    })
    const weekFolderId = weekFolders[0].id

    if (!weekFolders.length || weekFolders.length < 1) return

    const { data: { files: summaryFiles } } = await googleDrive.files.list({
        orderBy: 'createdTime',
        q: `'${weekFolderId}' in parents and name contains '-summary'`// and mimeType = 'application/vnd.google-apps.document' and trashed = false`
    })

    // 1. If no summary files, **EXIT**.
    if (!summaryFiles.length) return

    // 1. Combine all summary text to one input and send to ChatGPT to summarize.
    let allText = []
    for (let summaryFile of summaryFiles) {
        await googleDocs.documents.get({
            documentId: summaryFile.id
        })
            .then(doc => {
                allText.push(`\n${doc.data.title.replace('-summary', '')}\n`)
                doc.data.body.content.map(content => {
                    if (!content.paragraph) return

                    content.paragraph.elements.map(element => allText.push(element.textRun.content))
                    // .map(element => {
                    //     // if (element.textRun && element.textRun.content) {
                    //     allText.push(element.textRun.content)
                    //     // }
                    // })

                })
                allText.push('\n--------------------\n')
            })
    }

    let summaryText = ''
    const summaryRes = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-3.5-turbo',
        messages: [
            {
                role: "user",
                content: `Summarize these daily journal entries into a long-form weekly summary: ${allText.join('\n')}`,
            }
        ]
    }, {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        }
    })

    summaryText = summaryRes.data.choices[0].message.content

    // 1. Store returned summary in the weeks folder, named `week_[WW]_summary`
    try {
        const doc = await googleDrive.files.create({
            requestBody: {
                mimeType: 'application/vnd.google-apps.document',
                name: `week-${currentWeek}-summary`,
                parents: [weekFolderId || ""]
            }
        })

        const documentId = await doc.data.id

        await googleDocs.documents.batchUpdate({
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

        console.log(`Successfully created document with ID ${documentId}`)
    } catch (error) {
        console.error(error)
    }
    /*
    ## Weekly
    1. Send summary email
    1. **EXIT**
    */
}

main()
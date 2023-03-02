# autojournal 📔

## Daily
1. Collect all audio files in the dropbox folder.
1. If no audio files, **EXIT**.
1. If no folder for the year (`[YYYY]`) exists in Google Drive folder `journals`, create one.
1. Get the current week of the year.
1. If no folder for the week number (`week_[WW]`) exists in Google Drive folder for current year, create one.
1. Use FFMPEG to combine into one audio file.
1. Upload new audio file to Drive, in `week_[WW]/audio` with name `[MM-DD-YYYY].mp3`.
1. Delete all files in dropbox folder.
1. Send audio file to Whisper to convert to text.
1. Store text as Google Doc, named `[MM-DD-YYYY]-transcript`, in current week's folder.
1. Send output text to ChatGPT to summarize.
1. Store summary as Google Doc, named `[MM-DD-YYYY]-summary`, in current week's folder.
1. **EXIT**

## Weekly
1. Get the current week of the year.
1. Collect all summary files in the weeks folder in Google Drive.
1. If no summary files, **EXIT**.
1. Combine all summary text to one input and send to ChatGPT to summarize.
1. Store returned summary in the weeks folder, named `week_[WW]_summary`
1. Send summary email
1. **EXIT**

## Monthly
1. Get the previous month
1. Collect all subfolders (week folders) in the folder for that month.
1. If no subfolders, **EXIT**.
1. In each week folder, find the week summary file
1. Combine all week summary files into one text.
1. Send combined text to ChatGPT for summary.
1. Send email including monthly summary and all weekly summaries
1. **EXIT**

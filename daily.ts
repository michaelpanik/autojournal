// Collect all audio files in the dropbox folder.
const voiceMemos: string[] = []
// If no audio files, **EXIT**.
if (!voiceMemos.length) throw new Error("No voice memos available.")
// If no folder for the year (`[YYYY]`) exists in Google Drive folder `journals`, create one.
const today = new Date();
const currentYear = today.getFullYear()
// Get the current week of the year.
const firstOfYear = new Date(currentYear, 0, 1);
const currentWeek = Math.ceil((((today.getTime() - firstOfYear.getTime()) / 86400000) + firstOfYear.getDay() + 1) / 7);
// If no folder for the week number (`week_[WW]`) exists in Google Drive folder for current year, create one.
// Use FFMPEG to combine into one audio file.
// Upload new audio file to Drive, in `week_[WW]/audio` with name `[MM-DD-YYYY].mp3`.
// Delete all files in dropbox folder.
// Send audio file to Whisper to convert to text.
// Store text as Google Doc, named `[MM-DD-YYYY]-transcript`, in current week's folder.
// Send output text to ChatGPT to summarize.
// Store summary as Google Doc, named `[MM-DD-YYYY]-summary`, in current week's folder.
// **EXIT**

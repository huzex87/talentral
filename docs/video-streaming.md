# Streamed lesson video: setup (Bunny Stream)

Hub teams upload a lesson video once. Bunny Stream encodes it into lighter versions (240p, 360p, 480p, 720p). Learners watch in Bunny's adaptive player, which picks the quality their connection can carry. A small 360p MP4 is used for **Data saver** and for **Download for offline**. YouTube and Vimeo links, and plain MP4 uploads, keep working as before.

Streaming is off until the steps below are done; the "Streamed video" panel only appears on video lessons when it is on.

## 1. Bunny setup

1. Create a Bunny.net account and a **Stream** video library named *Talentral*.
2. In the library's **Encoding** settings, enable 240p, 360p, 480p and 720p, and turn on **MP4 fallback** (needed for data saver and offline).
3. In **Security**:
   - Turn on **Embed view token authentication** and copy the key into `BUNNY_STREAM_TOKEN_KEY` (players are then signed for four hours).
   - Optionally turn on the CDN's **Token authentication** for direct file URLs and copy that key into `BUNNY_CDN_TOKEN_KEY`.
   - Add `talentral.ng` and `*.talentral.ng` to the allowed referrers.
4. In the pull zone behind the library, turn on **Add CORS headers** for `mp4` so phones can save videos for offline study.
5. From **API**, copy the Library ID (`BUNNY_STREAM_LIBRARY_ID`), the API key (`BUNNY_STREAM_API_KEY`) and the CDN hostname (`BUNNY_STREAM_CDN_HOST`, for example `vz-1a2b3c4d-5e6.b-cdn.net`).
6. In **Webhook**, set the URL to `https://talentral.ng/api/stream/webhook?secret=<random string>` and put the same string in `STREAM_WEBHOOK_SECRET`. The webhook is only a hint: Talentral reads the video's status back from Bunny before updating a lesson.

## 2. Turn it on

Set in Vercel (Production only, as sensitive variables):

```
STREAM_DRIVER=bunny
BUNNY_STREAM_LIBRARY_ID=...
BUNNY_STREAM_API_KEY=...
BUNNY_STREAM_CDN_HOST=...
BUNNY_STREAM_TOKEN_KEY=...
BUNNY_CDN_TOKEN_KEY=...      (optional)
STREAM_WEBHOOK_SECRET=...
```

## How it works

- **Upload:** the browser asks Talentral to create the video, then uploads straight to Bunny with the TUS resumable protocol (`lib/tus.ts`) in 5 MB chunks, signed for six hours. A dropped connection resumes where it stopped. Files up to 4 GB.
- **Encoding:** the panel shows progress, then "Preparing" until Bunny reports the video playable, then the versions and length.
- **Playback:** `/learn/<cohort>/<lesson>` shows the adaptive player online; Data saver (remembered on the phone) and offline use the 360p file through `/learn/media/<cohort>/<lesson>`, which checks the learner can open the lesson and redirects to a signed CDN link.
- **Offline:** "Download for offline" saves the 360p file with the course.
- **Replacing or removing** a video deletes the old one from Bunny.
- **Tests** use `STREAM_DRIVER=fake`: a local TUS server at `/api/stream/fake-tus` and files in `.stream/`, so the real upload code runs end to end.

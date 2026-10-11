# Talentral Course Library

The Course Library holds ready-made courses that Talentral builds once and any hub takes as its own.
Each course comes in English and Hausa, with quizzes, assignments and marking rubrics. A hub that has no
course materials or tutors of its own can start teaching from the library on day one.

The strategy (first courses, costs, Talentral Faculty, who pays, roadmap and the full toolset) is in the
"Talentral Course Library Strategy" document. This page covers how the library works in the product.

## How it works

1. **Authoring.** The library is a workspace of its own, "Talentral Course Library"
   (`/dashboard/talentral-library`). Platform admins open it from the platform console with
   "Open the library workspace". They need no support session, because no hub's data is involved.
   Talentral Faculty tutors join it through its Team page, like any hub team.
2. **Building a course.** Library courses use the normal course builder: modules, lessons (reading,
   video, audio, PDF, quiz, assignment), Hausa versions, quiz questions, rubrics and skills. Each
   library course also has a **track** (for example Digital skills or Data analysis), which hubs
   browse by.
3. **Publishing.** Hubs see a library course only once it is published. Moving it back to draft hides
   it from the library; copies hubs already took stay theirs.
4. **Browsing.** Hub owners and admins open **Course library** from the Teaching menu or the Courses
   page. Each course shows its track, size, study time, videos, quizzes, assignments and how much is
   in Hausa. The course page shows the full outline, module by module, but not the lesson content.
5. **Taking a course.** "Use this course" copies the whole course into the hub's courses as a draft:
   modules, lessons, quiz questions, rubrics, and the platform skills each lesson proves. The hub can
   then change anything, preview it as a learner, publish it and choose it for a cohort.
6. **Updates.** A copy remembers which library course it came from and when. If Talentral changes the
   library course later, the hub's copy shows "The library has a newer version", and the hub can take
   a fresh copy. Its own copy and its changes are never overwritten.

## Rules that keep it safe

- **Only owners and admins of an active hub** can browse or take library courses. Reviewers and
  facilitators cannot, and a suspended hub cannot. The database enforces this in
  `app.can_use_library`.
- **The library is not a hub.** Visitors, the public hub directory, the sitemap, the weekly digest and
  the platform's hub lists never show it. The `tenants_read` policy hides it from everyone except its
  own team and platform admins.
- **Content stays in the library until a hub takes it.** Hubs read an outline through
  `app.library_outline`, never the lesson tables of the library.
- **Files are shared, not duplicated.** A copied lesson points at the same stored file as the library
  lesson. Talentral never deletes lesson files when a lesson changes or is removed, so a copy keeps
  working whatever the library does next. Keep it that way.
- **Streamed video is not copied.** A Bunny stream belongs to one lesson. Library video lessons use
  YouTube links (set to Unlisted) or uploaded files.
- **Every copy is audited** as `course.copied_from_library` in the hub's audit log.

## Tools for making library courses

| Job | Default tool | Backup |
| --- | --- | --- |
| Screen recording | OBS Studio | Camtasia |
| Presenter on camera | Phone on a tripod with Open Camera | Laptop webcam through OBS |
| Voice clean-up | Audacity | DaVinci Resolve audio tools |
| Video editing | DaVinci Resolve (standard edition) | Shotcut |
| Captions | Subtitle Edit, with its Whisper draft | Captions typed in Subtitle Edit |
| Slides | Google Slides | Microsoft PowerPoint |
| Visuals and thumbnails | Canva | Google Slides |
| Diagrams | draw.io | Canva |
| Lessons, quizzes, rubrics | Talentral course builder with AI drafting | |
| Video hosting | YouTube, Unlisted | Bunny Stream once enabled |
| Live classes | Google Meet, through Talentral live sessions | Zoom or Jitsi Meet |
| Whiteboard | Excalidraw | A blank Google Slides page |

House settings: record at 1920 x 1080 and 30 frames per second; keep videos to 5 to 8 minutes;
export MP4 (H.264, AAC 128 kbps) levelled to about -16 LUFS; add WebVTT captions in English and
Hausa; keep lesson PDFs under 5 MB.

## Where the code is

- Migration: `packages/db/migrations/0031_course_library.sql`
- Hub pages: `apps/web/app/dashboard/[hub]/library/`
- Helpers: `apps/web/lib/library.ts`
- Tests: `packages/db/test/rls.test.ts` ("the course library") and the e2e test
  "the course library: Talentral publishes a course, a hub takes it as its own draft".

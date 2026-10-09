# Usability test plan

This plan tests Talentral with the people who will use it: hub staff, learners on their own phones, and employers. Automated checks (unit tests, end-to-end tests, the WCAG 2.2 AA scan and the low-end phone performance check) show that the product works. Only sessions with real people show whether it is easy to use. Run this plan before each founding hub opens its first call, then again after any major change to the learner app.

## 1. What we want to learn

1. Can a hub owner set up a hub, open a call and admit a cohort without help?
2. Can a reviewer score 20 applications in one sitting without losing their place?
3. Can a learner with a mid-range Android phone and a small data plan apply, sign in with their phone number, study a lesson offline and hand in work?
4. Do learners who read Hausa understand the Hausa screens?
5. Can an employer find, shortlist and contact a candidate, and do they trust the verified skills?
6. Do the figures on the Overview, Impact, Engagement and Outcomes pages mean what staff and funders think they mean?

## 2. Participants

Five people per group find most problems. Recruit through the founding hubs, with each person's consent, and pay transport and data costs in naira on the day.

| Group | Number | Who | Device |
|---|---|---|---|
| Hub owners and admins | 5 | People who ran a call for applications in the last year | Their own laptop |
| Reviewers | 5 | Hub staff or volunteers who score applications | Their own laptop or phone |
| Learners, English | 5 | Aged 18 to 35, applied to a hub programme before | Their own Android phone |
| Learners, Hausa | 5 | Hausa is the language they read most easily | Their own Android phone |
| Employers | 3 | Hiring managers at firms in Kano, Kaduna or Katsina | Their own laptop |

Include at least two women in every group and at least one person who uses a screen reader or screen magnifier across the learner groups. Note each learner's phone model and data plan.

## 3. Set-up

- **Environment:** a staging copy of Talentral with the demo academy, plus a hub created for the session. Never use real applicant data.
- **Accounts:** a fresh account for each participant, created on the day.
- **Network:** for learner sessions, run part of the session on the participant's own mobile data and part with mobile data switched off (the offline tasks).
- **Recording:** screen and audio recording only with written consent, in the participant's language. Store recordings in the team's private drive and delete them 90 days after the report.
- **Roles:** one facilitator who speaks the participant's language and one note-taker. The facilitator never shows the participant how to do a task.

## 4. Tasks and success measures

Each task has a starting point, a goal the participant hears in plain words, and what counts as success. Time each task from the moment the participant starts.

### Hub owners and admins

| # | Task the participant hears | Success | Target |
|---|---|---|---|
| H1 | "Set up your hub's page so applicants can trust it: your logo, a cover photo and a short description." | Hub profile complete, page visible | Under 8 min, no help |
| H2 | "Open a call for a 12-week programme with two tracks." | Programme published, application link copied | Under 10 min |
| H3 | "Twenty people were accepted. Put them in a cohort that starts next Monday." | Cohort created, accepted applicants added, welcome email sent | Under 5 min |
| H4 | "Your funder asks how many women completed the last cohort. Find the answer." | Correct figure from Impact or the funder report | Under 3 min |
| H5 | "Find the application from Aisha Musa." | Uses Search (Ctrl+K) or the filters and opens it | Under 1 min |

### Reviewers

| # | Task | Success | Target |
|---|---|---|---|
| R1 | "Score the next 10 applications that nobody has scored, using the rubric." | 10 scores saved, no application skipped by mistake | Under 15 min; notes on whether they discover Save and next and the keys |
| R2 | "Shortlist the three strongest." | Three moved to Shortlisted with the email option understood | Under 3 min |

### Learners (English and Hausa groups)

| # | Task | Success | Target |
|---|---|---|---|
| L1 | "Apply to this programme." Interrupt halfway: close the browser, then ask them to continue. | Application submitted; the draft came back after reopening | Under 12 min |
| L2 | "Sign in with your phone number." | Signed in with the SMS code | Under 2 min |
| L3 | "Get this week's lessons ready to study without data." Then switch data off. "Study the first lesson." | Module downloaded; lesson opens offline | Under 4 min |
| L4 | "Hand in your first assignment." | Submission saved, status shows | Under 5 min |
| L5 | "When is your next class, and how far through the course are you?" | Correct answers from the home screen | Under 30 s |
| L6 | "Make your Passport ready for employers to see." | Photo added, headline, at least three skills, visibility on | Under 8 min |

### Employers

| # | Task | Success | Target |
|---|---|---|---|
| E1 | "Find two candidates for a junior data analyst role in Kano." | Two candidates opened from search or a shortlist | Under 6 min |
| E2 | "How sure are you that this candidate has the skills listed? Why?" | Explains the difference between self-reported and verified skills | Qualitative |

## 5. What we measure

- **Task success:** completed without help, completed with a hint, or not completed.
- **Time on task:** against the targets above.
- **Errors:** wrong taps, dead ends, back-button use, error messages seen.
- **Ease rating:** after each task, "How easy was that?" on a 1 to 7 scale (Single Ease Question).
- **Overall:** the System Usability Scale (SUS) at the end, read aloud in Hausa for the Hausa group. Target: 75 or higher for every group.
- **Words that confused people:** every term a participant asked about or misread. Pay attention to "cohort", "rubric", "Passport", "Engagement", "Outcomes" and the Hausa labels.

## 6. Session script (60 minutes)

1. **Welcome (5 min).** Explain that we are testing Talentral, not them. Get consent for recording. Ask about their phone, data plan and how they apply to programmes today.
2. **Tasks (40 min).** Read one task at a time. Ask them to think aloud. If they are stuck for two minutes, give one hint and record it.
3. **Questions (10 min).** SUS questionnaire, then: "What was the hardest part?", "What would make you trust this more?", "Would you recommend it to a friend applying to a programme?"
4. **Close (5 min).** Pay costs, thank them and explain what happens with their feedback.

## 7. Analysis and report

Within five working days of the last session:

1. List every problem with the task, the number of participants affected and a severity:
   - **Critical:** stops the task.
   - **Serious:** causes a long delay or a wrong result.
   - **Minor:** an annoyance.
2. Fix critical and serious problems before the founding hub opens its call.
3. Share a two-page summary with the founding hubs: what we tested, what we found, what we changed, and the SUS score per group.
4. Add a test for every fix to the end-to-end suite so it stays fixed.

## 8. Low-end phone performance check (automated, every release)

Real devices vary, so every release also runs a throttled check of the learner screens. It uses a Pixel 7 screen, a CPU slowed fourfold, and a "slow 4G" network (1.6 Mbps down, 750 kbps up, 150 ms latency). The pages are learner home, course, lesson, Passport and the public application form.

| Measure | Budget |
|---|---|
| Largest Contentful Paint | under 2.5 s |
| Total Blocking Time (proxy for Interaction to Next Paint) | under 300 ms |
| Cumulative Layout Shift | under 0.1 |
| Data transferred on first load | under 600 KB |

The results of the latest run are in the pull request that introduced this plan.

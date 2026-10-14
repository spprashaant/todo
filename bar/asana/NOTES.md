# Asana recurring tasks: reference notes ("the bar")

Collected 2026-09-26. No sign-in or account was used. Cookie banners: none appeared on help.asana.com,
forum.asana.com, or the Wayback pages during capture, so nothing had to be declined. The Intercom chat bubble was
hidden with CSS for the help-center captures.

## Source tiers (read this first)

- OFFICIAL, CURRENT: the Asana Help Center article (help.asana.com). Its only recurrence image is a 2021-era GIF.
- OFFICIAL, 2023: an Asana-staff "Product Updates" post on forum.asana.com (posted by Emily_Roman, who has the
  Asana_Staff_Badge) and the official Asana YouTube video "What's New in Asana | September 2023". These are the
  newest official pictures of the repeat UI I could find, and they match the current UI layout.
- OFFICIAL, LEGACY: images from the old asana.com/guide pages (2019-2021 UI). The pages now redirect to the Help
  Center, so I read them through the Wayback Machine. The images themselves are still live on Asana's own image host
  (luna1.co), and I downloaded them from there.
- COMMUNITY (NOT OFFICIAL), in `community/`: screenshots posted by forum users, forum leaders and ambassadors on
  forum.asana.com. I kept them because no official source shows the current "Periodically" panel, the "Custom"
  panel, or any mobile recurrence UI. Treat them as unverified user content.

## Image inventory

Sizes are the pixel dimensions of the saved files. None of the images were resized. Video frames are 1080p frames
decoded from YouTube's encode, so they are slightly soft. Crop rectangles are x,y,w,h in the saved file's pixels. I
test-cropped each rectangle to check it.

### Official, current Help Center
Article: https://help.asana.com/s/article/scheduling-tasks-using-start-dates-due-dates-and-times?language=en_US

| File | Size | Source | What it shows | A/B use / crop |
|---|---|---|---|---|
| asana-helpcenter-recurring-weekly.gif | 1293x728, 38 frames, 8.8 s | https://assets.asana.biz/m/1e0119ec46bcec71/original/animatedui-helpcenter-tasks-scheduling-tasks-using-start-dates-due-dates-and-times-003-en-us-gif.gif (byte-identical to legacy https://luna1.co/b0162f.gif) | The only recurrence image in the current article (Dec 2021 UI, light). Hovers the repeat button ("Set to repeat" tooltip), then shows "Repeats [Weekly]" and "On these days" with M..S checkboxes, and ticks T W T F. | Source GIF; use the frames below. |
| asana-helpcenter-set-to-repeat-tooltip.png | 1293x728 | frame 1 of the GIF above | Date picker (range 06/12/21 to 31/12/21) with footer clock icon and repeat icon. Cursor on the repeat icon, black tooltip "Set to repeat", "Clear all" at right. | OK. Crop 845,290,285,425 (picker plus tooltip). |
| asana-helpcenter-weekly-friday.png | 1293x728 | frame 12 of the GIF | "Repeats Weekly", "On these days", only F checked. Repeat button highlighted in lavender. Task detail shows "6 - 31 Dec" plus the repeat icon. | Clean. Section crop 993,340,280,190. Whole picker 993,28,280,505. |
| asana-helpcenter-weekly-tue-fri.png | 1293x728 | frame 38 (last) of the GIF | Same panel with T W T F checked. The calendar previews the next occurrences (Jan 4-7) as light-purple circles. | Clean, no cursor over the controls. Same crops as above. |
| asana-helpcenter-datepicker-repeat-icon.jpg | 1050x717 | https://assets.asana.biz/transform/21fc228f-a041-4f8e-b7cf-a05cf9d327e1/productui-helpcenter-tasks-scheduling-tasks-using-start-dates-due-dates-and-times-001-en-us.png (served as JPEG despite the .png name) | Due-date picker in its resting state: "+ Start date", date field, calendar, footer with clock and repeat icons (repeat not active), "Clear". | Entry-point reference only. |
| asana-helpcenter-recurring-section.png | 1720x4144 (2x DPR) | Playwright element capture of the article | The whole "Recurring tasks" section, from the heading to the end of the tips. | Documentation only. |
| asana-helpcenter-scheduling-article-fullpage.png | 2880x14620 (2x DPR) | Playwright full-page capture | The whole article. | Documentation only. |

### Official, 2023 (Asana staff forum post and official YouTube video)
Forum post: https://forum.asana.com/t/set-tasks-to-repeat-on-a-certain-day-of-the-month/463946 (2023-07-05, Asana staff).
Video: https://www.youtube.com/watch?v=fNref5JbQ40 ("What's New in Asana | September 2023", official Asana channel). The recurrence segment runs from about 0:18 to 0:29.

| File | Size | Source | What it shows | A/B use / crop |
|---|---|---|---|---|
| **asana-repeat-menu.png** | 1920x1080 | video frame, about 21.75 s | My tasks list view, light UI. Picker for 09/29/23 with "Repeats [Weekly]" and its dropdown open: "Daily", "Weekly" (checked), "Monthly", "Yearly", and "Periodically" cut off at the menu's bottom edge. "On these days" S M T W T is partly covered by the menu. The cursor (hand) is on the "Weekly" button. The calendar previews Oct 6 as the next occurrence. | **Best official desktop A/B crop for the repeat menu.** Section plus menu: 1080,700,580,340. Whole picker plus menu: 1060,200,600,840. Caveats: the last item is clipped, "Custom" is not visible, the cursor is present, and there is video softness. |
| asana-video-2023-set-to-repeat-tooltip.png | 1920x1080 | video frame, about 19.0 s | Picker before repeat is set. Cursor on the repeat icon, tooltip "Set to repeat", footer "Clear". | Good. Crop 1060,280,460,610. |
| asana-video-2023-weekly-panel.png | 1920x1080 | video frame, about 20.75 s | "Repeats [Weekly]", "On these days" S M T W T F S with F checked, footer clock, active repeat button, "Clear all". Cursor sits in empty space. | Clean. Section crop 1068,715,440,260. Whole picker 1060,200,460,790. |
| asana-video-2023-monthly-on-the-last-friday.png | 1920x1080 | video frame, about 24.25 s | "Repeats [Monthly]". Radio "On the" (selected) with [Last] and [Friday]. Radio "On day" with [Last] (greyed out). Arrow cursor between the rows. | Clean. Section crop 1068,715,440,255. |
| asana-video-2023-monthly-ordinal-menu.png | 1920x1080 | video frame, about 25.75 s | Ordinal dropdown open over the calendar: "1st", "2nd", "3rd", "4th", and "Last" (checked, clipped). | Good. Crop 1060,200,560,790. |
| asana-video-2023-09-whatsnew-recurring-clip.mp4 | 1920x1080, 13.1 s, no audio | 0:17-0:30 of the video, stream copy | The full recurrence sequence: set to repeat, then Weekly, the menu, Monthly, and the ordinal menu. | Motion reference. |
| asana-forum-2023-monthly-on-the-1st-monday.jpeg | 412x500 | https://us1.discourse-cdn.com/asana/original/3X/f/e/fe13ce83d1c4b1d713325484fdec93eb0bddadd2.jpeg | Task "New request". The due-date field reads "Jul 3" plus the repeat icon. Picker for July 2023 with "Repeats [Monthly]", radio "On the" [1st] [Monday] selected, and radio "On day" [3]. | Clean but small. Section crop 90,335,170,100. Whole picker 90,140,170,295. |
| asana-forum-2023-monthly-weekday.gif | 600x359, 210 frames, 21 s | https://us1.discourse-cdn.com/asana/original/3X/c/2/c297fafe4531aa8e3194d660e9c9613de261fa87.gif | Full staff demo. Set repeat, change Weekly to Monthly, pick "On the 1st Monday", mark the task complete. The completed task disappears (the list is filtered to incomplete tasks) and a new "New request" row appears in the same section with due "Jul 3" plus the repeat icon. | Behaviour evidence. Too low-res for A/B. |
| asana-forum-2023-repeat-menu-frame.png | 600x359 | frame 40 of that GIF | Repeat dropdown open: Daily, Weekly (checked), Monthly, Yearly, Periodically (clipped). | Low-res. Crop 400,215,200,92. |
| asana-row-repeat-icon.png | 600x359 | frame 200 of that GIF | After completion: the list row "New request" with "Jul 3" plus the repeat icon in the Due date column, and the task detail with "Jul 3" plus the repeat icon. | Only official evidence of the row marker, but low-res. Row 0,130,360,20. Detail field 360,95,240,30. |
| asana-forum-2023-product-update-post.png | 1882x3392 (2x DPR) | Playwright capture of post #1 | The staff announcement post with both images. The top title line is partly under the forum's sticky header. | Documentation only. |

### Official, legacy asana.com/guide (2019-2021 UI)
Page: https://asana.com/guide/help/tasks/fields (now a 301 redirect), read through Wayback captures
https://web.archive.org/web/20210806074445/https://asana.com/guide/help/tasks/fields (2020-21 images) and
https://web.archive.org/web/20190917171841/https://asana.com/guide/help/tasks/fields (2019 images).

| File | Size | Source | What it shows | A/B use / crop |
|---|---|---|---|---|
| asana-guide-2020-set-to-repeat-link.png | 1300x728 | https://luna1.co/8eb3ce.png | 2020 picker with footer links "Add due time or Set to repeat". Purple numbered callouts 1 and 2 are drawn on the image. | Annotated, so not clean. |
| asana-guide-2020-periodically-7-days-after-completion.png | 1300x728 | https://luna1.co/ec9d5f.png | "Repeat [Periodically]" and "Interval [7] days after completion", with purple callouts 1 and 2. | Official after-completion panel, but old UI and annotated. Crop 855,585,260,80. |
| asana-guide-2020-stop-repeat.gif | 1294x728, 37 frames, 14 s | https://luna1.co/1c797f.gif | Opens a task that repeats 7 days after completion, opens the Repeat menu, chooses "Never", and the repeat disappears. | Source GIF. |
| asana-guide-2020-detail-repeat-badge.png | 1294x728 | frame 2 of 1c797f.gif | Task detail due field "26 Aug" with a small repeat badge on the top-right of the calendar icon (2020 marker style). | Marker reference. Crop 840,255,330,60. |
| asana-guide-2020-repeats-summary-line.png | 1294x728 | frame 8 | Collapsed picker summary line: repeat icon plus "Repeats 7 days after completion" as a blue link. | Text reference. Crop 855,555,260,30. |
| asana-guide-2020-periodically-panel.png | 1294x728 | frame 16 | Same panel without callouts: "Repeat [Periodically]", "Interval [7] days after completion". Hand cursor on "Periodically". | Cleanest official after-completion panel (old UI). Crop 850,555,265,70. |
| asana-guide-2020-repeat-menu.png | 1294x728 | frame 18 | 2020 Repeat menu: "Never", "Daily", "Periodically" (checked, highlighted), "Weekly", "Monthly", "Yearly". | Crop 860,520,260,120. Cursor over the menu. |
| asana-guide-2019-set-to-repeat-link.png | 1300x728 | https://luna1.co/2c085e.png | 2015-19 UI: picker with "Add due time or set to repeat", callouts. | History only. |
| asana-guide-2019-weekly-interval.png | 1300x728 | https://luna1.co/45dc98.png | 2015-19 UI: "REPEAT [Weekly]", "INTERVAL every [1] week on" S M T W T F S, callouts. | History only. |
| asana-guide-2019-repeat-menu.png | 1300x728 | https://luna1.co/8b3c98.png | 2015-19 UI menu: Never, Daily, Periodically (checked), Weekly, Monthly, Yearly, callouts. | History only. Crop 840,400,200,130. |
| asana-guide-2021-archived-recurring-section.png | 1800x6142 (2x DPR) | Playwright capture of the Wayback page above | The legacy guide's whole recurring section, with its three images. | Documentation only. |

### Community (not official), `community/`

| File | Size | Source (thread, post, date) | What it shows | A/B use / crop |
|---|---|---|---|---|
| asana-community-2022-periodically-days-after-completion.jpeg | 576x960 | https://forum.asana.com/t/recurring-tasks-to-recur-from-completion-date-rather-than-due-date/222068 post 2, 2022-10-16 (forum leader); img https://us1.discourse-cdn.com/asana/original/3X/8/1/81e3808e28225ab8ca3db50e695de5ccf7afbb47.jpeg | Current-style picker (Oct 2022, light, Retina): "Repeats [Periodically]", "Days after completion [7]", footer clock, active repeat button, "Clear all". No cursor. | **Cleanest picture of the after-completion panel in the current UI, but community-sourced.** Section crop 40,655,500,140. Whole image is already the picker. |
| asana-community-2025-custom-every-2-weeks.png | 734x1430 | https://forum.asana.com/t/recurring-tasks-occuring-on-incorrect-days-in-recurrences/1093474 post 4, 2025-09-01 (forum leader) | "Repeats [Custom]", "Every [2] [Weeks]", "On these days" M..S with W T F checked. Calendar previews Sep 3-5. Footer "Clear". | Clean, Retina. Crop 30,850,660,380. |
| asana-community-2021-repeat-menu-with-custom.jpeg | 542x710 | https://forum.asana.com/t/longer-than-30-days-interval-for-periodically-repeating-tasks/14026 post 20, 2021-10-27 (ambassador) | Detail "Due date Friday" plus the repeat icon. Menu scrolled to show Weekly (checked), Monthly, Yearly, Periodically, **Custom**. The user added yellow highlighter marks. | Annotated. Shows that "Custom" is the last menu item. |
| asana-community-2022-repeat-menu-scrolled.jpeg | 344x224 | https://forum.asana.com/t/recurring-tasks-over-12-months-over-1-year/15510 post 19, 2022-02-11 (ambassador) | Menu scrolled: Weekly (checked), Monthly, Yearly, Periodically, Custom (hovered). | Small. Confirms the menu order. |
| asana-community-2021-custom-unit-menu.png | 588x551 | https://forum.asana.com/t/add-year-as-option-for-recurring-custom-due-dates/127909 post 1, 2021-07-07 | Detail "Nov 1" plus the repeat icon. Picker with repeat icon, "Repeats [Custom]", and an "x" (remove repeat) beside it. "Every [1] [Week]" with the unit menu open showing only "Week" and "Month". The user drew a red callout. | Annotated. |
| asana-community-2025-custom-every-3-months-dark.png | 389x182 | same thread 14026, post 47, 2025-11-03 (forum leader) | Dark mode: "Repeats [Custom]", "Every [3] [Months]", radio "On day [5]". | Fragment. |
| asana-community-2025-monthly-on-day.png | 620x1156 | https://forum.asana.com/t/recurent-tasks-via-api-monthly/1046032 post 1, 2025-04-03 | "Repeats [Monthly]", "On the [1st] [Wednesday]" (unselected, greyed), "On day [1]" selected, footer "Clear". | Clean, Retina. Crop 30,820,540,170. |
| asana-community-2026-weekly-dark.png | 628x1106 | https://forum.asana.com/t/creating-repeating-tasks-from-a-rule/1153999 post 1, 2026-08-31 | Most recent UI seen (Aug 2026, dark mode). Due field "Sep 8" plus the repeat icon and x. Picker "Repeats [Weekly]", "On these days" with T checked. Calendar previews Sep 15, 22, 29 and Oct 6. Footer "Clear". | Clean, dark. Crop 30,730,560,340. |
| asana-mobile-repeat-ios-community-2024.png | 640x1136 | https://forum.asana.com/t/ios-app-on-iphone-se-change-due-date-screen-issue/757578 post 3, 2024-03-28 | iOS app (iPhone SE, dark mode) due-date sheet: "Cancel", "Today" chips, March 2024 calendar, and a row with the repeat icon, a truncated "R..." label, and "4 days after completion". The bottom buttons are cut off by the bug the user was reporting. | **Only mobile recurrence image found (community).** Crop 40,995,580,90. |

### Recommended A/B comparison crops
- Desktop repeat menu (official): `asana-repeat-menu.png` crop 1080,700,580,340. Backup: `asana-video-2023-weekly-panel.png` crop 1068,715,440,260 for the Weekly panel without a menu.
- Desktop monthly panel (official): `asana-video-2023-monthly-on-the-last-friday.png` crop 1068,715,440,255.
- Desktop after-completion panel: there is no official current-UI image. Best available is the community image
  `community/asana-community-2022-periodically-days-after-completion.jpeg` crop 40,655,500,140. The official but
  2020-era alternative is `asana-guide-2020-periodically-panel.png` crop 850,555,265,70.
- Desktop custom panel: community only, `community/asana-community-2025-custom-every-2-weeks.png` crop 30,850,660,380.
- Mobile: community only, `community/asana-mobile-repeat-ios-community-2024.png` crop 40,995,580,90 (iOS, dark,
  truncated label). No Android image was found.

## Options and fields (current web UI, 2023-2026)

Entry point: open the task's Due date field. The date picker footer has a clock icon (times) and a repeat icon. The
repeat icon's tooltip reads "Set to repeat". The Help Center steps also say "Set to repeat". Clicking it turns the
icon into a highlighted (lavender) toggle and adds a "Repeats" row above the footer. The footer button reads "Clear"
or "Clear all" depending on version and state.

"Repeats" dropdown items, in order: "Daily", "Weekly", "Monthly", "Yearly", "Periodically", "Custom".
- Daily through Periodically are visible in official 2023 imagery. "Custom" is visible only in community
  screenshots, because the menu is clipped in the official frames. The Help Center text says tasks can repeat on a
  "weekly, monthly, yearly, periodical, or customized basis".
- Legacy menus (2015-2020, official) were "Never", "Daily", "Periodically", "Weekly", "Monthly", "Yearly". "Never"
  was the old way to remove a repeat.

Fields for each option:
- Daily: no sub-fields seen in any image. **Not confirmed.**
- Weekly: "On these days", seven checkboxes. Several can be ticked. Order is S..S or M..S depending on the user's
  week-start setting (both appear in official images). Official.
- Monthly: two radios. "On the" [1st, 2nd, 3rd, 4th, Last] [weekday], or "On day" [day number]. The "On day" menu
  also offers "Last", which appears in the official 2023 video. Official (2023 staff post and video). The Help Center
  tips about "Monthly ... every 3 months" come from the older UI, where Monthly had an interval. In current
  screenshots, "every N months" lives under Custom (community evidence).
- Yearly: no official image. A community post (2026) says it only repeats on a fixed date. **Not confirmed officially.**
- Periodically: current label "Days after completion" with a number dropdown (community 2022). The 2020 official
  label was "Interval [N] days after completion". The unit is days only. Community posts repeatedly report a maximum
  of 30 days. **The maximum is not confirmed officially.**
- Custom: "Every" [N] [unit]. Units seen: Weeks/Week and Months/Month only, with no Years (community 2021 and 2025).
  With weeks it shows "On these days" checkboxes. With months it shows an "On day [N]" radio. Asana staff (2026)
  said Custom does not support weekday-based n-monthly patterns (for example "every Monday every 3 months").
  https://forum.asana.com/t/set-tasks-to-repeat-on-a-certain-day-of-every-n-th-month-repeats-custom/547567 post 18.
- End conditions ("ends after N times" or "ends on date"): **none found in any source, official or community.**
- Remove: the Help Center calls it the "remove repeat" option. A 2021 community screenshot shows an "x" next to the
  Repeats dropdown. The older UI used "Never". Clearing the due date also stops recurrence (official).
- Preview: the calendar lightly highlights upcoming occurrence dates (for example the next Friday, or Jan 4-7 for a
  T-F rule). This is visible in the official 2021 GIF and 2023 video frames and in community screenshots.

## How a recurring task is marked

- Task detail (official): a repeat icon sits right after the due-date text, for example "Jul 3" plus the icon
  (2023 staff GIF and JPEG) or "6 - 31 Dec" plus the icon (Help Center GIF). The 2020 UI instead put a small repeat
  badge on the calendar icon's top-right corner.
- List row (official, low-res): the same icon follows the date in the Due date column ("Today" plus the icon before
  completion, "Jul 3" plus the icon after), per the 2023 staff GIF.
- Text such as "Repeats every..." does not appear in current rows or detail in any image I found. The only official
  summary text is the 2020 picker's "Repeats 7 days after completion" line. On iOS (community, 2024) the date sheet
  shows the repeat icon, a truncated "R...", and "4 days after completion".

## Mobile

No official iOS or Android recurrence screenshots were found. I checked the Help Center mobile article (its only
image is a My Tasks phone mock with no recurrence), the official mobile app video (https://www.youtube.com/watch?v=lwP70zhlcPU,
no recurrence UI), and all titles and subtitles of about 88 official Asana YouTube videos. The only mobile image is
the community iOS screenshot above.

## Documented behaviour

HC = https://help.asana.com/s/article/scheduling-tasks-using-start-dates-due-dates-and-times?language=en_US
GUIDE = legacy asana.com/guide/help/tasks/fields (Wayback 2019-09-17, 2021-08-06, 2023-08-04)
"Staff" means a forum post by an account with the Asana_Staff_Badge.

1. **Completing a recurring task creates a new task.** The completed instance stays completed, and a copy is made
   for the next occurrence. The recurrence setting determines the copy's new due date. Source: HC. GUIDE (2019/2021)
   says all information is duplicated into a new task with a new due date. Staff said the same:
   https://forum.asana.com/t/recurring-task/84459 post 2 (2020). The official 2023 staff GIF shows it happening: the
   completed task leaves the incomplete-filtered list and a new row with the next date appears in the same section.
2. **Only the next occurrence exists.** Future occurrences are not shown on calendars. Source: HC. Staff also
   confirmed it (https://forum.asana.com/t/visibility-of-all-recurring-tasks/1189 post 2, 2017).
3. **What carries over:** every field except comments, including subtasks (HC).
   - Subtasks are copied with their completed or incomplete state. Staff:
     https://forum.asana.com/t/recurring-subtasks-still-show-as-a-task-to-complete-even-when-deleted/741992 post 4 (2024).
   - A 2019 staff post
     (https://forum.asana.com/t/tasks-duplicate-too-often-after-completing-tasks-that-are-set-to-repeat/54157 post 2)
     can be read the other way. **The 2024 statement is newer.**
   - Assignee carries over (visible in the official 2023 GIF).
   - Custom-field values carry over. Staff: https://forum.asana.com/t/recurring-task/84459 post 4 (2020).
   - Start date is regenerated if the original had one. Official release notes:
     https://forum.asana.com/t/asana-release-notes-august-2018/30560.
   - The new instance is automatically made dependent on the completed one. Staff:
     https://forum.asana.com/t/creating-recurring-timelines/115962 post 2 (2021).
   - Attachments are reported to carry over by community posts only (for example
     https://forum.asana.com/t/allow-for-recurring-tasks-in-task-templates/172607). **Not officially confirmed**,
     although it follows from "all fields".
4. **Do not make subtasks of a repeating parent repeat too.** They duplicate exponentially. Source: HC.
5. **"Periodically" (after completion):** the next due date is the completion date plus N days. The previous due date
   does not matter. Sources: HC ("Due dates for periodically recurring tasks are determined by the date the task was
   last completed"), GUIDE tip, and an Asana community-team member's confirmation in
   https://forum.asana.com/t/repeat-x-days-after-completion/82189 posts 4 and 7 (2020). That account has no staff
   badge today but said it checked internally. Completing early therefore pulls the next task earlier, and completing
   late pushes it later. **A 30-day maximum is reported by community posts only**
   (https://forum.asana.com/t/longer-than-30-days-interval-for-periodically-repeating-tasks/14026).
6. **Calendar-based options (Weekly, Monthly, Yearly, Custom)** compute the next date from the rule, not from the
   completion date. The official 2023 GIF shows a task due Jun 26 set to "On the 1st Monday" producing Jul 3.
   **What happens when you complete a weekly or monthly task early or late is not officially documented.**
7. **Changing the date of the current instance:**
   - Staff (2020) confirmed that a yearly task's next date is anchored to the due date in place when the repeat was
     set. Later edits to the current instance's due date do not move it, and to re-anchor you remove and re-add the
     repeat. Source: https://forum.asana.com/t/display-reference-to-next-due-date-on-yearly-repeating-tasks/103949
     post 12.
   - **Conflict:** a 2026 community post says a yearly task's next date comes from the current due date at
     completion, so rescheduling drifts the series
     (https://forum.asana.com/t/more-options-for-yearly-recurring-task-including-fixed-date-anchor/1144383 posts 3
     and 5). Treat the yearly and monthly anchor rule as **unconfirmed for today's UI**.
8. **Stopping:** use the "remove repeat" option or remove the due date. Source: HC. The legacy UI used Repeat set to
   "Never" (GUIDE 2019/2021). Staff advice: remove the due date first, then complete or delete, so that no new copy is
   made. Source: https://forum.asana.com/t/removal-of-future-task-at-once/115863 posts 2 and 4 (2021).
9. **Completed instances stay** in the project's completed tasks and are not auto-deleted. Staff:
   https://forum.asana.com/t/recurring-tasks-that-have-been-completed-are-building-up-its-getting-cluttered/116627
   post 2 (2021).
10. **Uncompleting a completed instance:** **not documented in any source I found**, official or community.
11. **Deleting the current instance:** **not documented.** The only related guidance is the staff advice in item 8.
12. **Time of day (due times, start times) on recurring tasks:** **not documented.** The only official item is the
    2018 note about start dates (item 3). A 2024 community report of due times appearing on recurring tasks got a
    staff reply that no widespread bug had been detected
    (https://forum.asana.com/t/due-times-randomly-assigned-to-recurring-tasks/935837). Nothing states whether due
    times carry over.
13. **Interval limits:** tasks cannot repeat at intervals longer than one year (no "every 2 years"). Staff:
    https://forum.asana.com/t/recurring-tasks-over-12-months-over-1-year/15510 post 6 (2020). Custom units are only
    weeks and months (community, thread 127909).
14. **Rules cannot set a repeat.** A rule's "Create task" action only supports relative due dates. Staff suggested
    using a "task marked complete, then create task due N days later" rule instead. Source:
    https://forum.asana.com/t/creating-repeating-tasks-from-a-rule/1153999 post 2 (2026-09-01).
15. **My Tasks section of the new instance:**
    - Since about Aug 2026 the new instance stays in the same My Tasks section as the completed one, instead of going
      to "Recently assigned". This rests only on a user quoting an Asana support reply
      (https://forum.asana.com/t/recurring-task-not-appearing-in-recently-assigned-after-completion/1152106 post 13).
      Staff only acknowledged the escalation (post 10). **Unconfirmed.**
16. **API:** recurrence is not in Asana's official OpenAPI spec (github.com/Asana/openapi). Community posts show an
    undocumented `recurrence` field, for example `{"type":"weekly","data":{"days_of_week":[1],"frequency":2}}`
    (https://forum.asana.com/t/recurring-due-dates-via-api/122145 post 5). **Unofficial.**
17. Availability: the HC article's plan box lists Personal, Starter, Advanced, Enterprise, Enterprise+ and the legacy
    tiers for the article as a whole. The article singles out start dates and times as paid-tier features. It does
    not restrict recurrence.

## URLs tried that failed or had nothing useful

- WebFetch of the HC article: it is a JavaScript-rendered Salesforce page and came back empty. Rendering it with
  Playwright worked.
- https://help.asana.com/s/global-search/recurring%20task : the search page returned "Error".
- https://help.asana.com/s/article/getting-started-with-asana-s-mobile-app?language=en_US : no recurrence content.
- https://help.asana.com/s/article/task-fields?language=en_US , /my-tasks , /rules-in-my-tasks , /rules : no
  mention of recurrence.
- https://asana.com/guide/help/tasks/fields : 301 redirect to the HC task-fields article, so the legacy content is
  only on Wayback.
- https://web.archive.org/web/20240523122400/https://help.asana.com/hc/en-us/articles/23535997245339 : the 2024
  Zendesk-era copy has the same text and GIF as today, so nothing new.
- https://blog.asana.com/2012/01/create-repeating-tasks-for-your-recurring-to-dos/ : redirects to the Inside Asana
  index. The post is gone.
- https://asana.com/apps/repeating-tasks : a third-party app listing (Project Procs) on asana.com. Its only relevant
  line says native recurrence creates the next task only after the previous one is completed.
- Official Asana YouTube channel: I scanned about 400 video titles plus about 90 shorts and pulled English subtitles
  for about 88 candidates. Only fNref5JbQ40 (Sept 2023) shows recurrence UI. The Feb 2026 video mentions recurring
  rule triggers, not task repeat. lwP70zhlcPU (mobile app) has no recurrence UI.
- https://raw.githubusercontent.com/Asana/openapi/master/defs/asana_oas.yaml : no recurrence fields.
- The mobile help article image
  (https://assets.asana.biz/transform/07d17c5b-07e9-408b-9291-51e30a66fdfd/productui-helpcenter-asana_basics-getting-started-with-asana-s-mobile-app-001-en-us.png)
  is a My Tasks mock with no recurrence, so I did not save it.

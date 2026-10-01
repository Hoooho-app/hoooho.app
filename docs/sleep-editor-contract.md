# Sleep editor contract

Manual recording and a single automatic instance share `SleepEditor`. Its twelve-hour clock is explanatory; persistence remains ISO instants with minute precision. New records preserve the recording timezone in optional `sleep.timeZone`; old records fall back to the current recording context. Routine responses supply their calculation timezone (the request timezone, Asia/Shanghai by default). Editors use that stored timezone, independently of the device timezone. Clock labels are 12:00, 03:00, 06:00, 09:00; active endpoint AM/PM is independent of day/night colors.

`sleepEditorTime.ts` centralizes day [06:00,18:00), night otherwise, and endpoint palettes. Green arcs represent true elapsed duration; full turns are retained. Purple tags compare complete instants with the opening baseline.

The existing routine action endpoint accepts optional `sleepStatus`, `quality`, `observations`, `otherNote`. New editor calls always send status. Legacy calls retain explicit completed-confirm semantics. Ongoing metadata can now carry an expected wake instant and supplements; older ongoing records without a wake instant remain valid. Positive multi-day durations are supported without truncation. Occurrence remains an already-happened instant: ongoing writes use sleepAt, not future expected wakeAt.

Routine day responses include the saved `sleep` metadata. An existing instance is updated through the owned-record service, not recreated. The override identity remains its original day/member/item even when an endpoint date changes. No template fields are edited. Completion requires an explicit actual-wake state or the existing end-sleep flow, never a comparison with the current clock. Save failures preserve the editor and request identity for retries.

Verification: `npm run test:client`, server journal/routine/record tests, build, and `npx playwright test --config tests/sleep-editor/playwright.config.ts`. Browser tests deliberately use America/New_York to detect device-timezone drift. Screenshots use isolated synthetic records, never production patient data.

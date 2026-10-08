import { profileSourceId } from "./source-identity.mjs";
import { questionCandidates, sourceChronology } from "./reading-context.mjs";
const uniq = (xs) => [...new Set(xs.filter(Boolean))];
const clean = (value) => (typeof value === "string" ? value.trim() : "");
const list = (value) =>
  Array.isArray(value)
    ? value.filter((v) => typeof v === "string" && v.trim())
    : [];
const day = (at, zone) =>
  at && Number.isFinite(Date.parse(at))
    ? new Intl.DateTimeFormat("sv-SE", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(at))
    : null;
const brief = (xs) => uniq(xs).slice(0, 8).join("、");
// Presentation of already saved facts. No free-form parser, diagnosis or image inference.
export function readingProjection(report, input) {
  const sources = new Map(report.sources.map((s) => [s.id, s]));
  const records = new Map(input.records.map((r) => [`record:${r.id}`, r]));
  const focused = report.focusSourceIds
    .map((id) => sources.get(id))
    .filter(Boolean)
    .sort(sourceChronology);
  const latest = focused[0],
    symptom = records.get(latest?.id)?.journal?.symptom,
    notes = report.caseDetails ?? {};
  const onset = {
    just_now: "刚刚",
    today: "当天",
    yesterday: "前一天",
    two_three_days: "两三天前",
    within_week: "一周内",
    earlier: "更早",
  }[symptom?.onsetApprox];
  const change = {
    improving: "家长记录有所减轻",
    more_noticeable: "家长记录更明显",
    same: "家长记录变化不大",
    unclear: "变化尚不确定",
    returned: "家长记录再次出现",
    recurrent: "家长记录反复出现",
  }[symptom?.trend];
  const growth = report.chapters.find((c) => c.id === "growth");
  const measurement = (unit) =>
    growth.blocks
      .filter((b) => b.unit === unit)
      .flatMap((b) => b.points ?? [])
      .filter((p) => p.value > 0 && p.detail !== "待核对")
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0] ?? null;
  // Seven days before the latest relevant observation, through two days after it.
  // These are contextual records, not asserted medical links. Unknown time stays excluded
  // unless the source has an explicit relationship to the focus.
  const anchor = Date.parse(latest?.occurredAt ?? report.dataAsOf);
  const from = anchor - 7 * 86400000,
    to = Math.min(anchor + 2 * 86400000, Date.parse(report.dataAsOf));
  const refs = new Set(report.focusSourceIds);
  const linked = (s) =>
    refs.has(s.id) ||
    s.relatedSourceIds?.some((id) => refs.has(id)) ||
    focused.some((f) => f.relatedSourceIds?.includes(s.id));
  const context = report.sources
    .filter(
      (s) =>
        s.recordId &&
        s.category !== "sources" &&
        s.category !== "attachment" &&
        (linked(s) ||
          ((focused.length || report.focus.mode === "custom") &&
            Date.parse(s.occurredAt) >= from &&
            Date.parse(s.occurredAt) <= to)),
    )
    .sort(sourceChronology);
  const courseGroups = [];
  const add = (id, title, lines, ss, extra = {}) => {
    const values = lines.filter(Boolean);
    if (values.length)
      courseGroups.push({
        id,
        title,
        lines: values,
        sourceIds: uniq(ss.map((s) => (typeof s === "string" ? s : s.id))),
        ...extra,
      });
  };
  if (focused.length)
    add(
      "symptom",
      "相关症状经过",
      [
        focused.length === 1
          ? latest.narrative || latest.title
          : `共 ${focused.length} 条同类相关观察；最近记录：${latest.narrative || latest.title}`,
        ...(focused.length > 1
          ? [`此前记录：${focused.at(-1).narrative || focused.at(-1).title}`]
          : []),
      ],
      focused,
      {
        events: focused.map((s) => ({
          title: s.narrative || s.title,
          at: s.occurredAt,
          sourceIds: [s.id],
        })),
      },
    );
  const categories = (key) =>
    context.filter((s) => records.get(s.id)?.journal?.[key]);
  const coverage = (ss) => {
    const dates = uniq(ss.map((s) => day(s.occurredAt, input.timezone))).sort();
    return dates.length
      ? `${dates[0]}${dates.length > 1 ? ` 至 ${dates.at(-1)}` : ""}，${ss.length} 条已保存记录`
      : `${ss.length} 条已保存记录`;
  };
  const diets = categories("diet").filter(
    (s) => records.get(s.id).journal.diet.kind !== "supplement",
  );
  if (diets.length) {
    const ds = diets.map((s) => records.get(s.id).journal.diet),
      first = brief(ds.flatMap((d) => list(d.firstTryFoods))),
      foods = brief(ds.flatMap((d) => [...list(d.foods), clean(d.name)])),
      appetite = brief(ds.map((d) => clean(d.appetite))),
      reactions = brief(ds.flatMap((d) => list(d.reactions)));
    add(
      "diet",
      "喂养与饮食",
      [
        coverage(diets),
        foods && `已记录食物：${foods}`,
        first && `首次尝试：${first}`,
        appetite && `食欲记录：${appetite}`,
        reactions && `进食后观察：${reactions}`,
      ],
      diets,
    );
  }
  const sleeps = categories("sleep");
  if (sleeps.length) {
    const ds = sleeps.map((s) => records.get(s.id).journal.sleep),
      durations = ds
        .filter(
          (d) => d.status !== "ongoing" && Number.isFinite(d.durationMinutes),
        )
        .map((d) => d.durationMinutes),
      quality = brief(ds.map((d) => clean(d.quality))),
      observations = brief(
        ds.flatMap((d) => [...list(d.observations), clean(d.otherNote)]),
      ),
      short = sleeps.filter((s) => {
        const d = records.get(s.id).journal.sleep;
        return (
          d.kind === "night" &&
          d.status !== "ongoing" &&
          d.durationMinutes > 0 &&
          d.durationMinutes <= 60
        );
      });
    add(
      "sleep",
      "睡眠",
      [
        coverage(sleeps),
        durations.length &&
          `已结束的单段睡眠 ${Math.min(...durations)}–${Math.max(...durations)} 分钟；不是每日总睡眠`,
        quality && `睡眠状态：${quality}`,
        observations && `观察：${observations}`,
        short.length &&
          `有 ${short.length} 段夜间睡眠不超过 60 分钟，可结合是否补录或中断核对`,
      ],
      sleeps,
    );
  }
  const bowels = categories("bowel");
  if (bowels.length) {
    const ds = bowels.map((s) => records.get(s.id).journal.bowel),
      shapes = brief(ds.flatMap((d) => list(d.shapes))),
      colors = brief(ds.map((d) => clean(d.color))),
      observations = brief(
        ds.flatMap((d) => [...list(d.observations), clean(d.process)]),
      ),
      blood = brief(
        ds.map(
          (d) =>
            ({
              "none-seen": "明确记录未见血",
              "possibly-seen": "可能见血，待确认",
              "small-amount": "记录少量血",
              "large-amount": "记录较多血",
            })[d.bloodObservation],
        ),
      ),
      black = ds.some((d) => /黑/.test(d.color ?? ""));
    add(
      "bowel",
      "排便观察",
      [
        coverage(bowels),
        shapes && `形态：${shapes}`,
        colors && `颜色：${colors}`,
        observations && `过程与表现：${observations}`,
        blood,
        black && "已记录黑色便，请带原始观察资料咨询，颜色本身不能确认原因",
      ],
      bowels,
    );
  }
  const temperature = report.chapters
    .find((c) => c.id === "temperature")
    .blocks.flatMap((b) => {
      const points = (b.points ?? []).filter(
        (p) =>
          linked(sources.get(p.sourceId) ?? {}) ||
          (Date.parse(p.at) >= from && Date.parse(p.at) <= to),
      );
      return points.length
        ? [{ ...b, points, sourceIds: uniq(points.map((p) => p.sourceId)) }]
        : [];
    });
  if (temperature.length)
    add(
      "temperature",
      "体温",
      temperature.map(
        (b) =>
          `${b.title}：${b.points.length} 次测量，${Math.min(...b.points.map((p) => p.value))}–${Math.max(...b.points.map((p) => p.value))} ${b.unit}；最近 ${b.points.at(-1).value} ${b.unit}`,
      ),
      temperature.flatMap((b) => b.sourceIds),
      { blocks: temperature },
    );
  const meds = context.filter(
      (s) => s.category === "medication" && s.id.startsWith("record:"),
    ),
    supplements = categories("diet").filter(
      (s) => records.get(s.id).journal.diet.kind === "supplement",
    );
  const medicationLines = [];
  const groups = new Map();
  for (const s of meds) {
    const m = records.get(s.id)?.journal?.medication;
    const items = m?.medications?.length ? m.medications : m ? [m] : [];
    for (const item of items) {
      const name = clean(item.medicationName);
      if (!name) continue;
      const values = groups.get(name) ?? [];
      values.push({ s, item });
      groups.set(name, values);
    }
  }
  for (const [name, values] of groups) {
    const days = uniq(
        values.map((v) => day(v.s.occurredAt, input.timezone)),
      ).sort(),
      doses = brief(
        values.map((v) =>
          v.item.amountValue != null
            ? `${v.item.amountValue} ${v.item.amountUnit || "单位未填"}`
            : "",
        ),
      );
    medicationLines.push(
      `${name}：${doses ? `记录用量 ${doses}；` : ""}${values.length} 次使用记录${days.length ? `，首次记录 ${days[0]}，覆盖 ${days.length} 个记录日` : ""}；记录空白不代表停用`,
    );
  }

  const plans = (
    focused.length || report.focus.mode === "custom"
      ? (report.medicationReminders ?? [])
      : []
  ).filter(
    (r) =>
      (Date.parse(r.plan.startDate) <= to &&
        (!r.plan.endDate || Date.parse(r.plan.endDate) + 86400000 >= from)) ||
      r.occurrences.some(
        (o) =>
          o.completed &&
          (linked(sources.get(o.sourceId) ?? {}) ||
            (Date.parse(sources.get(o.sourceId)?.occurredAt) >= from &&
              Date.parse(sources.get(o.sourceId)?.occurredAt) <= to)),
      ),
  );

  const completionRecords = new Set(
    input.reminders
      .filter((r) => plans.some((p) => p.id === r.id))
      .flatMap((r) =>
        r.occurrences
          .filter((o) => o.completed)
          .map((o) => o.completion?.recordId),
      )
      .filter(Boolean),
  );
  const remaining = new Map();
  for (const s of meds.filter(
    (s) =>
      !records.get(s.id)?.journal?.medication &&
      !completionRecords.has(s.recordId),
  )) {
    const value = s.narrative || s.title;
    remaining.set(value, (remaining.get(value) || 0) + 1);
  }
  for (const [value, count] of remaining)
    medicationLines.push(
      `${value}${count > 1 ? `（${count} 条使用记录）` : ""}`,
    );
  const supplementGroups = new Map();
  for (const s of supplements) {
    const d = records.get(s.id).journal.diet,
      name = brief([...list(d.supplementNames), clean(d.name)]) || "补充剂";
    supplementGroups.set(name, [
      ...(supplementGroups.get(name) ?? []),
      { s, d },
    ]);
  }
  for (const [name, values] of supplementGroups) {
    const dates = uniq(
        values.map((v) => day(v.s.occurredAt, input.timezone)),
      ).sort(),
      amount = brief(
        values.map((v) =>
          v.d.supplementAmount
            ? `${v.d.supplementAmount} ${v.d.supplementUnit || ""}`
            : "",
        ),
      );
    medicationLines.push(
      `${name}：${amount ? `记录用量 ${amount}` : "用量未填写"}；${values.length} 条使用记录${dates.length ? `，首次记录 ${dates[0]}，覆盖 ${dates.length} 个记录日` : "，发生时间未填写"}；未记录的用量与频率未知`,
    );
  }

  for (const r of plans) {
    const p = r.plan,
      confirmed = r.occurrences.filter((o) => o.completed),
      frequency =
        p.mode === "daily" && p.times.length
          ? `每日计划 ${p.times.length} 次`
          : p.intervalHours
            ? `计划每 ${p.intervalHours} 小时`
            : "按已保存计划";
    medicationLines.push(
      `${p.medicationName}：计划用量 ${p.amount ?? "未填写"} ${p.unit ?? ""}，${frequency}；计划 ${p.startDate} 至 ${p.endDate || "结束日期未填"}${r.totalDays ? `（${r.totalDays} 天）` : ""}；${confirmed.length} 次已确认使用，其他节点使用情况未知`,
    );
  }
  add("medication", "用药与补充剂", medicationLines, [
    ...meds,
    ...supplements,
    ...plans.flatMap((r) => [
      ...r.sourceIds,
      ...r.occurrences.filter((o) => o.completed).map((o) => o.sourceId),
    ]),
  ]);
  const visits = context.filter((s) => s.category === "visits" && linked(s));
  add(
    "visits",
    "就诊与检查",
    visits.map((s) => s.narrative || s.title),
    visits,
  );
  const care = context.filter(
    (s) => linked(s) && records.get(s.id)?.journal?.care,
  );
  add(
    "care",
    "已做处理",
    care.map((s) => s.narrative || s.title),
    care,
  );
  const archive = [];
  const archiveTypes = [
    ["allergy", "过敏史"],
    ["chronic", "慢性病史"],
    ["family-history", "家族史"],
    ["surgery", "手术史"],
    ["vaccination", "疫苗接种记录"],
  ];
  for (const [id, title] of archiveTypes) {
    const items = [];
    for (const a of input.profiles.filter((a) => a.sectionId === id))
      for (const row of a.records ?? [])
        for (const item of row._allergyArchive?.items ?? row.items ?? [row]) {
          if (
            item.profileListDeletedAt ||
            (item.memberId && item.memberId !== input.member.id)
          )
            continue;
          const sourceId = profileSourceId(id, item);
          if (!sources.has(sourceId)) continue;
          if (id === "allergy") {
            const state = item.currentStatus ?? item.certainty,
              label = ["confirmed", "已明确", "医生明确"].includes(state)
                ? "已明确"
                : ["suspected", "investigating"].includes(state)
                  ? "疑似"
                  : null;
            if (
              label &&
              clean(item.name) &&
              item.name !== "尚未明确" &&
              item.category !== "unknown"
            )
              items.push({
                title: item.name,
                detail: label,
                sourceIds: [sourceId],
              });
            continue;
          }
          const name =
            id === "family-history"
              ? clean(item.customRelationship) || clean(item.relationship)
              : clean(item.name) || clean(item.vaccineName);
          const details =
            id === "family-history"
              ? brief(
                  (item.healthIssues ?? []).map((h) =>
                    [clean(h.name), clean(h.certainty), clean(h.onset)]
                      .filter(Boolean)
                      .join(" · "),
                  ),
                ) || clean(item.disease)
              : id === "chronic"
                ? brief([
                    ...list(item.manifestations),
                    clean(item.frequency),
                    clean(item.handling),
                    clean(item.impact),
                    clean(item.management),
                    clean(item.status),
                  ])
                : id === "surgery"
                  ? brief([
                      clean(item.date),
                      clean(item.hospital),
                      ...list(item.postoperativeStatusTags),
                    ])
                  : brief([
                      clean(item.administeredOn) || clean(item.date),
                      clean(item.doseSequence) || clean(item.dose),
                    ]);
          if (name || details)
            items.push({
              title: name || title,
              detail: details,
              sourceIds: [sourceId],
            });
        }
    if (id === "vaccination")
      for (const s of report.sources.filter(
        (s) => records.get(s.id)?.journal?.vaccination,
      ))
        for (const item of records.get(s.id).journal.vaccination.items ?? [])
          if (
            !item.profileListDeletedAt &&
            item.vaccineName &&
            !items.some(
              (i) =>
                i.title === item.vaccineName &&
                i.detail.includes(item.administeredOn || "__missing__"),
            )
          )
            items.push({
              title: item.vaccineName,
              detail: item.administeredOn || "接种日期未填写",
              sourceIds: [s.id],
            });
    if (items.length) archive.push({ id, title, items });
  }
  const allergy =
    archive
      .find((g) => g.id === "allergy")
      ?.items.filter((i) => i.detail === "已明确") ?? [];
  const conflicts = allergy.filter((i) =>
    diets.some((s) => {
      const d = records.get(s.id).journal.diet;
      return [
        ...list(d.foods),
        ...list(d.firstTryFoods),
        clean(d.name),
      ].includes(i.title);
    }),
  );
  if (conflicts.length) {
    const group = courseGroups.find((g) => g.id === "diet");
    group.lines.push(
      `需核对：饮食中记录了档案已明确的过敏项 ${brief(conflicts.map((i) => i.title))}；以原档案与医务人员意见为准`,
    );
    group.sourceIds = uniq([
      ...group.sourceIds,
      ...conflicts.flatMap((i) => i.sourceIds),
    ]);
  }
  const reading = {
    description: notes.description || latest?.narrative || report.complaint,
    onset:
      notes.onset ||
      records.get(latest?.id)?.journal?.timeLabel ||
      (onset ? `记录中填写${onset}开始（相对于该记录时间）` : ""),
    change: notes.change || change || "",
    other: notes.other || list(symptom?.associatedSymptoms).join("、"),
    keywords: uniq([
      ...(latest?.locations ?? []),
      ...list(symptom?.keywords),
      ...list(symptom?.descriptors),
      ...(change ? [change] : []),
    ]).slice(0, 8),
    sourceIds: latest ? [latest.id] : [],
    courseSourceIds: uniq(courseGroups.flatMap((g) => g.sourceIds)),
    courseGroups,
    archive,
    contextRange: {
      from: day(new Date(from).toISOString(), input.timezone),
      to: day(new Date(to).toISOString(), input.timezone),
    },
    height: measurement("cm"),
    weight: measurement("kg"),
  };
  reading.questionCandidates = questionCandidates(report.complaint, reading);
  return reading;
}

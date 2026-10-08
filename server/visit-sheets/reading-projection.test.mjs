import assert from "node:assert/strict";
import test from "node:test";
import { buildVisitSheet } from "./report-model.mjs";
import { visitFixture } from "./fixtures.mjs";
import { sameReadingTopic } from "./reading-context.mjs";
const now = new Date("2026-09-26T00:00:00Z");
const record = (id, content, journal, occurredAt = "2026-09-19T09:00:00Z") => ({
  id,
  eventId: "event-a",
  type: "note",
  content,
  occurredAt,
  createdAt: occurredAt,
  journal,
});
test("自动关联颈部红点而不纳入同时发生的臀部红疹和黑便问题", () => {
  const f = visitFixture();
  f.records = [
    record("neck", "脖子有红点", {
      categories: ["symptom"],
      symptom: {
        narrative: "脖子有红点",
        symptomCategory: "skin",
        locations: [],
        descriptors: ["红点"],
      },
    }),
    record("butt", "屁股有红疹", {
      categories: ["symptom"],
      symptom: {
        narrative: "屁股有红疹",
        symptomCategory: "skin",
        locations: [],
      },
    }),
  ];
  const r = buildVisitSheet(
    f,
    { focus: { mode: "custom", text: "颈部红点" } },
    now,
  );
  assert.deepEqual(r.focusSourceIds, ["record:neck"]);
  assert.equal(r.reading.description, "脖子有红点");
  assert.equal(r.question.split("\n").length, 3);
  assert.equal(r.reading.questionCandidates.length, 10);
  assert.doesNotMatch(r.question, /黑便|屁股/);
  assert.ok(r.reading.courseGroups.find((g) => g.id === "symptom"));
  assert.equal(sameReadingTopic("脖子红点", "屁股红点"), false);
});
test("只有已记录的日常摘要与异常，不补正常；用药计划不冒充实际使用", () => {
  const f = visitFixture();
  f.records.push(
    record("diet", "首次吃鸡蛋", {
      categories: ["diet"],
      diet: {
        kind: "meal",
        foods: ["鸡蛋"],
        firstTryFoods: ["鸡蛋"],
        appetite: "比平时少",
      },
    }),
    record("sleep", "夜间睡眠", {
      categories: ["sleep"],
      sleep: {
        kind: "night",
        durationMinutes: 35,
        status: "completed",
        quality: "频繁醒来",
      },
    }),
    record("bowel", "排便记录", {
      categories: ["elimination"],
      bowel: {
        shapes: ["干硬"],
        color: "黑色",
        bloodObservation: "possibly-seen",
        observations: [],
      },
    }),
    record("supplement", "补钙", {
      categories: ["diet"],
      diet: {
        kind: "supplement",
        supplementNames: ["钙"],
        supplementAmount: "1",
        supplementUnit: "袋",
      },
    }),
  );
  f.profiles = [
    {
      sectionId: "allergy",
      records: [
        {
          id: "egg",
          name: "鸡蛋",
          category: "food",
          currentStatus: "confirmed",
        },
        {
          id: "milk",
          name: "牛奶",
          category: "food",
          currentStatus: "suspected",
        },
        { name: "小麦", category: "food", currentStatus: "excluded" },
      ],
    },
  ];
  const r = buildVisitSheet(f, {}, now),
    groups = r.reading.courseGroups,
    text = groups.flatMap((g) => g.lines).join("\n");
  for (const id of ["diet", "sleep", "bowel", "medication"])
    assert.ok(groups.some((g) => g.id === id));
  assert.match(text, /首次尝试：鸡蛋/);
  assert.match(text, /需核对.*鸡蛋/);
  assert.match(text, /35–35 分钟/);
  assert.match(text, /可能见血/);
  assert.match(text, /黑色便/);
  assert.match(text, /其他节点使用情况未知/);
  assert.doesNotMatch(text, /钙导致|饮食正常|睡眠正常|排便正常|确诊/);
  assert.deepEqual(
    r.reading.archive[0].items.map((i) => [i.title, i.detail]),
    [
      ["鸡蛋", "已明确"],
      ["牛奶", "疑似"],
    ],
  );
  assert.ok(
    groups.every((g) =>
      g.sourceIds.every((id) => r.sources.some((s) => s.id === id)),
    ),
  );
});
test("稀疏数据不造分类，手工问题与情况补充跨重新整理保留", () => {
  const f = visitFixture();
  f.records = [];
  f.reminders = [];
  f.tasks = [];
  f.growth = [];
  f.profiles = [];
  const r = buildVisitSheet(
    f,
    {
      questionEdited: true,
      question: "我的人工问题",
      caseDetails: { description: "家长自己的描述" },
    },
    now,
  );
  assert.deepEqual(r.reading.courseGroups, []);
  assert.deepEqual(r.reading.archive, []);
  assert.equal(r.question, "我的人工问题");
  assert.equal(r.reading.description, "家长自己的描述");
});
test("档案顺序、删除和成员边界；一条体温不伪造趋势", () => {
  const f = visitFixture();
  f.profiles = [
    {
      sectionId: "surgery",
      records: [{ name: "阑尾手术", date: "2024-01-01" }],
    },
    {
      sectionId: "chronic",
      records: [
        { name: "长期鼻炎", frequency: "每周" },
        { name: "已删除", profileListDeletedAt: "2026-01-01" },
        { name: "其他孩子", memberId: "foreign" },
      ],
    },
    {
      sectionId: "allergy",
      records: [{ name: "鸡蛋", currentStatus: "suspected" }],
    },
    {
      sectionId: "family-history",
      records: [
        {
          relationship: "母亲",
          healthIssues: [{ name: "鼻炎", certainty: "不确定" }],
        },
      ],
    },
    {
      sectionId: "vaccination",
      records: [{ name: "示例疫苗", date: "2024-02-01", dose: "第一剂" }],
    },
  ];
  const r = buildVisitSheet(f, {}, now);
  assert.deepEqual(
    r.reading.archive.map((g) => g.title),
    ["过敏史", "慢性病史", "家族史", "手术史", "疫苗接种记录"],
  );
  assert.doesNotMatch(JSON.stringify(r.reading.archive), /已删除|其他孩子/);
  const temperature = r.reading.courseGroups.find(
    (g) => g.id === "temperature",
  );
  assert.ok(
    temperature.blocks.every((b) =>
      b.points.every((p) => r.sources.some((s) => s.id === p.sourceId)),
    ),
  );
});

test("执行确认与其原始服用记录不重复堆叠，补充剂按记录摘要", () => {
  const f = visitFixture();
  for (let i = 0; i < 3; i++)
    f.records.push(
      record(`supp${i}`, "补钙", {
        categories: ["diet"],
        diet: {
          kind: "supplement",
          supplementNames: ["钙"],
          supplementAmount: "1",
          supplementUnit: "袋",
        },
      }),
    );
  const r = buildVisitSheet(f, {}, now),
    lines = r.reading.courseGroups.find((g) => g.id === "medication").lines;
  assert.equal(
    lines.filter((line) => line.startsWith("确认服用示例药物")).length,
    0,
  );
  assert.equal(lines.filter((line) => line.startsWith("钙：")).length, 1);
  assert.match(
    lines.find((line) => line.startsWith("钙：")),
    /3 条使用记录/,
  );
});

test('计划区间与实际确认日期不同，仍保留主诉时段的真实使用',()=>{
 const f=visitFixture();f.reminders[0].plan.startDate='2026-09-26';f.reminders[0].plan.endDate='2026-10-20'
 const r=buildVisitSheet(f,{},now),group=r.reading.courseGroups.find(g=>g.id==='medication')
 assert.ok(group);assert.match(group.lines.join(' '),/5 次已确认使用/);assert.ok(group.sourceIds.includes('dose:o0'))
 f.reminders[0].occurrences.forEach(o=>{o.completed=false;delete o.completion})
 const fallback=buildVisitSheet(f,{},now).reading.courseGroups.find(g=>g.id==='medication')
 assert.match(fallback.lines.join(' '),/5 条使用记录/)
})

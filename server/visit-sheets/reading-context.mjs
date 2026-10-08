// Conservative topic matching for saved sources. A match is a reading aid,
// never evidence of diagnosis or causation. Body regions constrain skin topics.
const regions = [
  /脖子|颈/,
  /肘窝|肘/,
  /前臂/,
  /上臂/,
  /屁股|臀|肛周|尿布区/,
  /面部|脸|面颊/,
  /手掌|手背|手指|手部/,
  /脚|足/,
  /腹部|肚子/,
  /背部/,
];
const topics = [
  /皮疹|红疹|红点|发红|红斑|皮肤|湿疹|瘙痒|痒/,
  /便秘|排便困难|大便干|硬便/,
  /腹泻|稀便|拉肚子/,
  /咳嗽|喘|呼吸/,
  /发热|发烧|体温/,
  /呕吐|吐奶/,
  /耳痛|耳朵/,
  /黑便|便血|血便/,
];
const plain = (value) =>
  String(value ?? "")
    .replace(/\s+/g, "")
    .toLowerCase();
export function sameReadingTopic(a, b) {
  const left = plain(a),
    right = plain(b);
  if (!left || !right) return false;
  const body = regions.filter((re) => re.test(left));
  const otherBody = regions.filter((re) => re.test(right));
  if (body.length && otherBody.length && !body.some((re) => re.test(right)))
    return false;
  if (left.length >= 2 && (right.includes(left) || left.includes(right)))
    return true;
  const topic = topics.filter((re) => re.test(left));
  return (
    topic.some((re) => re.test(right)) &&
    (!body.length || body.some((re) => re.test(right)))
  );
}
export const sourceChronology = (a, b) =>
  (Date.parse(b.occurredAt) || 0) - (Date.parse(a.occurredAt) || 0) ||
  (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0) ||
  String(b.id).localeCompare(String(a.id));
export function questionCandidates(complaint, reading) {
  const subject = String(complaint)
    .replace(/[。！？?\n]+/g, " ")
    .trim()
    .slice(0, 50);
  const topic =
    subject && !subject.startsWith("尚无有效")
      ? `“${subject}”`
      : "这些已记录的表现";
  const questions = [
    `${topic}可能需要考虑哪些情况，现有资料能帮助判断什么？`,
    `针对${topic}，哪些变化需要及时就医，哪些可以继续观察？`,
    `${topic}接下来怎样护理和记录，有哪些需要避免的做法？`,
    `${topic}是否需要面诊或检查，检查的目的是什么？`,
    `${topic}的开始时间和变化，对判断有什么帮助？`,
    `${topic}如果反复出现，应怎样安排复诊和后续观察？`,
    `${topic}已有的处理是否适合继续，怎样判断效果和不适反应？`,
    `${topic}咨询时还需要补充哪些资料或影像？`,
    `${topic}期间，饮食与日常活动需要作哪些调整？`,
    `${topic}有哪些容易混淆的表现，可以怎样区分？`,
  ];
  if (reading.courseGroups.some((g) => g.id === "medication"))
    questions[6] = `针对${topic}，已记录的用药或补充剂是否需要调整，用量和疗程怎样核对？`;
  return questions;
}

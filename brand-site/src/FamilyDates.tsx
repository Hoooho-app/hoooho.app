import { useState } from "react";

const samples = [
  {
    id: "passport",
    title: "证件到期",
    product: "护护证件卡包",
    group: "本月 · 未定日",
    source: "女儿的护照",
    sourceLabel: "有效期",
    value: "2028 年 6 月",
    dateTime: "2028-06",
    precision: "未定日",
    note: "示例中，原件、号码和照片留在卡包。",
  },
  {
    id: "follow-up",
    title: "复诊待办",
    product: "护护记录",
    group: "6 月 18 日",
    source: "家长已创建的复诊待办",
    sourceLabel: "待办日期",
    value: "2028 年 6 月 18 日",
    dateTime: "2028-06-18",
    precision: "",
    note: "这条示例由家长明确创建。",
  },
] as const;

type Sample = typeof samples[number];

function ExampleLabel({ product }: { product: string }) {
  return (
    <div className="family-dates-label">
      <span>{product}</span>
      <span className="status-label"><i />规划中 · 示例</span>
    </div>
  );
}

function SameDate({ sample }: { sample: Sample }) {
  return <time className="family-dates-highlight" dateTime={sample.dateTime}>{sample.value}</time>;
}

function DatePair({ sample }: { sample: Sample }) {
  return (
    <div className="family-dates-pair">
      <div className="family-dates-pair-card">
        <p className="family-dates-caption">来源 · {sample.product}</p>
        <h3>{sample.source}</h3>
        <div className="family-dates-value">
          <span>{sample.sourceLabel}</span>
          <SameDate sample={sample} />
        </div>
      </div>
      <span className="family-dates-connector" aria-hidden="true" />
      <div className="family-dates-pair-card">
        <p className="family-dates-caption">家庭总览</p>
        <h3>女儿 · {sample.title}</h3>
        <div className="family-dates-value">
          <SameDate sample={sample} />
          {sample.precision && <span>· {sample.precision}</span>}
        </div>
      </div>
    </div>
  );
}

export function FamilyDates() {
  const [month, setMonth] = useState(6);
  const [member, setMember] = useState("daughter");
  const [expanded, setExpanded] = useState<Sample["id"] | null>("passport");
  const entries = month === 6 && member !== "parent" ? samples : [];

  return (
    <section className="family-dates container" id="family-dates" aria-labelledby="family-dates-title">
      <div className="family-dates-heading">
        <ExampleLabel product="家庭总览" />
        <h2 id="family-dates-title">重要的日期，不必再抄一遍。</h2>
        <p>按月看看家里有什么事，点开就能找到日期的来源。</p>
      </div>
      <div className="family-dates-sheet">
        <div className="family-dates-toolbar">
          <p className="family-dates-month">
            <span>2028 年</span><strong>{String(month).padStart(2, "0")}</strong><span>月</span>
          </p>
          <div className="family-dates-filters">
            <div className="category-tabs family-dates-tabs" role="group" aria-label="选择月份">
              {[5, 6, 7].map(value => (
                <button
                  key={value}
                  type="button"
                  className={month === value ? "active" : undefined}
                  aria-pressed={month === value}
                  onClick={() => {
                    setMonth(value);
                    setExpanded(value === 6 ? "passport" : null);
                  }}
                >
                  {value} 月
                </button>
              ))}
            </div>
            <label className="family-dates-member">
              <span>成员</span>
              <select value={member} onChange={event => setMember(event.target.value)}>
                <option value="daughter">女儿</option>
                <option value="all">全部成员</option>
                <option value="parent">家长</option>
              </select>
            </label>
          </div>
        </div>
        <div className="family-dates-list">
          {entries.length === 0 && (
            <p className="family-dates-empty" role="status">本月暂无示例事项</p>
          )}
          {entries.map(sample => {
            const open = expanded === sample.id;
            const panelId = `family-dates-source-${sample.id}`;
            return (
              <div className="family-dates-event" key={sample.id}>
                <p className="family-dates-group">{sample.group}</p>
                <button
                  className="family-dates-event-button"
                  type="button"
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={() => setExpanded(open ? null : sample.id)}
                >
                  <span className="family-dates-event-name">
                    <strong>{sample.title}</strong>
                    <span>女儿 · {sample.product}</span>
                  </span>
                  <span className="family-dates-event-action">
                    {open ? "收起来源" : "查看来源"}
                    <span className="family-dates-chevron" aria-hidden="true" />
                  </span>
                </button>
                <div className="family-dates-detail" id={panelId} hidden={!open}>
                  <DatePair sample={sample} />
                  <p className="family-dates-note">{sample.note}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="family-dates-disclosure">示例资料，不会读取你的信息。</p>
    </section>
  );
}

export function WalletDates() {
  return (
    <section className="family-dates family-dates-wallet container" id="wallet-dates" aria-labelledby="wallet-dates-title">
      <div className="family-dates-heading">
        <ExampleLabel product="护护证件卡包" />
        <h2 id="wallet-dates-title">汇总有效期，不共享原件。</h2>
        <p>总览展示家人、事项和日期。护照原件、号码和照片留在卡包，有效期也在卡包里更正。</p>
      </div>
      <div className="family-dates-sheet family-dates-wallet-sheet">
        <DatePair sample={samples[0]} />
        <div className="family-dates-wallet-footer">
          <p className="family-dates-disclosure">示例资料，不会读取你的信息。</p>
          <div className="family-dates-links">
            <a className="simple-link" href="/#family-dates">
              了解家庭总览 <span className="family-dates-chevron" aria-hidden="true" />
            </a>
            <a className="button button-dark family-dates-wallet-cta" href="#card-demo">
              查看卡包界面 <span className="family-dates-chevron" aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

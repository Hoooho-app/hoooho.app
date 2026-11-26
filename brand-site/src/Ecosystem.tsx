import "./ecosystem.css";

const groups = [
  {
    name: "家庭资料",
    directions: [
      "护护证件卡包",
      "家庭资料夹",
      "在日家庭生活文件解读",
      "家庭保修资料夹",
      "遗嘱 App",
    ],
  },
  {
    name: "日程与出行",
    directions: [
      "家庭统筹会（家庭管家）",
      "家庭时间总览",
      "家庭日程、旅行与假期",
      "家庭关系图",
      "生活探索地图",
      "熟人点评",
      "带娃出行与打包",
    ],
  },
  {
    name: "健康与照护",
    directions: [
      "护护记录",
      "家庭照护交接与轮班",
      "喝水提醒与健康习惯",
      "医嘱、儿保与接种资料",
      "返岗照护过渡包",
      "育儿嫂面试与试用整理",
    ],
  },
  {
    name: "育儿日常",
    directions: [
      "储奶与奶袋库存",
      "待产与新生儿回家准备",
      "儿童餐食与家庭同餐",
      "食品包装配料核对",
      "婴幼儿睡眠记录复盘",
      "如厕过渡协同",
      "幼儿习惯与情绪过渡",
    ],
  },
  {
    name: "成长与陪伴",
    directions: [
      "护护陪玩",
      "家庭相册",
      "入托入园材料与交接包",
      "在日学校通知转待办",
      "家长会准备与行动卡",
      "子女成长档案／事实观察册",
      "孩子课后反馈归档",
      "成长纪念册与画作故事集",
    ],
  },
  {
    name: "物品与居住",
    directions: [
      "育儿用品、衣物与玩具管理",
      "家庭装修增项确认",
      "家庭租房交接",
      "爬行学步环境检查",
    ],
  },
  {
    name: "财务与保障",
    directions: [
      "家庭保险与应急",
      "家庭财务透视表",
      "育儿开支与票据",
      "家庭票据整理",
      "家庭大件预算与置办",
      "家庭人情往来账本",
    ],
  },
  {
    name: "宠物照护",
    directions: [
      "宠物照护交接",
      "宠物就医资料整理",
    ],
  },
];

export default function Ecosystem() {
  return (
    <div className="container ecosystem-directory" id="ecosystem">
      <details className="ecosystem-disclosure">
        <summary>
          <span>浏览家庭产品方向</span>
          <span className="ecosystem-mark" aria-hidden="true" />
        </summary>
        <div className="ecosystem-groups">
          {groups.map(({ name, directions }) => (
            <details className="ecosystem-group" key={name}>
              <summary>
                <span>{name}</span>
                <span className="ecosystem-count">{directions.length} 项</span>
                <span className="ecosystem-mark" aria-hidden="true" />
              </summary>
              <ul>
                {directions.map((direction) => (
                  <li key={direction}>
                    {direction === "护护证件卡包" ? (
                      <a href="/id-cards">{direction}</a>
                    ) : (
                      direction
                    )}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </details>
    </div>
  );
}

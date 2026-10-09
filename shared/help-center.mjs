// Shared, public product knowledge; never import runtime configuration here.
export const SUPPORT_ARTICLES = [
  {
    "id": "add",
    "title": "怎么添加和切换孩子？",
    "summary": "先添加孩子，再选择本次要记录的孩子。后续记录和资料会归到当前孩子名下。",
    "category": "家庭成员",
    "module": "family",
    "keywords": [
      "家人",
      "成员",
      "宝宝",
      "新建"
    ],
    "aliases": [],
    "conclusion": "先添加孩子，再选择本次要记录的孩子。后续记录和资料会归到当前孩子名下。",
    "steps": [
      "打开当前孩子切换面板，选择添加孩子，填写基本信息。",
      "完成添加后，在当前孩子入口选择要查看的孩子。",
      "记录前再看一眼姓名，确认这次记录属于谁。"
    ],
    "result": "孩子信息出现在首页；切换后，随记和档案一起切换。",
    "relatedArticleIds": [
      "find",
      "profile"
    ],
    "actions": [
      {
        "label": "去添加孩子",
        "to": "/family/new"
      }
    ],
    "updatedAt": "2026-10-09",
    "status": "published",
    "priority": 60
  },
  {
    "id": "profile",
    "title": "怎么补充孩子的孩子档案？",
    "summary": "把需要长期保留的背景放进孩子档案，日常变化继续记在健康随记里。",
    "category": "家庭成员",
    "module": "family",
    "keywords": [
      "病史",
      "家族史",
      "手术",
      "疫苗"
    ],
    "aliases": [],
    "conclusion": "把需要长期保留的背景放进孩子档案，日常变化继续记在健康随记里。",
    "steps": [
      "选择孩子，进入孩子档案。",
      "进入过敏史、慢性病史、家族史、手术史或疫苗接种记录。",
      "补充已有信息并保存；不清楚的内容可以先不填写。"
    ],
    "result": "回到对应档案条目即可查看。",
    "relatedArticleIds": [
      "allergy",
      "find"
    ],
    "actions": [
      {
        "label": "去孩子档案",
        "to": "/health-profile"
      }
    ],
    "updatedAt": "2026-10-09",
    "status": "published",
    "priority": 60
  },
  {
    "id": "smart",
    "title": "怎么用语音或图片完成第一条记录？",
    "summary": "进入智能记录，用语音描述情况或上传图片，核对生成的内容后保存。",
    "category": "健康随记",
    "module": "record",
    "keywords": [
      "录音",
      "智能记录",
      "转写",
      "拍照",
      "上传",
      "说话"
    ],
    "aliases": [
      "怎么语音记录",
      "怎么上传图片"
    ],
    "conclusion": "进入智能记录，用语音描述情况或上传图片，核对生成的内容后保存。",
    "steps": [
      "先确认当前孩子，进入智能记录。",
      "按住说话并在说完后松开，或选择图片上传。",
      "检查草稿中的症状、时间和分类，必要时直接修改。",
      "核对后保存。未填写发生时间时，默认使用当前时间。"
    ],
    "result": "保存后的内容出现在当前孩子的健康随记中。",
    "relatedArticleIds": [
      "mic",
      "upload",
      "save"
    ],
    "actions": [
      {
        "label": "去智能记录",
        "to": "/smart-record"
      }
    ],
    "updatedAt": "2026-10-09",
    "status": "published",
    "priority": 60
  },
  {
    "id": "symptom",
    "title": "怎么记录症状和用药？",
    "summary": "在健康随记中选择记录症状或记录用药，按本次情况填写。",
    "category": "健康随记",
    "module": "record",
    "keywords": [
      "身体部位",
      "药物",
      "吃药"
    ],
    "aliases": [],
    "conclusion": "在健康随记中选择记录症状或记录用药，按本次情况填写。",
    "steps": [
      "确认孩子，选择记录症状或记录用药。",
      "症状可补充部位、表现和图片；用药可填写药名与用药情况。",
      "检查发生时间和内容后保存。"
    ],
    "result": "在健康随记中查看本次记录。",
    "relatedArticleIds": [
      "smart",
      "find"
    ],
    "actions": [
      {
        "label": "去健康随记",
        "to": "/health-events"
      }
    ],
    "updatedAt": "2026-10-09",
    "status": "published",
    "priority": 60
  },
  {
    "id": "daily",
    "title": "怎么记录喂养、睡眠和排便？",
    "summary": "进入记录日常后，在顶部直接切换喂养、睡眠、排便或身体涂抹。",
    "category": "健康随记",
    "module": "record",
    "keywords": [
      "日常",
      "身体涂抹",
      "奶",
      "辅食"
    ],
    "aliases": [],
    "conclusion": "进入记录日常后，在顶部直接切换喂养、睡眠、排便或身体涂抹。",
    "steps": [
      "从健康随记进入记录日常。",
      "在顶部选择本次要记录的项目。",
      "填写这次情况，核对后保存。"
    ],
    "result": "日常记录归入当前孩子的健康随记。",
    "relatedArticleIds": [
      "find",
      "save"
    ],
    "actions": [
      {
        "label": "去记录日常",
        "to": "/health-events"
      }
    ],
    "updatedAt": "2026-10-09",
    "status": "published",
    "priority": 60
  },
  {
    "id": "allergy",
    "title": "怎么补充和查看过敏史？",
    "summary": "在过敏史里维护已知过敏信息，并保留确认来源。相关页面使用同一份孩子资料。",
    "category": "过敏与饮食",
    "module": "allergy",
    "keywords": [
      "食物",
      "过敏源",
      "确认",
      "来源"
    ],
    "aliases": [],
    "conclusion": "在过敏史里维护已知过敏信息，并保留确认来源。相关页面使用同一份孩子资料。",
    "steps": [
      "确认孩子，进入孩子档案中的过敏史。",
      "补充过敏对象、反应和确认来源。",
      "保存后查看过敏史，核对名称和状态。"
    ],
    "result": "已保存的过敏信息可在相关饮食工具中用于冲突提醒。",
    "relatedArticleIds": [
      "diet",
      "scan"
    ],
    "actions": [
      {
        "label": "去过敏史",
        "to": "/health-profile/allergy"
      }
    ],
    "updatedAt": "2026-10-09",
    "status": "published",
    "priority": 60
  },
  {
    "id": "diet",
    "title": "怎么查看忌口出示卡？",
    "summary": "忌口出示卡用于整理孩子的饮食相关信息。查看前先确认当前孩子。",
    "category": "过敏与饮食",
    "module": "allergy",
    "keywords": [
      "忌口",
      "处方",
      "食物",
      "饮食"
    ],
    "aliases": [],
    "conclusion": "忌口出示卡用于整理孩子的饮食相关信息。查看前先确认当前孩子。",
    "steps": [
      "进入忌口出示卡。",
      "查看已有食物条目及相关说明。",
      "需要更新时，打开对应条目并核对过敏信息。"
    ],
    "result": "更新后的条目在忌口出示卡中查看。",
    "relatedArticleIds": [
      "allergy",
      "scan"
    ],
    "actions": [
      {
        "label": "去忌口出示卡",
        "to": "/dietary-card"
      }
    ],
    "updatedAt": "2026-10-09",
    "status": "published",
    "priority": 60
  },
  {
    "id": "scan",
    "title": "怎么扫描配料表并读懂标签？",
    "summary": "上传清晰的配料表，先核对识别文字，再查看每个配料的标签和说明。",
    "category": "过敏与饮食",
    "module": "allergy",
    "keywords": [
      "食品",
      "包装",
      "成分",
      "图片",
      "未见已知冲突",
      "绿色"
    ],
    "aliases": [
      "扫描配料表",
      "配料标签是什么意思"
    ],
    "conclusion": "上传清晰的配料表，先核对识别文字，再查看每个配料的标签和说明。",
    "steps": [
      "进入配料表扫描，拍摄或选择清晰图片。",
      "确认配料文字完整，发现漏字或错字时重新上传。",
      "逐项查看配料标签，以及与孩子已知过敏信息的关联。"
    ],
    "result": "绿色“未见已知冲突”表示目前未匹配到已知冲突，不代表绝对安全。",
    "relatedArticleIds": [
      "upload",
      "allergy"
    ],
    "actions": [
      {
        "label": "去配料表扫描",
        "to": "/food-label"
      }
    ],
    "updatedAt": "2026-10-09",
    "status": "published",
    "priority": 60
  },
  {
    "id": "medplan",
    "title": "怎么查看用药安排？",
    "summary": "在用药安排中查看已有用药安排，记录用药与安排提醒分别处理。",
    "category": "安排与跟进",
    "module": "follow",
    "keywords": [
      "提醒",
      "执行",
      "用药",
      "时间"
    ],
    "aliases": [],
    "conclusion": "在用药安排中查看已有用药安排，记录用药与安排提醒分别处理。",
    "steps": [
      "确认孩子，进入用药安排。",
      "查看对应药物和安排时间。",
      "按实际执行情况更新，并检查相关记录。"
    ],
    "result": "在用药安排查看安排，在健康随记查看用药记录。",
    "relatedArticleIds": [
      "symptom",
      "followup"
    ],
    "actions": [
      {
        "label": "去用药安排",
        "to": "/medication-reminders"
      }
    ],
    "updatedAt": "2026-10-09",
    "status": "published",
    "priority": 60
  },
  {
    "id": "followup",
    "title": "在哪里查看正在跟进的事项？",
    "summary": "首页的正在跟进区域集中展示当前孩子的进行中事项。",
    "category": "安排与跟进",
    "module": "follow",
    "keywords": [
      "首页",
      "健康随记",
      "观察"
    ],
    "aliases": [],
    "conclusion": "首页的正在跟进区域集中展示当前孩子的进行中事项。",
    "steps": [
      "在首页确认当前孩子。",
      "找到正在跟进区域，选择要查看的事项。",
      "查看已有情况，并按实际进展补充记录。"
    ],
    "result": "返回首页，可以继续查看多个进行中事项。",
    "relatedArticleIds": [
      "smart",
      "find"
    ],
    "actions": [
      {
        "label": "去正在跟进",
        "to": "/cases"
      }
    ],
    "updatedAt": "2026-10-09",
    "status": "published",
    "priority": 60
  },
  {
    "id": "summary",
    "title": "怎么整理孩子的情况单？",
    "summary": "先补齐这次情况的记录，再进入就医准备，查看并核对情况单。",
    "category": "就医准备",
    "module": "visit",
    "keywords": [
      "病情摘要",
      "就医",
      "准备",
      "医生"
    ],
    "aliases": [],
    "conclusion": "先补齐这次情况的记录，再进入就医准备，查看并核对情况单。",
    "steps": [
      "确认孩子，检查相关健康随记和档案信息。",
      "进入就医准备，打开情况单。",
      "核对症状、时间线和相关背景，确认后再导出或复制。"
    ],
    "result": "在就医准备查看情况单，并选择复制提示词或保存文件。",
    "relatedArticleIds": [
      "prompt",
      "html"
    ],
    "actions": [
      {
        "label": "去就医准备",
        "to": "/visit-summary"
      }
    ],
    "updatedAt": "2026-10-09",
    "status": "published",
    "priority": 60
  },
  {
    "id": "prompt",
    "title": "怎么复制问诊提示词？",
    "summary": "在情况单的导出操作中选择复制问诊提示词，复制后可以粘贴使用。",
    "category": "就医准备",
    "module": "visit",
    "keywords": [
      "提问",
      "AI",
      "医生",
      "粘贴",
      "文本"
    ],
    "aliases": [],
    "conclusion": "在情况单的导出操作中选择复制问诊提示词，复制后可以粘贴使用。",
    "steps": [
      "进入就医准备，查看已核对的情况单。",
      "选择复制问诊提示词。",
      "在需要使用的地方粘贴，检查内容是否完整。"
    ],
    "result": "提示词保存在剪贴板；复制不改变孩子的原始记录。",
    "relatedArticleIds": [
      "summary",
      "html"
    ],
    "actions": [
      {
        "label": "去就医准备",
        "to": "/visit-summary"
      }
    ],
    "updatedAt": "2026-10-09",
    "status": "published",
    "priority": 60
  },
  {
    "id": "html",
    "title": "怎么把情况单保存到手机？",
    "summary": "选择保存 HTML 文件，把可独立打开的情况单保存到手机。",
    "category": "就医准备",
    "module": "visit",
    "keywords": [
      "HTML",
      "文件",
      "下载",
      "导出",
      "Safari",
      "分享"
    ],
    "aliases": [
      "怎么保存情况单",
      "HTML文件下载"
    ],
    "conclusion": "选择保存 HTML 文件，把可独立打开的情况单保存到手机。",
    "steps": [
      "在就医准备核对情况单。",
      "选择保存 HTML 文件。",
      "根据手机浏览器提示完成下载；在 iPhone 上可通过系统分享菜单存储到“文件”。",
      "打开保存的文件，确认内容完整。"
    ],
    "result": "文件可在手机的“文件”或下载位置找到，之后可以再次打开。",
    "relatedArticleIds": [
      "summary",
      "prompt"
    ],
    "actions": [
      {
        "label": "去就医准备",
        "to": "/visit-summary"
      }
    ],
    "updatedAt": "2026-10-09",
    "status": "published",
    "priority": 60
  },
  {
    "id": "mic",
    "title": "录音没反应或转写失败怎么办？",
    "summary": "先检查麦克风权限和网络。失败后保留现有内容，再尝试重试。",
    "category": "故障排查",
    "module": "trouble",
    "keywords": [
      "麦克风",
      "权限",
      "语音",
      "超时",
      "Safari",
      "重试"
    ],
    "aliases": [
      "录音没反应",
      "语音转写失败",
      "麦克风没有反应"
    ],
    "conclusion": "先检查麦克风权限和网络。失败后保留现有内容，再尝试重试。",
    "steps": [
      "查看浏览器是否允许麦克风；未允许时，在网站权限中开启。",
      "确认网络可用，再录一小段并松开。",
      "转写失败时按页面提示重试，不清空已有草稿。",
      "需要先记录时，可以直接输入文字。"
    ],
    "result": "成功后回到草稿核对并保存，现有草稿继续保留。",
    "relatedArticleIds": [
      "smart",
      "save"
    ],
    "actions": [
      {
        "label": "去智能记录",
        "to": "/smart-record"
      }
    ],
    "updatedAt": "2026-10-09",
    "status": "published",
    "priority": 60
  },
  {
    "id": "upload",
    "title": "图片上传或识别失败怎么办？",
    "summary": "先确认图片清晰且文字完整。上传或识别失败时，可以重试或先用文字记录。",
    "category": "故障排查",
    "module": "trouble",
    "keywords": [
      "拍照",
      "照片",
      "相册",
      "图片",
      "太大",
      "超时"
    ],
    "aliases": [],
    "conclusion": "先确认图片清晰且文字完整。上传或识别失败时，可以重试或先用文字记录。",
    "steps": [
      "选择清晰图片，避免反光、裁切和文字过小。",
      "检查网络，再按页面提示重试。",
      "多页资料按顺序上传，检查识别结果是否完整。",
      "暂时无法识别时，保留已有内容并手动补充。"
    ],
    "result": "识别完成后先核对草稿，保存后才形成记录。",
    "relatedArticleIds": [
      "smart",
      "scan"
    ],
    "actions": [
      {
        "label": "去智能记录",
        "to": "/smart-record"
      }
    ],
    "updatedAt": "2026-10-09",
    "status": "published",
    "priority": 60
  },
  {
    "id": "save",
    "title": "保存失败，已经写的内容怎么办？",
    "summary": "先保留页面和草稿，按错误提示处理后再尝试保存。",
    "category": "故障排查",
    "module": "trouble",
    "keywords": [
      "草稿",
      "网络",
      "登录",
      "丢失",
      "重试"
    ],
    "aliases": [],
    "conclusion": "先保留页面和草稿，按错误提示处理后再尝试保存。",
    "steps": [
      "不要主动清空内容或反复刷新页面。",
      "检查网络；需要重新登录时，按页面提示操作。",
      "返回草稿后核对内容，再点击保存。",
      "确认保存成功后，去健康随记查看结果。"
    ],
    "result": "只有保存成功的内容才会成为正式记录。",
    "relatedArticleIds": [
      "find",
      "smart"
    ],
    "actions": [
      {
        "label": "去智能记录",
        "to": "/health-events"
      }
    ],
    "updatedAt": "2026-10-09",
    "status": "published",
    "priority": 60
  },
  {
    "id": "find",
    "title": "保存后找不到记录怎么办？",
    "summary": "先确认孩子，再检查健康随记中的时间范围和分类。",
    "category": "故障排查",
    "module": "trouble",
    "keywords": [
      "搜索",
      "筛选",
      "家人",
      "切换",
      "孩子",
      "日期"
    ],
    "aliases": [
      "我的记录不见了",
      "找不到记录"
    ],
    "conclusion": "先确认孩子，再检查健康随记中的时间范围和分类。",
    "steps": [
      "看当前孩子是否与保存时一致。",
      "进入健康随记，检查筛选条件和日期范围。",
      "如果仍找不到，回到原页面确认是否提示保存成功。"
    ],
    "result": "健康随记按孩子展示；未保存草稿不会出现在正式记录列表。",
    "relatedArticleIds": [
      "add",
      "save"
    ],
    "actions": [
      {
        "label": "去健康随记",
        "to": "/health-events"
      }
    ],
    "updatedAt": "2026-10-09",
    "status": "published",
    "priority": 60
  },
  {
    "id": "growth",
    "title": "怎么更新身高、体重和血型？",
    "summary": "在首页孩子信息下方查看成长数据，选择身高、体重或血型进行更新。",
    "category": "家庭成员",
    "module": "family",
    "keywords": [
      "成长",
      "曲线",
      "测量",
      "数据"
    ],
    "aliases": [],
    "conclusion": "在首页孩子信息下方查看成长数据，选择身高、体重或血型进行更新。",
    "steps": [
      "确认当前孩子，找到身高、体重和血型。",
      "身高或体重进入成长记录，填写本次测量值和日期。",
      "血型可直接编辑，核对后保存。"
    ],
    "result": "首页显示基础数据，测量记录在成长记录中查看。",
    "relatedArticleIds": [
      "add",
      "profile"
    ],
    "actions": [
      {
        "label": "去成长记录",
        "to": "/health-profile/growth"
      }
    ],
    "updatedAt": "2026-10-09",
    "status": "published",
    "priority": 60
  },
  {
    "id": "note",
    "title": "怎么记下一条注意事项？",
    "summary": "在健康随记中选择记录注意，把需要留意的内容记下来。",
    "category": "健康随记",
    "module": "record",
    "keywords": [
      "记录注意",
      "照护",
      "备注"
    ],
    "aliases": [],
    "conclusion": "在健康随记中选择记录注意，把需要留意的内容记下来。",
    "steps": [
      "确认孩子，进入记录注意。",
      "填写需要留意的事项和相关背景。",
      "检查内容与时间，核对后保存。"
    ],
    "result": "在当前孩子的健康随记中查看。",
    "relatedArticleIds": [
      "find",
      "save"
    ],
    "actions": [
      {
        "label": "去记录注意",
        "to": "/health-events"
      }
    ],
    "updatedAt": "2026-10-09",
    "status": "published",
    "priority": 60
  },
  {
    "id": "collect",
    "title": "怎么使用健康随记？",
    "summary": "先保存发生的情况，再根据需要处理后续安排。",
    "category": "安排与跟进",
    "module": "follow",
    "keywords": [
      "情况",
      "收记",
      "正文",
      "观察"
    ],
    "aliases": [],
    "conclusion": "先保存发生的情况，再根据需要处理后续安排。",
    "steps": [
      "在首页进入健康随记，确认孩子。",
      "通过口述或文字留下情况，必要时补充图片。",
      "核对正文后先保存，再根据需要安排观察或补充资料。"
    ],
    "result": "保存的情况留在孩子的记录中，进行中的事项可在正在跟进查看。",
    "relatedArticleIds": [
      "followup",
      "smart"
    ],
    "actions": [
      {
        "label": "去健康随记",
        "to": "/smart-record"
      }
    ],
    "updatedAt": "2026-10-09",
    "status": "published",
    "priority": 60
  }
]

export const USER_MANUAL = [
  {
    "id": "family",
    "cat": "family",
    "title": "孩子与家人",
    "brief": "让每个人的记录和资料各归其位",
    "purpose": "家庭里可能有不止一位成员。先确定正在照顾谁，才能让记录、档案和就医资料归到正确的人名下。",
    "scene": "为两个孩子分别记录，或由家人代为整理资料时。",
    "example": "给妹妹记了一次排便，切换到哥哥后，看到的是哥哥自己的记录。",
    "output": "每位成员有自己的健康随记和档案。",
    "help": "add",
    "category": "家庭成员",
    "module": "family",
    "helpArticleId": "add"
  },
  {
    "id": "growth",
    "cat": "family",
    "title": "成长数据",
    "brief": "持续保存身高、体重与血型",
    "purpose": "把分散的测量结果按时间保留下来，查看孩子的成长变化，并在需要时补充基础信息。",
    "scene": "测量身高、体重后，或确认血型后。",
    "example": "记录这次体重后，以后可以回看不同日期的测量结果。",
    "output": "首页展示基础数据；身高和体重在成长记录中查看。",
    "help": "growth",
    "category": "家庭成员",
    "module": "family",
    "helpArticleId": "growth"
  },
  {
    "id": "profile",
    "cat": "family",
    "title": "孩子档案",
    "brief": "整理就医时需要反复说明的背景",
    "purpose": "把过敏史、慢性病史、家族史、手术史和疫苗接种记录集中保存，减少每次就医重新回忆和整理的负担。",
    "scene": "获得新的诊断、完成接种，或补充既往资料时。",
    "example": "将手术日期和医院记进档案，以后整理就医资料时方便核对。",
    "output": "长期背景保存在对应档案条目中。",
    "help": "profile",
    "category": "家庭成员",
    "module": "family",
    "helpArticleId": "profile"
  },
  {
    "id": "smart",
    "cat": "record",
    "title": "智能记录",
    "brief": "把口述和图片整理成可核对的记录",
    "purpose": "照顾孩子时不一定有空逐项打字。智能记录帮助把描述或图片整理成草稿，方便你检查后保存。",
    "scene": "想快速说下刚才发生的情况，或保存纸质资料时。",
    "example": "说出“今天没有呕吐，只是恶心”，先核对草稿再保存。",
    "output": "确认保存后形成健康随记；生成草稿不等于已经保存。",
    "help": "smart",
    "category": "健康随记",
    "module": "record",
    "helpArticleId": "smart"
  },
  {
    "id": "symptom",
    "cat": "record",
    "title": "症状与用药记录",
    "brief": "保留发生了什么、用了什么药",
    "purpose": "把症状的表现、部位、时间和用药情况记下来，方便之后回看变化，也减少就医时遗漏关键信息。",
    "scene": "出现新症状、症状变化，或发生一次用药时。",
    "example": "分别记录起疹的时间和当天的用药情况，回看时更容易讲清楚经过。",
    "output": "保留实际发生的症状和用药记录。",
    "help": "symptom",
    "category": "健康随记",
    "module": "record",
    "helpArticleId": "symptom"
  },
  {
    "id": "note",
    "cat": "record",
    "title": "记录注意",
    "brief": "留下需要记住的照护事项",
    "purpose": "把容易忘记的注意事项和背景留在随记中，方便自己或代办的家人之后查看。",
    "scene": "有一条需要留意的情况，但不适合归成症状或用药记录时。",
    "example": "记下这次复诊前要带的资料，避免下次整理时忘记。",
    "output": "形成一条可回看的注意记录。",
    "help": "note",
    "category": "健康随记",
    "module": "record",
    "helpArticleId": "note"
  },
  {
    "id": "daily",
    "cat": "record",
    "title": "日常记录",
    "brief": "保留喂养、睡眠、排便和涂抹的变化",
    "purpose": "将日常照护记录保留下来，帮助家人交接，也为回顾某段时间的情况提供背景。",
    "scene": "记录一顿喂养、一次睡眠、排便或身体涂抹时。",
    "example": "回看这两天的喂养和排便记录，核对实际发生的时间与表现。",
    "output": "四类日常记录归入健康随记，不自动推断症状的原因。",
    "help": "daily",
    "category": "健康随记",
    "module": "record",
    "helpArticleId": "daily"
  },
  {
    "id": "allergy",
    "cat": "allergy",
    "title": "过敏史",
    "brief": "维护已知过敏信息与确认来源",
    "purpose": "将过敏对象、反应和确认来源保留下来，为相关饮食工具提供同一份孩子背景，避免信息散落。",
    "scene": "已有明确过敏信息，或需要更新确认来源时。",
    "example": "记录牛奶过敏和医生确认来源，之后查看饮食相关信息时方便核对。",
    "output": "过敏史与相关饮食工具使用关联信息。",
    "help": "allergy",
    "category": "过敏与饮食",
    "module": "allergy",
    "helpArticleId": "allergy"
  },
  {
    "id": "diet",
    "cat": "allergy",
    "title": "忌口出示卡",
    "brief": "把孩子的饮食相关信息集中查看",
    "purpose": "提供一个集中查看饮食条目和相关说明的位置，方便照护时回顾已整理的信息。",
    "scene": "选择食物前，或需要给家人交接饮食信息时。",
    "example": "准备食物前，查看孩子已有的食物条目，并核对相关过敏信息。",
    "output": "形成可持续更新的饮食信息列表，不能代替医生制定饮食方案。",
    "help": "diet",
    "category": "过敏与饮食",
    "module": "allergy",
    "helpArticleId": "diet"
  },
  {
    "id": "scan",
    "cat": "allergy",
    "title": "配料表扫描",
    "brief": "帮助读懂包装配料和已知冲突",
    "purpose": "把包装上的配料文字整理出来，逐项展示标签与说明，并结合已知过敏信息提醒需要留意的地方。",
    "scene": "为孩子挑选包装食品，配料多或不容易读懂时。",
    "example": "上传饼干配料表，检查识别文字，再查看与孩子过敏信息有关的配料。",
    "output": "得到配料解读与标签。“未见已知冲突”不等于绝对安全。",
    "help": "scan",
    "category": "过敏与饮食",
    "module": "allergy",
    "helpArticleId": "scan"
  },
  {
    "id": "collect",
    "cat": "follow",
    "title": "健康随记",
    "brief": "先记下情况，再决定后续怎么跟进",
    "purpose": "遇到情况时先把内容留住，再根据需要安排观察或补充资料，减少一开始就要做很多选择的负担。",
    "scene": "刚发生一件需要记下的事，还没想好后续安排时。",
    "example": "先描述今天出现的情况，保存正文后再考虑是否需要跟进。",
    "output": "情况先被保存，后续安排由你确认。",
    "help": "collect",
    "category": "安排与跟进",
    "module": "follow",
    "helpArticleId": "collect"
  },
  {
    "id": "followup",
    "cat": "follow",
    "title": "正在跟进",
    "brief": "把尚未结束的事项放在一起",
    "purpose": "让正在处理的多个事项在首页可见，方便接着补充进展，减少记录后忘记继续跟进。",
    "scene": "有几件情况需要连续关注或补充进展时。",
    "example": "在首页查看一个事项的已有记录，再补上今天的新变化。",
    "output": "首页集中展示进行中的事项。",
    "help": "followup",
    "category": "安排与跟进",
    "module": "follow",
    "helpArticleId": "followup"
  },
  {
    "id": "medplan",
    "cat": "follow",
    "title": "用药安排",
    "brief": "区分用药安排与实际用药",
    "purpose": "安排告诉你准备什么时候做，记录告诉你实际做了什么。两者配合，方便回顾执行情况。",
    "scene": "需要查看已有用药安排并记录执行情况时。",
    "example": "先看今天的用药安排，实际用药后再核对记录。",
    "output": "安排在用药安排中查看，实际用药在随记中查看。",
    "help": "medplan",
    "category": "安排与跟进",
    "module": "follow",
    "helpArticleId": "medplan"
  },
  {
    "id": "summary",
    "cat": "visit",
    "title": "就医准备与情况单",
    "brief": "把零散资料整理成就医时可用的说明",
    "purpose": "将这次情况、时间线和相关背景集中整理，帮助你就医前核对，并在交流时更完整地说明孩子的情况。",
    "scene": "准备就医、复诊，或需要把情况交给家人时。",
    "example": "核对情况单后，复制问诊提示词，或把 HTML 文件保存到手机带去医院。",
    "output": "情况单、问诊提示词和可独立打开的 HTML 文件。内容由你核对，不替代医生诊断。",
    "help": "summary",
    "category": "就医准备",
    "module": "visit",
    "helpArticleId": "summary"
  }
]

export const HELP_MODULES = [
  {
    "id": "family",
    "label": "孩子与资料",
    "description": "添加、切换孩子 · 孩子档案",
    "articleIds": [
      "add",
      "profile",
      "growth"
    ]
  },
  {
    "id": "record",
    "label": "记录情况",
    "description": "智能记录 · 症状、用药、日常",
    "articleIds": [
      "smart",
      "symptom",
      "daily",
      "note"
    ]
  },
  {
    "id": "allergy",
    "label": "过敏与饮食",
    "description": "过敏史 · 处方卡 · 配料扫描",
    "articleIds": [
      "allergy",
      "diet",
      "scan"
    ]
  },
  {
    "id": "follow",
    "label": "安排与跟进",
    "description": "用药安排 · 正在跟进",
    "articleIds": [
      "medplan",
      "followup",
      "collect"
    ]
  },
  {
    "id": "visit",
    "label": "就医准备",
    "description": "情况单 · 提示词 · 文件保存",
    "articleIds": [
      "summary",
      "prompt",
      "html"
    ]
  },
  {
    "id": "trouble",
    "label": "遇到问题",
    "description": "录音、上传、保存与查找",
    "articleIds": [
      "mic",
      "upload",
      "save",
      "find"
    ]
  }
]

export const EXTRA_ARTICLES = [
  {
    "id": "email-code-missing",
    "title": "为什么收不到邮箱验证码？",
    "summary": "检查邮箱地址、垃圾邮件和重新发送间隔。",
    "category": "账号与登录",
    "keywords": [
      "邮箱",
      "验证码",
      "登录",
      "收不到"
    ],
    "aliases": [
      "邮箱那个码没来",
      "验证码一直不发",
      "邮件码没收到"
    ],
    "conclusion": "多数情况下可通过核对邮箱、检查垃圾邮件并等待发送间隔解决。",
    "steps": [
      "确认邮箱地址没有输入错误。",
      "检查垃圾邮件或广告邮件目录。",
      "等待 60 秒后重新发送。",
      "如果申请过多个验证码，以最后一次收到的验证码为准。"
    ],
    "commonCauses": [
      "邮箱地址输入错误",
      "邮件被邮箱服务商归入垃圾邮件",
      "短时间内重复发送触发限制"
    ],
    "relatedArticleIds": [
      "email-code-expired",
      "change-login-email"
    ],
    "actions": [
      {
        "label": "返回登录页面",
        "to": "/login"
      }
    ],
    "updatedAt": "2026-10-09",
    "status": "published",
    "priority": 100,
    "module": "trouble"
  },
  {
    "id": "email-code-expired",
    "title": "验证码显示已过期怎么办？",
    "summary": "重新获取验证码，并使用最后一次收到的邮件。",
    "category": "账号与登录",
    "keywords": [
      "验证码",
      "过期",
      "失效"
    ],
    "aliases": [
      "码过期了",
      "验证码不能用"
    ],
    "conclusion": "验证码过期后需要重新获取。",
    "steps": [
      "返回登录页面。",
      "重新发送验证码。",
      "使用最后一次收到的验证码完成登录。"
    ],
    "commonCauses": [
      "验证码超过有效时间",
      "使用了较早邮件中的验证码"
    ],
    "relatedArticleIds": [
      "email-code-missing"
    ],
    "actions": [
      {
        "label": "返回登录页面",
        "to": "/login"
      }
    ],
    "updatedAt": "2026-10-09",
    "status": "published",
    "priority": 70,
    "module": "trouble"
  },
  {
    "id": "change-login-email",
    "title": "如何修改登录邮箱？",
    "summary": "在账户安全中查看和管理登录邮箱。",
    "category": "账号与登录",
    "keywords": [
      "修改",
      "登录",
      "邮箱"
    ],
    "aliases": [
      "换邮箱",
      "邮箱写错了"
    ],
    "conclusion": "进入设置的账户安全页面，按页面提示管理登录邮箱。",
    "steps": [
      "进入设置，再进入账户安全。",
      "打开邮箱选项，按页面提示完成验证或修改。",
      "不要向帮助或反馈提供密码、验证码。"
    ],
    "actions": [
      {
        "label": "查看账户安全",
        "to": "/account/security"
      }
    ],
    "relatedArticleIds": [
      "email-code-missing"
    ],
    "updatedAt": "2026-10-09",
    "status": "published",
    "module": "trouble"
  },
  {
    "id": "change-record-member",
    "title": "如何修改记录所属的家庭成员？",
    "summary": "当前版本不支持直接迁移记录，请先核对后再重新记录。",
    "category": "家庭成员",
    "keywords": [
      "记录",
      "写错人",
      "所属",
      "成员"
    ],
    "aliases": [
      "我写错人了",
      "记录放到家人那里了",
      "记到别人名下"
    ],
    "conclusion": "当前版本暂不支持把既有记录直接迁移给另一位成员。",
    "steps": [
      "打开原记录核对内容。",
      "从侧边栏切换到正确的孩子。",
      "重新记录并确认无误。"
    ],
    "commonCauses": [
      "记录前未核对当前成员",
      "切换成员后页面仍停留在原流程"
    ],
    "actions": [
      {
        "label": "前往护士站",
        "to": "/nurse-station"
      }
    ],
    "relatedArticleIds": [
      "delete-record"
    ],
    "updatedAt": "2026-10-09",
    "status": "published",
    "priority": 95,
    "module": "trouble"
  },
  {
    "id": "delete-health-event",
    "title": "如何删除这条健康随记？",
    "summary": "在健康随记详情确认对象和内容后执行删除。",
    "category": "健康随记",
    "keywords": [
      "删除",
      "健康随记"
    ],
    "aliases": [
      "删掉随记",
      "不要这条随记"
    ],
    "conclusion": "删除前请确认随记内容和记录对象，删除后可能无法恢复。",
    "steps": [
      "进入健康随记详情。",
      "核对随记内容和所属成员。",
      "使用页面提供的删除操作并确认。"
    ],
    "actions": [
      {
        "label": "查看健康随记",
        "to": "/health-events"
      }
    ],
    "updatedAt": "2026-10-09",
    "status": "published",
    "module": "trouble"
  },
  {
    "id": "change-record-time",
    "title": "如何修改记录的时间？",
    "summary": "在记录详情中修改实际发生时间，不能选择未来时间。",
    "category": "记录与时间线",
    "keywords": [
      "修改",
      "时间",
      "发生时间",
      "填错"
    ],
    "aliases": [
      "时间填错了",
      "日期写错了",
      "改时间"
    ],
    "conclusion": "在对应记录的编辑页修改发生时间，只能填写已发生或当前的时间。",
    "steps": [
      "在健康随记找到要修改的记录。",
      "进入编辑，调整发生时间。",
      "核对后保存，不填写未来时间。"
    ],
    "commonCauses": [
      "把创建时间误认为发生时间",
      "选择了未来时间"
    ],
    "actions": [
      {
        "label": "查看健康随记",
        "to": "/health-events"
      }
    ],
    "updatedAt": "2026-10-09",
    "status": "published",
    "priority": 90,
    "module": "trouble"
  },
  {
    "id": "delete-record",
    "title": "如何修改或删除一条记录？",
    "summary": "在健康随记详情中找到该记录，再使用编辑或删除操作。",
    "category": "记录与时间线",
    "keywords": [
      "修改",
      "删除",
      "记录",
      "时间线"
    ],
    "aliases": [
      "删记录",
      "改一条记录"
    ],
    "conclusion": "单条记录的操作入口位于对应健康随记详情。",
    "steps": [
      "打开所属健康随记。",
      "在时间线中找到目标记录。",
      "选择编辑或删除并确认。"
    ],
    "actions": [
      {
        "label": "查看健康随记",
        "to": "/health-events"
      }
    ],
    "relatedArticleIds": [
      "change-record-time"
    ],
    "updatedAt": "2026-10-09",
    "status": "published",
    "priority": 80,
    "module": "trouble"
  },
  {
    "id": "attachment-upload-failed",
    "title": "为什么附件上传失败？",
    "summary": "检查图片格式、大小、网络和登录状态后重试。",
    "category": "图片与附件",
    "keywords": [
      "附件",
      "图片",
      "上传",
      "失败",
      "没反应"
    ],
    "aliases": [
      "图片点了没反应",
      "照片传不上去",
      "附件上传失败"
    ],
    "conclusion": "上传失败通常与文件格式、大小或网络状态有关。",
    "steps": [
      "确认文件为页面支持的图片格式。",
      "检查网络连接和登录状态。",
      "返回健康随记详情后重新选择文件。"
    ],
    "commonCauses": [
      "文件格式不支持",
      "文件过大",
      "网络中断",
      "登录状态已过期"
    ],
    "actions": [
      {
        "label": "查看健康随记",
        "to": "/health-events"
      }
    ],
    "relatedArticleIds": [
      "upload"
    ],
    "updatedAt": "2026-10-09",
    "status": "published",
    "priority": 95,
    "module": "trouble"
  },
  {
    "id": "privacy-data",
    "title": "Hoooho 如何保护我的数据？",
    "summary": "产品仅按功能需要处理数据，帮助搜索不会自动读取健康记录。",
    "category": "数据与隐私",
    "keywords": [
      "隐私",
      "数据",
      "安全",
      "读取"
    ],
    "aliases": [
      "数据安全吗",
      "会看我的记录吗"
    ],
    "conclusion": "帮助中心只使用你主动输入的问题和非敏感页面信息，不会自动读取健康记录。",
    "steps": [
      "帮助对话只使用你主动提供的问题，不自动读取健康记录。",
      "不要在对话中输入密码、验证码或完整病历。",
      "提交反馈前检查文字和截图，隐私相关信息在设置中查看。"
    ],
    "actions": [
      {
        "label": "查看隐私设置",
        "to": "/settings/privacy"
      }
    ],
    "updatedAt": "2026-10-09",
    "status": "published",
    "priority": 80,
    "module": "trouble"
  },
  {
    "id": "export-data",
    "title": "如何导出我的健康数据？",
    "summary": "情况单可以保存 HTML；全部原始数据与情况单导出是不同范围。",
    "category": "数据与隐私",
    "keywords": [
      "导出",
      "数据",
      "下载",
      "拿出来"
    ],
    "aliases": [
      "怎么把数据拿出来",
      "下载我的数据",
      "数据备份"
    ],
    "conclusion": "如果要带去就医，在就医准备保存情况单 HTML。全部原始数据的导出范围请在隐私设置确认。",
    "steps": [
      "就医资料进入就医准备，核对后保存 HTML。",
      "需要全部原始数据时，先在隐私设置查看可用能力。",
      "没有对应入口时，可以反馈需要的导出范围。"
    ],
    "actions": [
      {
        "label": "去就医准备",
        "to": "/visit-summary"
      },
      {
        "label": "查看隐私设置",
        "to": "/settings/privacy"
      }
    ],
    "updatedAt": "2026-10-09",
    "status": "published",
    "priority": 85,
    "module": "trouble"
  },
  {
    "id": "delete-data",
    "title": "如何删除我的数据？",
    "summary": "先在原记录中检查删除入口；账户级删除暂不自动执行。",
    "category": "数据与隐私",
    "keywords": [
      "删除",
      "数据",
      "账号"
    ],
    "aliases": [
      "清空数据",
      "删掉所有东西"
    ],
    "conclusion": "单条记录可在对应页面处理；帮助中心不会自动执行账户级删除。",
    "steps": [
      "确认要删除的是单条记录、整条健康随记还是账户数据。",
      "单条内容请回到原页面操作。",
      "账户级请求请通过产品反馈说明范围。"
    ],
    "actions": [
      {
        "label": "查看隐私设置",
        "to": "/settings/privacy"
      },
      {
        "label": "反馈产品问题",
        "to": "/feedback?category=数据与隐私&page=帮助中心"
      }
    ],
    "relatedArticleIds": [
      "delete-record",
      "delete-health-event"
    ],
    "updatedAt": "2026-10-09",
    "status": "published",
    "priority": 75,
    "module": "trouble"
  },
  {
    "id": "no-diagnosis",
    "title": "Hoooho 会不会给出诊断？",
    "summary": "Hoooho 用于记录和整理信息，不提供诊断或用药建议。",
    "category": "数据与隐私",
    "keywords": [
      "诊断",
      "医疗建议",
      "用药"
    ],
    "aliases": [
      "能看病吗",
      "帮我诊断"
    ],
    "conclusion": "Hoooho 不提供疾病诊断、处方、剂量或停药建议。",
    "steps": [
      "记录当前情况和实际发生时间。",
      "整理已有检查与记录。",
      "如情况紧急，及时联系当地急救服务或专业医疗人员。"
    ],
    "actions": [
      {
        "label": "记录新情况",
        "to": "/health-events/new"
      },
      {
        "label": "查看健康随记",
        "to": "/health-events"
      }
    ],
    "updatedAt": "2026-10-09",
    "status": "published",
    "priority": 100,
    "module": "trouble"
  },
  {
    "id": "page-load-failed",
    "title": "页面加载失败或一直空白怎么办？",
    "summary": "检查网络和登录状态，刷新后仍失败可提交反馈。",
    "category": "故障排查",
    "keywords": [
      "页面",
      "加载",
      "空白",
      "失败",
      "网络"
    ],
    "aliases": [
      "页面什么都没有",
      "一直转圈",
      "打不开"
    ],
    "conclusion": "先排除网络和登录问题；持续失败时记录页面和非敏感错误码。",
    "steps": [
      "先保留未保存的内容，不要反复刷新。",
      "确认网络可用，检查页面提示。",
      "没有未保存内容时可重新进入，仍失败再反馈具体页面和提示。"
    ],
    "actions": [
      {
        "label": "反馈产品问题",
        "to": "/feedback?category=故障排查&page=帮助中心"
      }
    ],
    "relatedArticleIds": [
      "find"
    ],
    "updatedAt": "2026-10-09",
    "status": "published",
    "priority": 80,
    "module": "trouble"
  },
  {
    "id": "browser-compatibility",
    "title": "哪些浏览器可以使用 Hoooho？",
    "summary": "请使用较新的主流浏览器，并允许页面所需权限。",
    "category": "故障排查",
    "keywords": [
      "浏览器",
      "兼容",
      "微信"
    ],
    "aliases": [
      "微信里不能用",
      "浏览器不支持"
    ],
    "conclusion": "较新的主流浏览器通常可正常使用；内置浏览器的权限能力可能不同。",
    "steps": [
      "更新当前浏览器。",
      "检查浏览器权限设置。",
      "仍失败时换用系统浏览器并提交反馈。"
    ],
    "actions": [
      {
        "label": "反馈产品问题",
        "to": "/feedback?category=故障排查&page=帮助中心"
      }
    ],
    "updatedAt": "2026-10-09",
    "status": "published",
    "module": "trouble"
  }
]

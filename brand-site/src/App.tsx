import { useEffect, useRef, useState, type ReactNode } from "react";

import Ecosystem from "./Ecosystem";

type IconName =
  | "arrow"
  | "arrow-down"
  | "wallet"
  | "heart"
  | "flower"
  | "shield"
  | "people"
  | "leaf"
  | "plus"
  | "close"
  | "menu"
  | "check"
  | "search"
  | "chevron";

function Icon({
  name,
  size = 20,
  className = "",
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  const paths: Record<IconName, ReactNode> = {
    arrow: <path d="M5 19 19 5M5 5h14v14" />,
    "arrow-down": <path d="M12 4v16m-6-6 6 6 6-6" />,
    wallet: (
      <>
        <path d="M20 8V5a2 2 0 0 0-2-2L5 5a3 3 0 0 0-2 3v11a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1H6a2 2 0 0 1-1-3" />
        <path d="M21 12h-5v5h5m-3-2.5h.01" />
      </>
    ),
    heart: (
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
    ),
    flower: (
      <>
        <path d="M12 9c-7-11-15 1-5 4-12 5-1 14 4 5 3 11 15 3 7-4 11-3 3-15-6-5Z" />
        <circle cx="12" cy="13" r="2.5" />
      </>
    ),
    shield: (
      <>
        <path d="m12 3 9 4v5c0 5-9 10-9 10S3 17 3 12V7l9-4Z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    people: (
      <>
        <circle cx="9" cy="7" r="3" />
        <path d="M3 21v-3a6 6 0 0 1 12 0v3m0-17a3 3 0 0 1 0 6m3 4a5 5 0 0 1 3 5v2" />
      </>
    ),
    leaf: (
      <>
        <path d="M20 3C6 2 1 7 4 14c3 8 16 6 16-11Z" />
        <path d="M4 21c0-6 7-11 11-13" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    check: <path d="m5 12 4 4L19 6" />,
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5" />
      </>
    ),
    chevron: <path d="m9 5 7 7-7 7" />,
  };
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="38"
      height="38"
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M20 8C10-6-6 10 8 20C-6 30 10 46 20 32C30 46 46 30 32 20C46 10 30-6 20 8Z"
        fill="currentColor"
      />
      <path d="M16 20h8m-4-4v8" stroke="var(--paper)" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function Brand({ light = false }: { light?: boolean }) {
  return (
    <a className={`brand ${light ? "brand-light" : ""}`} href="/" aria-label="护护 Hoooho 首页">
      <BrandMark />
      <span className="brand-word">
        hoooho<span className="brand-period">.</span>
      </span>
      <span className="brand-chinese">护护</span>
    </a>
  );
}

const walletAssets = "/family-site/card-assets";
const productAssets = "/family-site/make-media";

const products = [
  {
    id: "cards",
    name: "护护证件卡包",
    english: "Hoooho Cards",
    category: "家庭资料",
    description: "按家人整理身份证、护照和银行卡。",
    detail: "办事时取用副本，出行前检查有效期。",
    icon: "wallet" as const,
    image: `${walletAssets}/wallet-icon.webp`,
    className: "sage",
  },
  {
    id: "health",
    name: "护护记录",
    english: "Hoooho Records",
    category: "健康照护",
    description: "记下孩子的症状、用药和后续变化。",
    detail: "就医前，把经过整理成医生能看的记录。",
    icon: "heart" as const,
    image: `${productAssets}/records-icon.webp`,
    className: "peach",
  },
  {
    id: "moments",
    name: "护护陪玩",
    english: "Hoooho Play",
    category: "亲子陪伴",
    description: "用家里现有的材料，挑一个适龄玩法。",
    detail: "跟着步骤和安全提示，一起动手玩。",
    icon: "flower" as const,
    className: "butter",
  },
];

function WalletArt({ large = false }: { large?: boolean }) {
  if (large) {
    return (
      <div className="wallet-screen-art">
        <div className="wallet-screen-frame">
          <img src={`${walletAssets}/feature-family.webp`} width="320" height="695"
            alt="卡包的家庭成员视图：按人切换，在出行分类下查看护照和通行证。" />
        </div>
        <img className="screen-companion" src={`${walletAssets}/organizer.webp`} width="288" height="288" alt="" />
      </div>
    );
  }
  return (
    <div className="wallet-art" aria-hidden="true">
      <div className="wallet-document doc-back">
        <span>PASSPORT</span>
        <div className="passport-emblem"><Icon name="flower" size={26} /></div>
      </div>
      <div className="wallet-document doc-front">
        <span>HOOOHO CARDS</span>
        <div className="document-lines"><i /><i /><i /></div>
        <div className="portrait"><i /></div>
      </div>
      <div className="wallet-body">
        <div className="wallet-stitch" />
        <span className="wallet-wordmark">护护<br />证件卡包</span>
        <img className="wallet-companion" src={`${walletAssets}/organizer.webp`} width="288" height="288" alt="" />
        <span className="wallet-logo">hoooho.</span>
        <div className="wallet-tab"><span /></div>
      </div>
    </div>
  );
}

function HealthArt() {
  return (
    <div className="health-art" aria-hidden="true">
      <div className="health-book">
        <div className="book-spine" />
        <span className="book-eyebrow">HOOOHO RECORDS</span>
        <img className="book-app-mark" src={`${productAssets}/records-icon.webp`} width="512" height="512" alt="" />
        <span className="book-title">儿童健康<br />记录手册</span>
        <span className="book-brand">hoooho.</span>
      </div>
      <div className="health-note records-note">
        <span className="note-dot" /><span>就医准备</span>
        <strong>症状经过</strong>
        <i /><i />
      </div>
      <div className="health-ball" />
    </div>
  );
}

function MomentsArt() {
  return (
    <div className="moments-art" aria-hidden="true">
      <div className="moment-photo photo-back" />
      <div className="moment-photo photo-front">
        <div className="moment-picture play-picture">
          <img src={`${productAssets}/play-scene.webp`} width="370" height="181" alt="" />
        </div>
        <span>软球快递站</span>
        <small>HOOOHO PLAY</small>
      </div>
      <div className="moment-flower"><BrandMark /><div /></div>
      <span className="moment-sticker">亲子<br />玩法卡</span>
    </div>
  );
}

function Header({ detail = false }: { detail?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const header = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const clickAway = (event: PointerEvent) => {
      if (!header.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMenuOpen(false); toggle.current?.focus(); }
    };
    document.addEventListener("pointerdown", clickAway);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", clickAway);
      document.removeEventListener("keydown", escape);
    };
  }, [menuOpen]);
  useEffect(() => {
    const close = () => setMenuOpen(false);
    window.addEventListener("hashchange", close);
    return () => window.removeEventListener("hashchange", close);
  }, []);
  return (
    <header className="site-header" ref={header}>
      <div className="header-inner container">
        <Brand />
        <nav className={`main-nav ${menuOpen ? "is-open" : ""}`} aria-label="主导航">
          <a
            href="/#apps"
            onClick={() => setMenuOpen(false)}
            className={!detail ? "nav-featured" : ""}
          >
            旗下 App
            <span className="nav-dot" />
          </a>
          <a href="/#about" onClick={() => setMenuOpen(false)}>
            护护的想法
          </a>
          <a href="/#faq" onClick={() => setMenuOpen(false)}>
            常见问题
          </a>
        </nav>
        <a className="header-cta" href="/#apps">
          发现小美好
          <Icon name="arrow" size={15} />
        </a>
        <button
          ref={toggle}
          className="mobile-menu icon-button"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={menuOpen ? "关闭导航" : "打开导航"}
          aria-expanded={menuOpen}
        >
          <Icon name={menuOpen ? "close" : "menu"} size={24} />
        </button>
      </div>
      {menuOpen && <nav className="header-shortcuts" aria-label="更多入口">
        <a href="/id-cards">护护证件卡包</a>
        <a href="/id-cards/support">技术支持</a>
        <a href="/id-cards/privacy">隐私政策</a>
      </nav>}
    </header>
  );
}

function Hero() {
  return (
    <section className="hero container" aria-labelledby="hero-title">
      <div className="hero-copy">
        <div className="eyebrow">
          <span className="tiny-sun" /> SMALL APPS. BIG CARE.
        </div>
        <h1 id="hero-title">
          把小事收好，
          <br />
          <span>把生活过好。</span>
        </h1>
        <p className="hero-description">
          一些简单、贴心的 App，照顾家庭日常的方方面面。
          <br className="desktop-break" />
          让琐碎有处安放，让陪伴多一点。
        </p>
        <a className="button button-primary" href="/#apps">
          找到你的那一款
          <Icon name="arrow" size={17} />
        </a>
        <div className="hero-footnote">
          <span className="small-line" /> 为每一个你，和你在意的人。
        </div>
      </div>
      <div className="hero-visual">
        <div className="hero-photo">
          <img
            src="/family-site/make-media/everyday-care.webp"
            alt="陶土色的小屋、相依的家人木偶和绿植，组成温暖的家庭日常静物"
            fetchPriority="high"
          />
        </div>
        <div className="round-seal">
          <svg viewBox="0 0 100 100" width="100" height="100" aria-hidden="true">
            <defs>
              <path id="seal-circle" d="M50,50m-35,0a35,35 0 1,1 70,0a35,35 0 1,1-70,0" />
            </defs>
            <text>
              <textPath href="#seal-circle" textLength="215" lengthAdjust="spacing">
                A LITTLE CARE · EVERY DAY ·{" "}
              </textPath>
            </text>
          </svg>
          <BrandMark />
        </div>
        <div className="photo-caption">
          <span className="caption-icon">
            <Icon name="heart" size={22} />
          </span>
          <div>
            <strong>在一起，就是好日常。</strong>
            <span>Made for you. Made for family.</span>
          </div>
        </div>
        <span className="photo-index">01 — THE EVERYDAY COLLECTION</span>
      </div>
    </section>
  );
}

const values = [
  { icon: "people" as const, title: "从一个人，到一家人", text: "把每一位家人，都放在心上" },
  { icon: "leaf" as const, title: "简单一点，刚刚好", text: "没有复杂操作，只有贴心日常" },
  { icon: "shield" as const, title: "你的生活，由你掌握", text: "认真对待每一份信任与隐私" },
];

function Values() {
  return (
    <div className="values container">
      {values.map((value) => (
        <div className="value" key={value.title}>
          <span className="value-icon">
            <Icon name={value.icon} size={24} />
          </span>
          <div>
            <h3>{value.title}</h3>
            <p>{value.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

type ModalKind = "health" | "moments" | "privacy" | null;

function AppCollection({ onPreview }: { onPreview: (kind: ModalKind) => void }) {
  const [filter, setFilter] = useState("全部 App");
  const categories = ["全部 App", "家庭资料", "健康照护", "亲子陪伴"];
  const visible = filter === "全部 App" ? products : products.filter((p) => p.category === filter);
  return (
    <section className="apps-section container" id="apps" aria-labelledby="apps-title">
      <div className="section-heading">
        <div>
          <div className="eyebrow section-eyebrow">THE HOOOHO FAMILY</div>
          <h2 id="apps-title">日常的每一面，都有照顾。</h2>
        </div>
        <span className="section-side-note">
          各有所长，一样贴心。<span>为真实生活而做的 App 家族</span>
        </span>
      </div>
      <div className="collection-toolbar">
        <div className="category-tabs" role="tablist" aria-label="按 App 类别筛选">
          {categories.map((category) => (
            <button
              key={category}
              role="tab"
              aria-selected={filter === category}
              className={filter === category ? "active" : ""}
              onClick={() => setFilter(category)}
            >
              {category}
              {category === "全部 App" && <span>03</span>}
            </button>
          ))}
        </div>
        <span className="collection-count">
          精心打磨，慢慢生长
          <Icon name="leaf" size={15} />
        </span>
      </div>
      <div className="app-grid" aria-live="polite">
        {visible.map((product) => (
          <article className={`app-card ${product.className}`} key={product.id}>
            <a
              className="app-art-link"
              href={product.id === "cards" ? "/id-cards" : undefined}
              onClick={
                product.id !== "cards"
                  ? (event) => {
                      event.preventDefault();
                      onPreview(product.id as ModalKind);
                    }
                  : undefined
              }
              role={product.id !== "cards" ? "button" : undefined}
              tabIndex={product.id !== "cards" ? 0 : undefined}
              onKeyDown={
                product.id !== "cards"
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onPreview(product.id as ModalKind);
                      }
                    }
                  : undefined
              }
              aria-label={`了解${product.name}`}
            >
              <div className="app-art">
                <div className="art-topline">
                  <span className="app-icon">
                    {product.image ? (
                      <img className="product-icon-image" src={product.image} alt="" width="40" height="40" />
                    ) : <Icon name={product.icon} size={22} />}
                  </span>
                  <span className={`status-label ${product.id === "cards" ? "status-live" : ""}`}>
                    <i />
                    {product.id === "cards" ? "产品介绍" : "筹备中"}
                  </span>
                </div>
                {product.id === "cards" ? (
                  <WalletArt />
                ) : product.id === "health" ? (
                  <HealthArt />
                ) : (
                  <MomentsArt />
                )}
                <span className="art-category">{product.category}</span>
              </div>
            </a>
            <div className="app-card-content">
              <div className="app-name-row">
                <h3>{product.name}</h3>
                <span>{product.english}</span>
              </div>
              <p>
                {product.description}
                <br />
                {product.detail}
              </p>
              {product.id === "cards" ? (
                <a className="app-text-link" href="/id-cards">
                  认识证件卡包
                  <Icon name="arrow" size={16} />
                </a>
              ) : (
                <button
                  className="app-text-link"
                  onClick={() => onPreview(product.id as ModalKind)}
                >
                  先认识一下
                  <Icon name="arrow" size={16} />
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      <div className="collection-bottom">
        <span className="small-dot" />
        <p>不必一次拥有全部，先从生活里的一件小事开始。</p>
        <BrandMark />
      </div>
    </section>
  );
}

function About() {
  return (
    <section className="about-section" id="about" aria-labelledby="about-title">
      <div className="about-inner container">
        <div className="about-copy">
          <div className="eyebrow">A LITTLE THOUGHT FROM US</div>
          <h2 id="about-title">
            工具可以很小，
            <br />
            在意可以很多<span>。</span>
          </h2>
          <p>
            我们相信，好的 App 不必占据生活。
            <br />
            它只需在你需要时出现，把一件小事做好，
            <br />
            然后，把时间还给你和家人。
          </p>
          <div className="about-signature">
            <BrandMark />
            <span>少一点操心，多一点在一起。</span>
          </div>
        </div>
        <div className="about-principles">
          {[
            {
              n: "01",
              title: "从真实的小事出发",
              text: "找不到的证件、忘记的变化、转眼即逝的成长。每一款 App，都源于一个熟悉的生活瞬间。",
            },
            {
              n: "02",
              title: "不打扰，也不将就",
              text: "安静、清晰、恰好够用。少一些不必要的功能，多一些顺手的小细节。",
            },
            {
              n: "03",
              title: "慢慢做，一直在",
              text: "不追逐热闹，认真打磨每一个日常。和我们的 App 一起，让照顾成为长久的习惯。",
            },
          ].map((item) => (
            <div className="principle" key={item.n}>
              <span>{item.n}</span>
              <div>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <Ecosystem />
    </section>
  );
}

const faqs = [
  {
    question: "护护是一个 App，还是一个品牌？",
    answer:
      "护护 Hoooho 是一个围绕家庭日常的 App 品牌。旗下每款 App 专注于一件事：证件整理、健康记录或亲子陪伴。你可以根据自己的需要，选择其中一款，不必安装全部。",
  },
  {
    question: "我需要同时使用所有护护 App 吗？",
    answer:
      "不需要。每个 App 都是独立的工具，各有所长。你可以先从当下最需要解决的一件小事开始，例如用证件卡包整理全家人的证件。",
  },
  {
    question: "护护会如何对待我的隐私？",
    answer:
      "隐私是产品设计需要认真对待的一部分。本官网不要求注册，也不会收集你的证件、健康或儿童资料。各 App 的存储方式、权限及数据处理规则，请以正式发布时的产品隐私政策为准。",
  },
  {
    question: "在哪里可以了解新 App 的进展？",
    answer:
      "你可以在这里的「旗下 App」查看各产品的状态。证件卡包已开放产品介绍，护护记录和护护陪玩的官网进展也会在这里更新。",
  },
];

function FAQ({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState<number | null>(0);
  const items = compact
    ? [
        {
          question: "可以整理哪些类型的证件？",
          answer:
            "证件卡包的设计覆盖身份证、银行卡和护照等常用资料，并按家人分别整理。你可以在上方的交互演示里，切换家人和证件类型，体验整理方式。",
        },
        {
          question: "这里的证件资料是真实的吗？",
          answer:
            "不是。此页面的姓名和号码均为虚构演示资料，不会上传或保存任何真实证件。正式 App 的功能及数据处理方式，以发布版本和产品隐私政策为准。",
        },
        {
          question: "在哪里下载证件卡包？",
          answer:
            "当前网站提供产品介绍与交互演示，下载入口仍在准备中。正式开放后，我们会在本页更新经过确认的官方渠道。",
        },
      ]
    : faqs;
  return (
    <section
      className="faq-section container"
      id={compact ? "product-faq" : "faq"}
      aria-labelledby="faq-title"
    >
      <div className="faq-heading">
        <div className="eyebrow">A FEW LITTLE ANSWERS</div>
        <h2 id="faq-title">你也许想知道。</h2>
        <p>关于{compact ? "证件卡包" : "护护"}，再多聊一点。</p>
        <span className="faq-decoration">
          <Icon name="heart" size={56} />
        </span>
      </div>
      <div className="faq-list">
        {items.map((item, index) => (
          <div className={`faq-item ${open === index ? "is-open" : ""}`} key={item.question}>
            <h3>
              <button
                onClick={() => setOpen(open === index ? null : index)}
                aria-expanded={open === index}
                aria-controls={`faq-answer-${index}`}
              >
                <span>{item.question}</span>
                <Icon name="plus" size={18} />
              </button>
            </h3>
            <div className="faq-answer" id={`faq-answer-${index}`} hidden={open !== index}>
              <p>{item.answer}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Footer({ onPrivacy }: { onPrivacy: () => void }) {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-main">
          <div>
            <Brand />
            <p>好好生活，慢慢护护。</p>
          </div>
          <div className="footer-navigation">
            <div>
              <span>探索护护</span>
              <a href="/#apps">旗下 App</a>
              <a href="/#about">我们的想法</a>
            </div>
            <div>
              <span>多一点了解</span>
              <a href="/#faq">常见问题</a>
              <a href="/id-cards/support">卡包技术支持</a>
              <a href="/id-cards/privacy">卡包隐私政策</a>
              <button onClick={onPrivacy}>
                隐私与安全
                <Icon name="arrow" size={12} />
              </button>
            </div>
          </div>
          <a className="back-top" href="#main-content" aria-label="回到顶部">
            <Icon name="arrow-down" size={20} />
          </a>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Hoooho 护护</span>
          <span>
            Made with care, for everyday life.
            <span className="small-dot" />
          </span>
        </div>
      </div>
    </footer>
  );
}

const family = [
  {
    name: "林悦",
    short: "悦",
    role: "我自己",
    color: "member-orange",
    numbers: { 身份证: "DEMO-ID-0826", 银行卡: "DEMO-CARD-3105", 护照: "DEMO-PASS-3816" },
  },
  {
    name: "陈川",
    short: "川",
    role: "家人",
    color: "member-sage",
    numbers: { 身份证: "DEMO-ID-0618", 银行卡: "DEMO-CARD-6672", 护照: "DEMO-PASS-1208" },
  },
  {
    name: "小满",
    short: "满",
    role: "孩子",
    color: "member-yellow",
    numbers: { 身份证: "DEMO-ID-0521", 银行卡: "DEMO-CARD-4082", 护照: "DEMO-PASS-2137" },
  },
];

function CardDemo() {
  const [member, setMember] = useState(0);
  const [category, setCategory] = useState<keyof typeof family[number]["numbers"]>("身份证");
  const [revealed, setRevealed] = useState(false);
  const [search, setSearch] = useState("");
  const person = family[member];
  const number = person.numbers[category];
  const matches = `${person.name} ${person.role} ${category} ${number.slice(-4)}`.includes(search.trim());
  return (
    <section className="demo-section container" id="card-demo" aria-labelledby="demo-title">
      <div className="section-heading">
        <div>
          <div className="eyebrow">A PLACE FOR EVERYTHING</div>
          <h2 id="demo-title">打开卡包，就能找到。</h2>
        </div>
        <p className="demo-intro">
          试着切换家人和证件类型。
          <br />
          点「查看号码」，可以查看虚构的演示号码。
        </p>
      </div>
      <div className="demo-layout">
        <div className="demo-window">
          <div className="demo-window-bar">
            <span />
            <span />
            <span />
            <span className="demo-window-label">护护证件卡包 · 交互演示</span>
            <Icon name="shield" size={15} />
          </div>
          <div className="demo-app">
            <div className="demo-app-heading">
              <div>
                <span className="eyebrow">FAMILY WALLET</span>
                <h3>家人的证件</h3>
              </div>
              <span className="demo-logo">
                <img className="product-icon-image" src={`${walletAssets}/wallet-icon.webp`} width="40" height="40" alt="" />
              </span>
            </div>
            <div className="family-tabs" aria-label="选择家人">
              {family.map((item, index) => (
                <button
                  key={item.name}
                  onClick={() => { setMember(index); setRevealed(false); }}
                  className={member === index ? "selected" : ""}
                  aria-pressed={member === index}
                >
                  <span className={`family-avatar ${item.color}`}>{item.short}</span>
                  <span>
                    {item.name}
                    <small>{item.role}</small>
                  </span>
                  {member === index && <Icon name="check" size={14} />}
                </button>
              ))}
            </div>
            <div className="demo-controls">
              <div className="document-tabs" aria-label="证件类型">
                {(["身份证", "银行卡", "护照"] as const).map((tab) => (
                  <button
                    key={tab}
                    className={category === tab ? "selected" : ""}
                    onClick={() => { setCategory(tab); setRevealed(false); }}
                    aria-pressed={category === tab}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <label className="demo-search">
                <Icon name="search" size={15} />
                <input
                  value={search}
                  onChange={(event) => { setSearch(event.target.value); setRevealed(false); }}
                  placeholder="找一张证件"
                  aria-label="搜索演示证件"
                />
              </label>
            </div>
            {matches ? (
              <div
                className={`demo-id-card ${category === "银行卡" ? "bank-card" : category === "护照" ? "passport-card" : ""}`}
              >
                <div className="demo-card-top">
                  <span>
                    {category === "银行卡"
                      ? "FAMILY BANK CARD"
                      : category === "护照"
                        ? "FAMILY PASSPORT"
                        : "FAMILY IDENTITY CARD"}
                  </span>
                  <Icon name={category === "银行卡" ? "wallet" : "shield"} size={20} />
                </div>
                <div className="demo-card-body">
                  <div>
                    <small>{category}</small>
                    <h4>{person.name}</h4>
                    <p className="sample-number" aria-live="polite">{revealed ? number : `••••  ••••  ${number.slice(-4)}`}</p>
                  </div>
                  <div className={`demo-portrait ${person.color}`}>
                    <Icon name="people" size={44} />
                  </div>
                </div>
                <div className="demo-card-bottom">
                  <button className="number-toggle" type="button" aria-pressed={revealed} onClick={() => setRevealed(!revealed)}>
                    {revealed ? "遮挡号码" : "查看号码"}
                  </button>
                  <strong>hoooho.</strong>
                </div>
              </div>
            ) : (
              <div className="demo-empty">
                <Icon name="search" size={30} />
                <strong>暂时没有找到这张证件</strong>
                <p>
                  试试搜索「{person.name}」或「{category}」。
                </p>
                <button onClick={() => setSearch("")}>清空搜索</button>
              </div>
            )}
            <span className="demo-disclaimer">
              <Icon name="shield" size={13} />
              仅为交互演示，所有资料均为虚构
            </span>
          </div>
        </div>
        <div className="demo-features">
          {[
            {
              n: "01",
              title: "按家人取用证件",
              text: "先选持有人，再选身份证、银行卡或护照。列表默认只露出号码尾号。",
              icon: "people" as const,
            },
            {
              n: "02",
              title: "出发前，看一眼有效期",
              text: "在 App 的「有效期」里选家人和月份，查看已填写到期日的证件。",
              icon: "wallet" as const,
            },
            {
              n: "03",
              title: "分享前，先核对副本",
              text: "在 App 的导出预览中选择页面，核对遮挡范围和用途水印，再分享。",
              icon: "shield" as const,
            },
          ].map((item) => (
            <div className="demo-feature" key={item.n}>
              <span className="demo-feature-icon">
                <Icon name={item.icon} size={23} />
              </span>
              <div>
                <small>{item.n}</small>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProductPage() {
  return (
    <main className="product-page">
      <section className="product-hero container">
        <a className="breadcrumb" href="/#apps">
          护护 App 家族
          <Icon name="chevron" size={12} />
          <span>证件卡包</span>
        </a>
        <div className="product-hero-grid">
          <div className="product-hero-copy">
            <div className="product-name">
              <span className="app-icon">
                <img className="product-icon-image" src={`${walletAssets}/wallet-icon.webp`} width="40" height="40" alt="" />
              </span>
              <span>
                护护证件卡包<small>HOOOHO CARDS</small>
              </span>
            </div>
            <h1>
              全家的证件，
              <br />
              心里有<span>「数」</span>。
            </h1>
            <p>
              把一家人的身份证、护照和银行卡按人收好。
              <br />
              出发前查有效期，办事时按需导出副本。
            </p>
            <div className="product-hero-actions">
              <a className="button button-primary" href="#card-demo">
                打开卡包，体验一下
                <Icon name="arrow" size={17} />
              </a>
              <a className="simple-link" href="#product-faq">
                使用小问答
                <Icon name="arrow-down" size={15} />
              </a>
            </div>
            <span className="product-note">
              <Icon name="shield" size={14} /> 敏感号码默认遮挡，查看原件时按提示验证。
            </span>
          </div>
          <div className="product-hero-art sage">
            <div className="product-art-caption">
              <span>
                HOOOHO CARDS
                <br />
                FAMILY WALLET
              </span>
              <BrandMark />
            </div>
            <WalletArt large />
            <span className="product-art-bottom">卡包界面 · 家庭成员与证件分类</span>
          </div>
        </div>
      </section>
      <CardDemo />
      <section className="product-quote container">
        <BrandMark />
        <h2>
          证件收好了，
          <br className="mobile-only" />
          生活就从容了一点。
        </h2>
        <p>从整理家人的第一张证件开始，把安心慢慢装满。</p>
        <a href="/#apps" className="simple-link">
          看看护护的其他 App
          <Icon name="arrow" size={15} />
        </a>
      </section>
      <FAQ compact />
    </main>
  );
}

function InfoDialog({ kind, onClose }: { kind: Exclude<ModalKind, null>; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const product = products.find((p) => p.id === kind);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previous;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`info-dialog ${product?.className || ""}`}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      aria-labelledby="dialog-title"
    >
      <button className="dialog-close icon-button" onClick={onClose} aria-label="关闭">
        <Icon name="close" size={21} />
      </button>
      {kind === "privacy" ? (
        <div className="privacy-dialog">
          <span className="dialog-icon">
            <Icon name="shield" size={30} />
          </span>
          <div className="eyebrow">YOUR TRUST MATTERS</div>
          <h2 id="dialog-title">认真对待每一份信任。</h2>
          <p>家庭日常很珍贵，与你有关的资料也是。</p>
          <h3>在这个官网</h3>
          <p>
            你不需要注册账户，也不需要提供证件、健康或儿童资料。页面中的证件示例均为虚构，交互演示不会保存或上传你的输入。
          </p>
          <h3>在护护的 App 里</h3>
          <p>
            卡包内的证件资料在本机加密保存。关于账号关联、资料导出和删除，请查看<a href="/id-cards/privacy">护护证件卡包隐私政策</a>。
          </p>
          <button className="button button-primary" onClick={onClose}>
            我知道了
            <Icon name="check" size={17} />
          </button>
        </div>
      ) : (
        <>
          <div className="dialog-art">
            {kind === "health" ? <HealthArt /> : (
              <div className="play-product-preview">
                <img src={`${productAssets}/play-screen.webp`} width="408" height="900" alt="护护陪玩玩法详情示例：软球快递站，包含适龄提示、准备材料与玩法步骤。" />
              </div>
            )}
          </div>
          <div className="dialog-content">
            <span className="dialog-coming">
              <span className="small-dot" />
              产品筹备中
            </span>
            <h2 id="dialog-title">{product?.name}</h2>
            <p>
              {product?.description}
              <br />
              {product?.detail}
            </p>
            <div className="coming-note">
              <Icon name="leaf" size={21} />
              <p>
                {kind === "health"
                  ? "一次就医可以从几个细节说起：哪天开始不舒服、当时用了什么、后来有什么变化。"
                  : "例如「软球快递站」：家长和孩子坐在地上互相滚球，一起试试接住和送出软球。"}
              </p>
            </div>
            <button className="button button-dark" onClick={onClose}>
              返回 App 家族
              <Icon name="heart" size={17} />
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}

export default function App({ page }: { page: "home" | "cards" }) {
  const [modal, setModal] = useState<ModalKind>(null);
  useEffect(() => {
    // Older shared demo URLs used a hash-based product route.
    const legacy = /^#\/apps\/cards(?:\/(card-demo|product-faq|main-content))?\/?$/.exec(location.hash);
    if (page === "home" && legacy) {
      location.replace("/id-cards" + (legacy[1] ? "#" + legacy[1] : ""));
    }
  }, [page]);
  return (
    <>
      <a
        href="#main-content"
        className="skip-link"
      >
        跳至主要内容
      </a>
      <Header detail={page === "cards"} />
      <div id="main-content">
        {page === "cards" ? (
          <ProductPage />
        ) : (
          <main>
            <Hero />
            <Values />
            <AppCollection onPreview={setModal} />
            <About />
            <FAQ />
          </main>
        )}
      </div>
      <Footer onPrivacy={() => setModal("privacy")} />
      {modal && <InfoDialog kind={modal} onClose={() => setModal(null)} />}
    </>
  );
}

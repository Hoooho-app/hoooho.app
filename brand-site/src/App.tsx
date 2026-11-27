import { useEffect, useRef, useState, type ReactNode } from "react";

import Ecosystem from "./Ecosystem";
import { projectIdeas } from "./project-ideas";

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

function Brand({ cards = false }: { cards?: boolean }) {
  return (
    <a className="brand" href={cards ? "/id-cards" : "/"} aria-label={cards ? "护护证件卡包产品首页" : "护护 Hoooho 首页"}>
      <BrandMark />
      <span className="brand-word">
        hoooho<span className="brand-period">.</span>
      </span>
      <span className="brand-chinese">{cards ? "证件卡包" : "护护"}</span>
    </a>
  );
}

const walletAssets = "/family-site/card-assets";
const productAssets = "/family-site/make-media";

type Product = {
  id: "cards" | "health" | "moments" | number;
  name: string;
  category: string;
  description: string;
  english?: string;
  detail?: string;
  icon?: IconName;
  image?: string;
  href?: string;
  className?: string;
};

const products: Product[] = [
  {
    id: "cards",
    href: "/id-cards",
    name: "护护证件卡包",
    english: "Hoooho Cards",
    category: "家庭资料",
    description: "按家人整理身份证、护照和银行卡。",
    detail: "办事时取用副本，出行前检查有效期。",
    icon: "wallet",
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
    icon: "heart",
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
    icon: "flower",
    className: "butter",
  },
  ...projectIdeas,
];
const allProducts = "全部 App";
const categories = [allProducts, ...new Set(products.map(product => product.category))];

function WalletArt({ large = false }: { large?: boolean }) {
  if (large) {
    return (
      <div className="wallet-screen-art">
        <div className="wallet-screen-frame">
          <img src={`${walletAssets}/feature-family.webp`} width="320" height="695"
            alt="卡包的家庭成员视图：按人切换，在出行分类下查看护照和通行证。" />
        </div>
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
  const navLinks = detail
    ? [["产品介绍", "/id-cards"], ["技术支持", "/id-cards/support"], ["隐私政策", "/id-cards/privacy"]]
    : [["旗下 App", "/#apps"], ["护护的想法", "/#about"], ["常见问题", "/#faq"]];
  const header = useRef<HTMLElement>(null);
  const navigation = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    if (window.matchMedia("(max-width: 580px)").matches && document.activeElement === toggle.current) {
      navigation.current?.querySelector("a")?.focus();
    }
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
        <Brand cards={detail} />
        <nav ref={navigation} className={`main-nav ${menuOpen ? "is-open" : ""}`} aria-label={detail ? "卡包导航" : "护护导航"}>
          {navLinks.map(([name, href], index) => (
            <a key={href} href={href} onClick={() => setMenuOpen(false)}
              className={index === 0 ? "nav-featured" : undefined}
              aria-current={detail && index === 0 ? "page" : undefined}>
              {name}{index === 0 && <span className="nav-dot" />}
            </a>
          ))}
        </nav>
        <a className="header-cta" href={detail ? "/" : "/#apps"}>
          {detail ? "护护品牌首页" : "发现小美好"}
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
      {menuOpen && <nav className="header-shortcuts" aria-label="更多入口" onClick={() => setMenuOpen(false)}>
        {detail ? <>
          <a href="#product-faq">卡包常见问题</a>
          <a href="/">护护品牌首页</a>
        </> : <>
          <a href="/id-cards">护护证件卡包</a>
          <a href="/#ecosystem">家庭产品方向</a>
        </>}
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

function AppCollection() {
  const [filter, setFilter] = useState(allProducts);
  const visible = filter === allProducts ? products : products.filter((product) => product.category === filter);
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
              {category === allProducts && <span>{products.length}</span>}
            </button>
          ))}
        </div>
        <span className="collection-count">
          精心打磨，慢慢生长
          <Icon name="leaf" size={15} />
        </span>
      </div>
      <div className="app-grid" aria-live="polite">
        {visible.map((product) => {
          const ArtFrame = product.href ? "a" : "div";
          return (
            <article className={`app-card ${product.className ?? "idea-card"} ${product.href ? "app-available" : "app-upcoming"}`} key={product.id}>
              <ArtFrame
                className={product.href ? "app-art app-art-link" : "app-art"}
                href={product.href}
                aria-label={product.href ? `了解${product.name}` : undefined}
              >
                <div className="art-topline">
                  {product.icon && <span className="app-icon">
                    {product.image ? (
                      <img className="product-icon-image" src={product.image} alt="" width="40" height="40" />
                    ) : <Icon name={product.icon} size={22} />}
                  </span>}
                  <span className={`status-label ${product.href ? "status-live" : ""}`}>
                    <i />
                    {product.href ? "产品介绍" : "Coming Soon"}
                  </span>
                </div>
                {typeof product.id === "number" ? (
                  <img className="idea-illustration" src={`/family-site/project-art/idea-${product.id}.webp`}
                    alt="" loading="lazy" decoding="async" />
                ) : product.id === "cards" ? (
                  <WalletArt />
                ) : product.id === "health" ? (
                  <HealthArt />
                ) : (
                  <MomentsArt />
                )}
                <span className="art-category">{product.category}</span>
              </ArtFrame>
              <div className="app-card-content">
                <div className="app-name-row">
                  <h3>{product.name}</h3>
                  {product.english && <span>{product.english}</span>}
                </div>
                <p>
                  {product.description}
                  {product.detail && <><br />{product.detail}</>}
                </p>
                {product.href && (
                  <a className="app-text-link" href={product.href}>
                    认识证件卡包
                    <Icon name="arrow" size={16} />
                  </a>
                )}
              </div>
            </article>
          );
        })}
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
      "护护 Hoooho 是一个围绕家庭日常的 App 品牌。每款产品专注于一件具体的事，从整理家人的证件、票据，到记录孩子的成长。",
  },
  {
    question: "我需要同时使用所有护护 App 吗？",
    answer:
      "不需要。每个 App 都是独立的工具，各有所长。你可以先从当下最需要解决的一件小事开始，例如用证件卡包整理全家人的证件。",
  },
  {
    question: "浏览官网需要注册吗？",
    answer:
      "你可以直接浏览官网，了解护护旗下的产品。浏览时无需注册账号或填写家人的资料。",
  },
  {
    question: "在哪里可以了解新 App 的进展？",
    answer:
      "在「旗下 App」可以查看每个项目的状态。护护证件卡包已开放产品介绍，标有 Coming Soon 的项目还在筹备中。",
  },
];

function FAQ({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState<number | null>(0);
  const items = compact
    ? [
        {
          question: "可以整理哪些类型的证件？",
          answer:
            "可以按家人整理身份证、银行卡和护照等常用资料。展开「试用证件查找」，可以切换家人、筛选证件和搜索尾号。",
        },
        {
          question: "这里的证件资料是真实的吗？",
          answer:
            "页面展示卡包的 iPhone 运行界面。查找示例中的姓名和号码为虚构资料，你输入的搜索内容仅用于本页筛选。",
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

function Footer({ cards }: { cards: boolean }) {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-main">
          <div>
            <Brand cards={cards} />
            <p>好好生活，慢慢护护。</p>
          </div>
          <nav className="footer-navigation" aria-label={cards ? "卡包页脚导航" : "护护页脚导航"}>
            {cards ? <>
              <div>
                <span>证件卡包</span>
                <a href="/id-cards">产品介绍</a>
                <a href="#product-faq">常见问题</a>
              </div>
              <div>
                <span>卡包服务</span>
                <a href="/id-cards/support">技术支持</a>
                <a href="/id-cards/privacy">隐私政策</a>
              </div>
            </> : <>
              <div>
                <span>探索护护</span>
                <a href="/#apps">旗下 App</a>
                <a href="/#about">我们的想法</a>
                <a href="/#faq">常见问题</a>
              </div>
              <div>
                <span>旗下产品</span>
                <a href="/id-cards">护护证件卡包</a>
                <a href="/#ecosystem">家庭产品方向</a>
              </div>
            </>}
          </nav>
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

const walletScreens = [
  {
    tab: "证件",
    file: "feature-family.webp",
    alt: "证件页的出行分类中，护照和港澳通行证按两列排列，仅显示号码尾号。",
  },
  {
    tab: "取用",
    file: "feature-folder.webp",
    alt: "取用页的「我的证件夹」中，家庭出游文件夹收有两份证件。",
  },
];

function WalletScreenGallery() {
  const [active, setActive] = useState(0);
  const screen = walletScreens[active];
  return (
    <figure className="wallet-gallery">
      <div className="wallet-gallery-switch" role="group" aria-label="选择卡包实机界面">
        {walletScreens.map((item, index) => (
          <button key={item.tab} type="button" aria-pressed={active === index}
            onClick={() => setActive(index)}>{item.tab}</button>
        ))}
      </div>
      <div className="wallet-gallery-device">
        <img src={`${walletAssets}/${screen.file}`} width="320" height="695" alt={screen.alt} />
      </div>
      <figcaption aria-live="polite">iPhone 实机界面 · {screen.tab}</figcaption>
    </figure>
  );
}

function WalletSearchSample() {
  const [member, setMember] = useState(0);
  const [category, setCategory] = useState<keyof typeof family[number]["numbers"]>("身份证");
  const [revealed, setRevealed] = useState(false);
  const [search, setSearch] = useState("");
  const person = family[member];
  const number = person.numbers[category];
  const matches = `${person.name} ${person.role} ${category} ${number.slice(-4)}`.includes(search.trim());

  return (
    <details className="wallet-sample">
      <summary>试用证件查找<Icon name="plus" size={17} /></summary>
      <div className="wallet-sample-body">
        <div className="family-tabs" role="group" aria-label="选择家人">
          {family.map((item, index) => (
            <button key={item.name} type="button" aria-pressed={member === index}
              className={member === index ? "selected" : ""}
              onClick={() => { setMember(index); setRevealed(false); }}>
              {item.name}
            </button>
          ))}
        </div>
        <label className="demo-search">
          <Icon name="search" size={16} />
          <input value={search} placeholder="搜索姓名、证件或尾号" aria-label="搜索演示证件"
            onChange={event => { setSearch(event.target.value); setRevealed(false); }} />
        </label>
        <div className="document-tabs" role="group" aria-label="证件类型">
          {(["身份证", "银行卡", "护照"] as const).map(tab => (
            <button type="button" key={tab} aria-pressed={category === tab}
              className={category === tab ? "selected" : ""}
              onClick={() => { setCategory(tab); setRevealed(false); }}>{tab}</button>
          ))}
        </div>
        {matches ? (
          <div className="wallet-sample-card">
            <strong><Icon name={category === "银行卡" ? "wallet" : "shield"} size={19} />{category}</strong>
            <div className="wallet-sample-card-number">
              <span className="sample-number" aria-live="polite">{revealed ? number : `•••• ${number.slice(-4)}`}</span>
              <button type="button" className="number-toggle" aria-pressed={revealed}
                onClick={() => setRevealed(!revealed)}>{revealed ? "遮挡号码" : "查看号码"}</button>
            </div>
          </div>
        ) : (
          <div className="demo-empty">
            <strong>暂时没有找到这张证件</strong>
            <button type="button" onClick={() => setSearch("")}>清空搜索</button>
          </div>
        )}
        <p className="wallet-sample-note">示例中的姓名和号码均为虚构。</p>
      </div>
    </details>
  );
}

function CardDemo() {
  return (
    <section className="demo-section container" id="card-demo" aria-labelledby="demo-title">
      <div className="section-heading">
        <div>
          <div className="eyebrow">A PLACE FOR EVERYTHING</div>
          <h2 id="demo-title">打开卡包，就能找到。</h2>
        </div>
        <p className="demo-intro">切换「证件」和「取用」，看看卡包在 iPhone 上的样子。</p>
      </div>
      <div className="demo-layout wallet-preview-layout">
        <WalletScreenGallery />
        <div className="wallet-preview-notes">
          <div className="demo-features">
            {[
              {
                title: "按家人找证件",
                text: "选中家人，再切换身份、金融或出行分类。列表里只露出证件号码的尾号。",
                icon: "people" as const,
              },
              {
                title: "把出行资料放在一起",
                text: "在「取用」的证件夹里，把这次出行要用的资料放在一起。",
                icon: "wallet" as const,
              },
              {
                title: "分享前，先核对副本",
                text: "导出前选好页面，核对遮挡范围和用途水印，再把副本发出去。",
                icon: "shield" as const,
              },
            ].map(item => (
              <div className="demo-feature" key={item.title}>
                <span className="demo-feature-icon"><Icon name={item.icon} size={23} /></span>
                <div><h3>{item.title}</h3><p>{item.text}</p></div>
              </div>
            ))}
          </div>
          <WalletSearchSample />
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
                查看卡包界面
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

export default function App({ page }: { page: "home" | "cards" }) {
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
            <AppCollection />
            <About />
            <FAQ />
          </main>
        )}
      </div>
      <Footer cards={page === "cards"} />
    </>
  );
}

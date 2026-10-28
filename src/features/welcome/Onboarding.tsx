import { MaterialIcon } from '../../components/icons'
import React, { useRef, useState } from 'react';
import { HohoButton } from '../../components/design-system/HohoButton';
import './onboarding.css';

export interface OnboardingProps {
  /** Continue to the application's existing registration / sign-in flow. */
  onComplete: () => void;
  /** The original, approved three-screen artwork, used only as an art sprite. */
  artworkSrc?: string;
}

const slides = [
  {
    label: '留住当下',
    title: ['孩子的情况，', '不必全凭回忆。'],
    description: '拍张照片，或按住说几句，把当下留住。',
    tone: 'paper',
    crop: '55 280 435 514',
  },
  {
    label: '看清经过',
    title: ['零散的记录，', '连成清楚的经过。'],
    description: '症状、用药、每次变化，按时间整理。',
    tone: 'forest',
    // Stop above the small baked-in caption at y=760 in the original board.
    crop: '525 280 437 468',
  },
  {
    label: '从容转述',
    title: ['跟 AI 或医生，', '一句话说清楚。'],
    description: '整理孩子的情况，就诊、问 AI 都清楚。',
    tone: 'paper',
    crop: '998 284 436 510',
  },
] as const;

/** Three editorial welcome pages. Authentication and persistence stay with the host app. */
export function Onboarding({
  onComplete,
  artworkSrc = '/onboarding/hoooho-onboarding-art.png',
}: OnboardingProps) {
  const [active, setActive] = useState(0);
  const touchStart = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const regionRef = useRef<HTMLElement>(null);

  const goTo = (index: number) => setActive(Math.max(0, Math.min(slides.length - 1, index)));

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const next = event.key === 'ArrowRight' ? active + 1
      : event.key === 'ArrowLeft' ? active - 1
      : event.key === 'Home' ? 0
      : event.key === 'End' ? slides.length - 1
      : null;
    if (next !== null) {
      event.preventDefault();
      goTo(next);
    }
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    touchStart.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || start.pointerId !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const threshold = Math.max(42, Math.min(72, event.currentTarget.clientWidth * 0.12));
    if (Math.abs(dx) >= threshold && Math.abs(dx) > Math.abs(dy) * 1.25) {
      goTo(active + (dx < 0 ? 1 : -1));
    }
  };

  return (
    <main className="hoooho-onboarding-shell">
      <section
        ref={regionRef}
        className="hoooho-onboarding"
        data-tone={slides[active].tone}
        role="region"
        aria-roledescription="轮播"
        aria-label="护护首次使用介绍"
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        <header className="hoooho-onboarding__header">
          <span className="hoooho-onboarding__brand" aria-label="Hoooho 护护">Hoooho</span>
          <button className="hoooho-onboarding__skip" type="button" onClick={onComplete}>
            跳过<span className="hoooho-onboarding__sr-only">介绍，进入注册与登录</span>
          </button>
        </header>

        <div
          className="hoooho-onboarding__window"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => { touchStart.current = null; }}
          onLostPointerCapture={() => { touchStart.current = null; }}
        >
          <div
            className="hoooho-onboarding__track"
            style={{ transform: `translate3d(-${active * 100}%, 0, 0)` }}
          >
            {slides.map((slide, index) => (
              <article
                className="hoooho-onboarding__slide"
                data-tone={slide.tone}
                data-active={active === index}
                key={slide.label}
                role="group"
                aria-roledescription="幻灯片"
                aria-label={`${index + 1} / ${slides.length}：${slide.label}`}
                aria-hidden={active !== index}
              >
                <div className="hoooho-onboarding__copy">
                  <p className="hoooho-onboarding__eyebrow">{slide.label}</p>
                  <h1 className="hoooho-onboarding__title">
                    {slide.title.map(line => <span key={line}>{line}</span>)}
                  </h1>
                  <p className="hoooho-onboarding__description">{slide.description}</p>
                </div>

                <div className="hoooho-onboarding__art" aria-hidden="true">
                  <svg
                    className="hoooho-onboarding__art-sprite"
                    viewBox={slide.crop}
                    preserveAspectRatio="xMidYMid slice"
                    focusable="false"
                  >
                    <image
                      href={artworkSrc}
                      width="1484"
                      height="1060"
                      preserveAspectRatio="none"
                    />
                  </svg>
                </div>
              </article>
            ))}
          </div>
        </div>

        <footer className="hoooho-onboarding__footer">
          <div className="hoooho-onboarding__pagination" aria-label="选择介绍页">
            {slides.map((slide, index) => (
              <button
                key={slide.label}
                type="button"
                className="hoooho-onboarding__page-button"
                aria-label={`第 ${index + 1} 页：${slide.label}`}
                aria-current={active === index ? 'step' : undefined}
                onClick={() => goTo(index)}
              ><MaterialIcon name="circle" size={16} selected={active === index}/></button>
            ))}
          </div>

          <HohoButton className="hoooho-onboarding__start" fullWidth size="large" onClick={onComplete}>
            <span>开始</span>
            <MaterialIcon name="arrow_forward" size={24}/>
          </HohoButton>
          <p className="hoooho-onboarding__promise">为孩子，留一份清楚的记录</p>
        </footer>

        <p className="hoooho-onboarding__sr-only" role="status" aria-live="polite" aria-atomic="true">
          第 {active + 1} 页，共 {slides.length} 页。{slides[active].label}。
        </p>
      </section>
    </main>
  );
}

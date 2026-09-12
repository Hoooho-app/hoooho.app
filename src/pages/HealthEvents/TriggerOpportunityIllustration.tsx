import type { IllustrationKey } from './triggerOpportunityConfig'

const palette = { ink:'#225c59', mint:'#bfe2da', pale:'#eef7f4', sky:'#dcebed', warm:'#f3cd79', paper:'#f8faf8' }

export function TriggerOpportunityIllustration({ kind }: { kind: IllustrationKey }) {
  const sleep = ['late-sleep','morning-sleep','nap','bedtime'].includes(kind)
  const food = ['breakfast','new-food','dinner','hydration','food-reaction'].includes(kind)
  const outdoors = ['outdoor','activity-check','contact-reaction'].includes(kind)
  const medical = ['symptom-trend','medicine','care','injury','vaccine','visit','body-change'].includes(kind)
  return <svg aria-hidden="true" className="trigger-opportunity-illustration" viewBox="0 0 320 116">
    <rect width="320" height="116" rx="16" fill={palette.pale}/><circle cx="273" cy="24" r="15" fill={palette.warm} opacity=".8"/>
    {sleep && <><rect x="28" y="58" width="190" height="38" rx="12" fill={palette.sky}/><path d="M38 66c31-28 101-23 153 0v30H38z" fill={palette.mint}/><rect x="205" y="43" width="62" height="53" rx="7" fill={palette.paper}/><circle cx="236" cy="64" r="15" fill="none" stroke={palette.ink} strokeWidth="3"/><path d="M236 54v11l8 5" fill="none" stroke={palette.ink} strokeWidth="3" strokeLinecap="round"/><path d="M270 18a13 13 0 1 0 12 19 16 16 0 1 1-12-19" fill={palette.ink}/></>}
    {food && <><ellipse cx="136" cy="77" rx="83" ry="26" fill={palette.paper} stroke={palette.mint} strokeWidth="4"/><circle cx="105" cy="73" r="18" fill={palette.warm}/><circle cx="145" cy="72" r="16" fill={palette.mint}/><path d="M186 47v50M178 47v22M194 47v22" stroke={palette.ink} strokeWidth="4" strokeLinecap="round"/><rect x="226" y="43" width="38" height="55" rx="10" fill={palette.mint}/></>}
    {outdoors && <><path d="M0 84c64-34 105 8 166-18 61-27 99-4 154-25v75H0z" fill={palette.mint}/><path d="M25 92c58-28 99 0 142-17 45-18 79-4 128-20" fill="none" stroke={palette.paper} strokeWidth="10" strokeLinecap="round"/><circle cx="151" cy="63" r="19" fill={palette.warm}/><path d="M59 78l20-34 20 34M79 44v51" stroke={palette.ink} strokeWidth="4" strokeLinecap="round"/></>}
    {medical && <><rect x="43" y="28" width="72" height="72" rx="9" fill={palette.paper} stroke={palette.mint} strokeWidth="3"/><path d="M79 45v38M60 64h38" stroke={palette.ink} strokeWidth="5" strokeLinecap="round"/><rect x="148" y="48" width="47" height="52" rx="8" fill={palette.mint}/><rect x="157" y="37" width="29" height="13" rx="4" fill={palette.ink}/><circle cx="242" cy="66" r="27" fill="none" stroke={palette.ink} strokeWidth="5"/><path d="M262 86l18 18" stroke={palette.ink} strokeWidth="7" strokeLinecap="round"/></>}
    {!sleep && !food && !outdoors && !medical && <><rect x="78" y="40" width="105" height="60" rx="18" fill={palette.paper}/><ellipse cx="130" cy="70" rx="42" ry="20" fill={palette.mint}/><rect x="213" y="31" width="50" height="69" rx="8" fill={palette.sky}/></>}
  </svg>
}

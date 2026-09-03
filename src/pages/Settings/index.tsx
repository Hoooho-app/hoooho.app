import {
  Camera, FileImage, HeartHandshake, Info, KeyRound, Languages, LockKeyhole,
  LogOut, Mail, Mic, ShieldCheck, UserRound
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BottomSheetSurface, HohoButton, HohoSurfaceRow, HohoToggle, StatusNotice, Typography
} from '../../components/design-system'
import { WebPageHeader } from '../../components/common'
import { MainAppHeader } from '../../components/navigation'
import {
  permissionStatusLabels,
  mapBrowserPermissionState,
  type DevicePermissionKind,
  type DevicePermissionStatus
} from '../../features/settings/permissions'
import {
  getAccountPreferences,
  type CarePreferences
} from '../../features/settings/preferences'
import { useAppStore } from '../../store/useAppStore'
import { useSettingsStore } from '../../store/useSettingsStore'

interface ChoiceOption<T extends string> {
  description?: string
  label: string
  value: T
}

function SettingsLayout({ children, title }: { children: ReactNode; title: string }) {
  const topLevel = title === '设置'
  return (
    <main className="settings-page app-shell pb-0">
      {topLevel ? <MainAppHeader compact title={title} /> : <WebPageHeader title={title} fallback="/settings" />}
      <div className="settings-content">{children}</div>
    </main>
  )
}

function SettingsGroup({ children, title }: { children: ReactNode; title?: string }) {
  return <section>{title && <h2 className="settings-section-label">{title}</h2>}<div className="settings-list">{children}</div></section>
}

function LeadingIcon({ children }: { children: ReactNode }) {
  return <span aria-hidden="true" className="settings-leading">{children}</span>
}

function ChoiceSheet<T extends string>({
  description,
  onClose,
  onSelect,
  open,
  options,
  selected,
  title
}: {
  description?: string
  onClose: () => void
  onSelect: (value: T) => void
  open: boolean
  options: ChoiceOption<T>[]
  selected: T
  title: string
}) {
  return (
    <BottomSheetSurface
      footer={<HohoButton fullWidth size="large" onClick={onClose}>完成</HohoButton>}
      label={title}
      onClose={onClose}
      open={open}
      title={title}
    >
      <div className="grid gap-4">
        <div className="settings-choice-list" role="radiogroup" aria-label={title}>
          {options.map((option) => (
            <button
              aria-checked={selected === option.value}
              className="settings-choice"
              data-selected={selected === option.value}
              key={option.value}
              onClick={() => onSelect(option.value)}
              role="radio"
              type="button"
            >
              <span className="min-w-0">
                <strong className="block text-sm font-medium">{option.label}</strong>
                {option.description && <span className="mt-0.5 block text-xs leading-5 text-text-secondary">{option.description}</span>}
              </span>
              <span aria-hidden="true" className="settings-choice__mark" />
            </button>
          ))}
        </div>
        {description && <p className="settings-note">{description}</p>}
      </div>
    </BottomSheetSurface>
  )
}

function ToggleSettingRow({ checked, description, label, onChange }: {
  checked: boolean
  description?: string
  label: string
  onChange: (checked: boolean) => void
}) {
  return <HohoSurfaceRow action={<HohoToggle checked={checked} label={label} onChange={onChange} />} description={description} title={label} />
}

export function SettingsPage() {
  const navigate = useNavigate()
  const accountId = useAppStore((state) => state.authUser?.id)
  const accounts = useSettingsStore((state) => state.accounts)
  const care = useSettingsStore((state) => state.care)
  const setCareEnabled = useSettingsStore((state) => state.setCareEnabled)
  const setAccountPreferences = useSettingsStore((state) => state.setAccountPreferences)
  const preferences = getAccountPreferences(accounts, accountId)
  const [languageOpen, setLanguageOpen] = useState(false)

  return (
    <SettingsLayout title="设置">
      <SettingsGroup>
        <HohoSurfaceRow
          description="外观与显示"
          leading={<LeadingIcon><UserRound size={18} strokeWidth={1.7} /></LeadingIcon>}
          onActivate={() => navigate('/settings/personalization')}
          title="个性化"
        />
        <div className="settings-split-row">
          <button className="settings-split-row__main" onClick={() => navigate('/settings/care')} type="button">
            <LeadingIcon><HeartHandshake size={18} strokeWidth={1.7} /></LeadingIcon>
            <span className="min-w-0 flex-1">
              <strong className="hoho-text-body block font-medium text-text-primary">关怀模式</strong>
              <span className="hoho-text-caption mt-0.5 block">让文字、按钮和提示更加清晰</span>
            </span>
          </button>
          <span className="settings-split-row__toggle">
            <HohoToggle checked={care.enabled} label="关怀模式" onChange={setCareEnabled} />
          </span>
        </div>
        <HohoSurfaceRow
          description="界面显示语言"
          leading={<LeadingIcon><Languages size={18} strokeWidth={1.7} /></LeadingIcon>}
          onActivate={() => setLanguageOpen(true)}
          title="语言"
          value="简体中文"
        />
        <HohoSurfaceRow
          description="管理设备功能的使用权限"
          leading={<LeadingIcon><ShieldCheck size={18} strokeWidth={1.7} /></LeadingIcon>}
          onActivate={() => navigate('/settings/privacy')}
          title="隐私与权限"
        />
        <HohoSurfaceRow
          description="登录方式、设备与账号管理"
          leading={<LeadingIcon><LockKeyhole size={18} strokeWidth={1.7} /></LeadingIcon>}
          onActivate={() => navigate('/settings/account')}
          title="账号与安全"
        />
      </SettingsGroup>

      <ChoiceSheet
        description="语言设置只改变页面和系统文案，不会自动翻译已记录的健康内容。"
        onClose={() => setLanguageOpen(false)}
        onSelect={() => accountId && setAccountPreferences(accountId, { interfaceLanguage: 'zh-CN' })}
        open={languageOpen}
        options={[{ label: '简体中文', value: 'zh-CN' }]}
        selected={preferences.interfaceLanguage}
        title="界面语言"
      />
    </SettingsLayout>
  )
}

export function PersonalizationSettingsPage() {
  return (
    <SettingsLayout title="个性化">
      <SettingsGroup title="外观">
        <HohoSurfaceRow description="当前产品仅完整支持浅色界面" title="外观模式" value="浅色" />
      </SettingsGroup>

      <p className="settings-note px-2">孩子的头像与资料，请在对应孩子页面修改。</p>
    </SettingsLayout>
  )
}

const careTextOptions = [['standard', '标准'], ['large', '大'], ['extra-large', '特大']] as const

export function CareModeSettingsPage() {
  const care = useSettingsStore((state) => state.care)
  const setCareEnabled = useSettingsStore((state) => state.setCareEnabled)
  const setCarePreferences = useSettingsStore((state) => state.setCarePreferences)
  const change = <K extends keyof Omit<CarePreferences, 'enabled' | 'hasConfigured'>>(key: K, value: CarePreferences[K]) => {
    setCarePreferences({ [key]: value } as Partial<Omit<CarePreferences, 'enabled' | 'hasConfigured'>>)
  }

  return (
    <SettingsLayout title="关怀模式">
      <section className="settings-care-master">
        <div>
          <Typography className="text-text-primary" variant="cardTitle">关怀模式</Typography>
          <Typography className="mt-1" variant="caption">更大、更清晰、更容易操作</Typography>
        </div>
        <HohoToggle checked={care.enabled} label="关怀模式总开关" onChange={setCareEnabled} />
      </section>

      <section>
        <h2 className="settings-section-label">实时预览</h2>
        <div className="settings-care-preview" data-contrast={care.highContrast} data-size={care.textSize} data-targets={care.largerTargets}>
          <div><strong className="block font-semibold">健康记录</strong><span className="mt-1 block text-text-secondary">今天感觉怎么样？</span></div>
          <button className="settings-care-preview__button" type="button">添加记录</button>
        </div>
      </section>

      <section>
        <h2 className="settings-section-label">显示与操作</h2>
        <div className="settings-list">
          <div className="border-b px-4 py-3">
            <span className="hoho-text-body block font-medium text-text-primary">文字大小</span>
            <div className="settings-segmented mt-3" role="group" aria-label="文字大小">
              {careTextOptions.map(([value, label]) => <button aria-pressed={care.textSize === value} key={value} onClick={() => change('textSize', value)} type="button">{label}</button>)}
            </div>
          </div>
          <ToggleSettingRow checked={care.largerTargets} label="放大操作区域" onChange={(value) => change('largerTargets', value)} />
          <ToggleSettingRow checked={care.highContrast} label="增强颜色对比" onChange={(value) => change('highContrast', value)} />
          <ToggleSettingRow checked={care.simplifyInformation} label="简化页面信息" onChange={(value) => change('simplifyInformation', value)} />
          <ToggleSettingRow checked={care.reduceMotion} label="减少动态效果" onChange={(value) => change('reduceMotion', value)} />
        </div>
      </section>

      <SettingsGroup title="理解辅助">
        <ToggleSettingRow checked={care.plainLanguage} label="使用通俗表达" onChange={(value) => change('plainLanguage', value)} />
        <ToggleSettingRow checked={care.explainTerms} label="解释专业词语" onChange={(value) => change('explainTerms', value)} />
        <ToggleSettingRow checked={care.showActionHints} label="加强操作提示" onChange={(value) => change('showActionHints', value)} />
      </SettingsGroup>

      {!care.enabled && <p className="settings-note px-2">细分选择会保留，并在下次开启关怀模式时生效。</p>}
      <p className="settings-note px-2">仅影响当前设备的显示与操作，不会改变健康数据。</p>
    </SettingsLayout>
  )
}

const permissionCopy: Record<DevicePermissionKind, { description: string; icon: ReactNode; title: string }> = {
  camera: { description: '拍摄检查单、药品及健康资料', icon: <Camera size={19} strokeWidth={1.7} />, title: '相机' },
  microphone: { description: '使用语音记录健康情况', icon: <Mic size={19} strokeWidth={1.7} />, title: '麦克风' },
  files: { description: '上传报告、图片和其他资料', icon: <FileImage size={19} strokeWidth={1.7} />, title: '照片与文件' }
}

function useDevicePermissions(refreshKey: number) {
  const [states, setStates] = useState<Record<DevicePermissionKind, DevicePermissionStatus>>({ camera: 'checking', files: 'unsupported', microphone: 'checking' })

  useEffect(() => {
    let active = true
    const permissionResults: globalThis.PermissionStatus[] = []
    const query = async (kind: 'camera' | 'microphone') => {
      if (!navigator.permissions?.query) {
        if (active) setStates((current) => ({ ...current, [kind]: 'unsupported' }))
        return
      }
      try {
        const result = await navigator.permissions.query({ name: kind } as unknown as PermissionDescriptor)
        if (!active) return
        permissionResults.push(result)
        const update = () => active && setStates((current) => ({ ...current, [kind]: mapBrowserPermissionState(result.state) }))
        update()
        result.onchange = update
      } catch {
        if (active) setStates((current) => ({ ...current, [kind]: 'unsupported' }))
      }
    }
    void query('camera')
    void query('microphone')
    return () => {
      active = false
      permissionResults.forEach((result) => { result.onchange = null })
    }
  }, [refreshKey])

  return states
}

export function PrivacySettingsPage() {
  const [selected, setSelected] = useState<DevicePermissionKind | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [requesting, setRequesting] = useState(false)
  const [requestMessage, setRequestMessage] = useState('')
  const permissions = useDevicePermissions(refreshKey)
  const selectedStatus = selected ? permissions[selected] : null
  const selectedCopy = selected ? permissionCopy[selected] : null

  const requestPermission = async () => {
    if (!selected || selected === 'files' || !navigator.mediaDevices?.getUserMedia) return
    setRequesting(true)
    setRequestMessage('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia(selected === 'camera' ? { video: true } : { audio: true })
      stream.getTracks().forEach((track) => track.stop())
      setRequestMessage('已获得权限。Hoooho 仅会在你主动使用相关功能时访问设备。')
      setRefreshKey((value) => value + 1)
    } catch {
      setRequestMessage('未能获得权限。请在浏览器地址栏的网站设置中允许后再重试。')
      setRefreshKey((value) => value + 1)
    } finally {
      setRequesting(false)
    }
  }

  return (
    <SettingsLayout title="隐私与权限">
      <SettingsGroup title="设备权限">
        {(Object.keys(permissionCopy) as DevicePermissionKind[]).map((kind) => (
          <HohoSurfaceRow
            className="min-w-0"
            description={permissionCopy[kind].description}
            key={kind}
            leading={<LeadingIcon>{permissionCopy[kind].icon}</LeadingIcon>}
            onActivate={() => { setSelected(kind); setRequestMessage('') }}
            title={permissionCopy[kind].title}
            value={<span className="settings-permission-status">{permissionStatusLabels[permissions[kind]]}</span>}
          />
        ))}
      </SettingsGroup>

      <section className="settings-info-card">
        <Info aria-hidden="true" className="mt-0.5 text-primary" size={19} strokeWidth={1.7} />
        <div><Typography className="text-text-primary" variant="cardTitle">权限由当前设备管理</Typography><Typography className="mt-1" variant="caption">修改权限时，Hoooho 将引导你前往浏览器或系统设置。</Typography></div>
      </section>

      <BottomSheetSurface
        footer={selected && selected !== 'files' && selectedStatus === 'prompt'
          ? <HohoButton fullWidth loading={requesting} size="large" onClick={() => void requestPermission()}>请求使用权限</HohoButton>
          : undefined}
        label="设备权限说明"
        onClose={() => setSelected(null)}
        open={selected !== null}
        title={selectedCopy?.title ?? '设备权限'}
      >
        {selectedCopy && (
          <div className="grid gap-4">
            <StatusNotice title={`当前状态：${permissionStatusLabels[selectedStatus ?? 'unsupported']}`}>
              {selected === 'files'
                ? '浏览器不会公开照片与文件的持续权限状态。只有在你主动选择上传时，Hoooho 才会读取你选中的文件。'
                : selectedStatus === 'denied'
                  ? '请打开浏览器地址栏旁的网站设置，找到权限并改为允许。'
                  : selectedStatus === 'granted'
                    ? '权限已允许。如需关闭，请前往浏览器或系统的网站权限设置。'
                    : selectedStatus === 'unsupported'
                      ? '当前浏览器无法查询这项权限。你仍可在实际使用相关功能时按浏览器提示操作。'
                      : 'Hoooho 会在你点击下方按钮后请求权限，不会在页面加载时自动申请。'}
            </StatusNotice>
            {requestMessage && <p aria-live="polite" className="settings-note">{requestMessage}</p>}
          </div>
        )}
      </BottomSheetSurface>
    </SettingsLayout>
  )
}

export function AccountSettingsPage() {
  const navigate = useNavigate()
  const email = useAppStore((state) => state.authUser?.email)
  const clearAuthSession = useAppStore((state) => state.clearAuthSession)
  const logout = () => { clearAuthSession(); navigate('/login', { replace: true }) }

  return (
    <SettingsLayout title="账号与安全">
      <SettingsGroup title="登录账号">
        <HohoSurfaceRow leading={<LeadingIcon><Mail size={18} strokeWidth={1.7} /></LeadingIcon>} title="登录邮箱" value={email ?? '当前账号未提供邮箱'} />
        <HohoSurfaceRow leading={<LeadingIcon><KeyRound size={18} strokeWidth={1.7} /></LeadingIcon>} title="登录方式" value={email ? '邮箱验证码' : '当前登录方式'} />
      </SettingsGroup>
      <section className="settings-account-actions" aria-label="账号操作">
        <HohoButton fullWidth size="large" variant="secondary" onClick={logout}><LogOut aria-hidden="true" size={18} strokeWidth={1.7} />退出登录</HohoButton>
      </section>
    </SettingsLayout>
  )
}

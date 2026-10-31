export const DEFAULT_OPS_PROJECT_ID = 'hoooho'
export const OPS_PROJECTS = Object.freeze([
  { id: 'hoooho', name: '护护记录' },
  { id: 'family', name: '家庭统筹' },
  { id: 'qinggan', name: '翻旧账' },
  { id: 'play', name: '护护陪玩' }
])
export const isOpsProject = value => OPS_PROJECTS.some(project => project.id === value)
export const opsProjectId = value => isOpsProject(value) ? value : DEFAULT_OPS_PROJECT_ID

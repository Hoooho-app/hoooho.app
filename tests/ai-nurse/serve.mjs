process.env.VISIT_AI_TEST='1'
process.env.VISIT_BAILIAN_TEST='1'
process.env.VISIT_E2E_PORT='4673'
process.env.VISIT_E2E_DEV_PORT='4674'
process.env.VISIT_CONTROL_PORT='4675'
process.env.VISIT_SHUTDOWN_FILE='../ai-nurse/.shutdown'
await import('../visit-sheet/serve.mjs')

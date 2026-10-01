import { OpenAIProvider } from '../server/ai/providers/openai-provider.mjs'
const provider=new OpenAIProvider(),safeModel=name=>typeof name==='string'&&/^[a-z0-9][a-z0-9._-]{0,80}$/.test(name)&&!name.startsWith('sk-')?name:'[invalid model setting]'
console.info(JSON.stringify({runtimeConfiguration:{serverKeyConfigured:Boolean(provider.apiKey),endpointIsOfficial:provider.baseUrl==='https://api.openai.com/v1',summaryModel:safeModel(provider.model),draftModel:safeModel(process.env.AI_DRAFT_MODEL||provider.model),visionModel:safeModel(process.env.AI_VISION_MODEL||provider.model),transcriptionModel:safeModel(process.env.ASR_MODEL||'gpt-4o-mini-transcribe'),speechModel:safeModel(process.env.AI_SPEECH_MODEL||'gpt-4o-mini-tts'),explicitProjectConfigured:Boolean(process.env.OPENAI_PROJECT_ID),explicitOrganizationConfigured:Boolean(process.env.OPENAI_ORGANIZATION_ID),automaticRetries:0}}))
// This preloader is used only by the opt-in diagnostic script, never application
// startup: runtime health can be verified without allowing any outbound request.
globalThis.fetch=async()=>{throw new Error('Outbound requests disabled in runtime configuration check')}

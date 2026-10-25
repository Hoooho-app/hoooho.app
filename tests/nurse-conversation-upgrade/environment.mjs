// Never inherit production database, mail, auth, bridge or platform credentials.
const runtimeKeys=['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','TMPDIR','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','COMSPEC','PATHEXT','LANG','LC_ALL','TZ','NODE_EXTRA_CA_CERTS','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','NODE_USE_ENV_PROXY']
const providerKeys=['AI_PROVIDER','ASR_PROVIDER','TTS_PROVIDER','BAILIAN_API_KEY','BAILIAN_BASE_URL','BAILIAN_MODEL','BAILIAN_VISION_MODEL','BAILIAN_TIMEOUT_MS','BAILIAN_MAX_OUTPUT_TOKENS','BAILIAN_MAX_IMAGES_PER_REQUEST','BAILIAN_MAX_INPUT_CHARACTERS','BAILIAN_ASR_MODEL','BAILIAN_ASR_TIMEOUT_MS','AI_MAX_CONCURRENT_CALLS','AI_MAX_CALLS_PER_ACCOUNT_HOUR','ASR_BASE_URL','BAILIAN_ASR_BASE_URL']
export function localEvaluationEnvironment(environment,overrides={}){
 return {...Object.fromEntries([...runtimeKeys,...providerKeys].filter(key=>typeof environment[key]==='string').map(key=>[key,environment[key]])),...overrides}
}

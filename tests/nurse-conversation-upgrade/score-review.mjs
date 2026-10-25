import {readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import {regressionCases,holdoutCases} from './scenarios.mjs'
export function scoreReview(report,reviews){
 if(!report||!Array.isArray(report.results)||!Array.isArray(reviews))throw new Error('A captured report and independent review array are required')
 const eligible=report.results.filter(result=>result.status==='MODEL_OUTPUT_CAPTURED'),expectedIds=new Set(eligible.map(result=>result.id)),byId=new Map()
 const dimensions=['understoodInput','relatedContextCorrectly','factChangesCorrect','responseAppropriate','askedQuestion','unnecessaryQuestion']
 for(const review of reviews){
  if(!expectedIds.has(review.id)||byId.has(review.id))throw new Error('Unknown or duplicate reviewed case')
  if(typeof review.reviewer!=='string'||!review.reviewer.trim()||dimensions.some(field=>typeof review[field]!=='boolean')||!Array.isArray(review.criticalErrors))throw new Error('Every review requires reviewer, six boolean decisions and critical errors')
  if(!review.askedQuestion&&review.unnecessaryQuestion)throw new Error('A nonexistent question cannot be unnecessary')
  byId.set(review.id,review)
 }
 if(byId.size!==expectedIds.size||!expectedIds.size)throw new Error('Every captured output must have an independent review; partial review is not a score')
 const groups={},lookup=new Map([...regressionCases,...holdoutCases].map(sample=>[sample.id,sample]))
 let correct=0,questions=0,unnecessary=0,critical=0
 for(const [id,review] of byId){
  const group=lookup.get(id)?.scenarioId?.[0]??'unknown',item=groups[group]??={reviewed:0,correct:0,questions:0,unnecessaryQuestions:0,criticalErrors:0}
  const understood=['understoodInput','relatedContextCorrectly','factChangesCorrect','responseAppropriate'].every(field=>review[field])
  correct+=Number(understood);questions+=Number(review.askedQuestion);unnecessary+=Number(review.unnecessaryQuestion);critical+=review.criticalErrors.length
  item.reviewed++;item.correct+=Number(understood);item.questions+=Number(review.askedQuestion);item.unnecessaryQuestions+=Number(review.unnecessaryQuestion);item.criticalErrors+=review.criticalErrors.length
 }
 for(const item of Object.values(groups)){item.understandingAccuracy=item.correct/item.reviewed;item.unnecessaryQuestionRate=item.questions?item.unnecessaryQuestions/item.questions:0}
 const programFailures=report.results.filter(result=>['PROGRAM_INVARIANTS_FAIL','APPLICATION_FAILURE'].includes(result.status)).length
 const notRun=report.results.filter(result=>result.status==='NOT_RUN').length
 const realProviderEvidence=report.modelRequests>0&&report.modelReceipts?.some(receipt=>Number.isInteger(receipt.status)&&receipt.status>=200&&receipt.status<300)===true
 const overall={split:report.split,reviewed:byId.size,correct,understandingAccuracy:correct/byId.size,questions,unnecessaryQuestions:unnecessary,unnecessaryQuestionRate:questions?unnecessary/questions:0,unnecessaryQuestionsPerTurn:unnecessary/byId.size,criticalErrors:critical,programFailures,notRun,groups,realProviderEvidence,clinicalReview:'NOT_PERFORMED',afureComparison:'NOT_PERFORMED'}
 overall.blocked=critical>0||programFailures>0
 overall.measuredSubsetMeetsTargets=realProviderEvidence&&!overall.blocked&&overall.understandingAccuracy>=.95&&overall.unnecessaryQuestionRate<=.05
 const required=report.split==='regression'?regressionCases.length:report.split==='holdout'?holdoutCases.length:Infinity
 overall.datasetComplete=notRun===0&&report.results.length===required&&report.executed===required
 overall.fullChecklistAcceptance=false
 overall.limitations=['Independent review is still required for the separate holdout split.','Scores describe only the reviewed outputs, not clinical approval or an Afu comparison.','Not-run scenarios and physical-device checks must be reported separately.']
 return overall
}
export function combineReviewScores(regression,holdout){
 if(regression.split!=='regression'||holdout.split!=='holdout')throw new Error('Separate regression and holdout reviews are required')
 return {regression,holdout,fullChecklistAcceptance:regression.datasetComplete&&holdout.datasetComplete&&regression.measuredSubsetMeetsTargets&&holdout.measuredSubsetMeetsTargets,clinicalReview:'NOT_PERFORMED',afureComparison:'NOT_PERFORMED'}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const [reportPath,reviewPath,outputPath,holdoutReportPath,holdoutReviewPath]=process.argv.slice(2)
 if(!reportPath||!reviewPath||!outputPath)throw new Error('Usage: node score-review.mjs report.json completed-review.json score.json')
 let score=scoreReview(JSON.parse(await readFile(reportPath,'utf8')),JSON.parse(await readFile(reviewPath,'utf8')))
 if(Boolean(holdoutReportPath)!==Boolean(holdoutReviewPath))throw new Error('Both independent holdout files are required')
 if(holdoutReportPath)score=combineReviewScores(score,scoreReview(JSON.parse(await readFile(holdoutReportPath,'utf8')),JSON.parse(await readFile(holdoutReviewPath,'utf8'))))
 await writeFile(outputPath,JSON.stringify(score,null,2));console.log(JSON.stringify({reviewed:score.reviewed??score.regression.reviewed+score.holdout.reviewed,fullChecklistAcceptance:score.fullChecklistAcceptance}))
}

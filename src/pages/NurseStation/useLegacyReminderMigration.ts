import { PRODUCT_FEATURES } from '../../../shared/product-visibility.mjs'
import { useEffect } from 'react'
import { readNurseStationState } from '../../features/nurse-station/state'
import { medicationReminderService } from '../../services/medicationReminders'

/** Preserve the former front desk's idempotent compatibility migration. */
export function useLegacyReminderMigration(accountId: string, memberId: string, token: string) {
  useEffect(() => {
    if (!PRODUCT_FEATURES.auxiliaryTools || !accountId || !memberId || !token) return
    const legacy=readNurseStationState(accountId,memberId).items.filter(item=>item.type==='medication_reminder'&&item.medicationPlan)
    if(!legacy.length)return
    let active=true
    void medicationReminderService.list(memberId,token).then(async reminders=>{
      for(const item of legacy){
        if(!active)return
        if(!reminders.some(reminder=>reminder.clientId===item.id))await medicationReminderService.create(memberId,item.medicationPlan!,token,item.id)
      }
    }).catch(()=>undefined)
    return()=>{active=false}
  },[accountId,memberId,token])
}

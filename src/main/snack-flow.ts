import { chooseSnackFiles } from './snack-picker-window';
import { dialog, type BrowserWindow } from 'electron';
import type { BabyLifeRepository } from '../storage/baby-life-repository';
import { createTrashSnackService, type SelectedTrashSnackService } from './trash-snack';
import type { PanelReply } from '../shared/assistant-panel';
import type { TrashSnackProblem } from '../shared/trash-snack';
const services = new WeakMap<BabyLifeRepository, SelectedTrashSnackService>();
const active = new WeakSet<BabyLifeRepository>();
const messages: Record<TrashSnackProblem,string> = {
  unsupported:'이 기기에서는 휴지통 간식을 지원하지 않아요.',busy:'앞서 요청한 간식을 처리 중이에요.',
  'cannot-eat':'지금은 간식을 먹을 수 없어요. 식사 간격이나 기다리는 일부터 확인해 주세요.',
  'untrusted-order':'파일을 직접 선택해 주세요.','unsafe-target':'내 휴지통 바로 안에 있는 일반 파일만 선택해 주세요. 폴더와 연결 파일은 먹지 않아요.',
  empty:'파일을 선택하지 않았어요.','read-failed':'선택한 파일을 확인하지 못했어요. 아무것도 삭제하지 않았습니다.',
  'invalid-confirmation':'새로 파일을 골라 다시 확인해 주세요.',expired:'확인 시간이 지났어요. 새로 선택해 주세요.',
  changed:'선택한 파일이 바뀌었어요. 다시 선택해 주세요.','invalid-selection':'내 휴지통에 있는 파일을 1개 또는 2개 선택해 주세요.',
};
/** File selection and final consent remain in the main process. Renderer supplies no paths. */
export async function requestSnack(baby: BabyLifeRepository, owner: BrowserWindow | undefined, enabled: boolean): Promise<PanelReply> {
  if (!enabled || !owner || owner.isDestroyed()) return {ok:false,message:'시험 모드에서는 실제 휴지통에 접근하지 않습니다.'};
  if (active.has(baby)) return {ok:false,message:messages.busy};
  if (!baby.canEatSnack()) return {ok:false,message:messages['cannot-eat']};
  let service=services.get(baby);
  if (!service) {
    // The durable baby meal records completion itself. This hook only releases
    // the backend operation after that completion, without a second meal event.
    service=createTrashSnackService({canEatSnack:()=>baby.canEatSnack(),finishSnack:()=>{}});
    services.set(baby,service);
  }
  active.add(baby);
  try {
    let choices;
    try { choices=await service.listChoices(); }
    catch { return {ok:false,message:'휴지통 목록을 읽지 못했어요. 접근 권한을 확인해 주세요. 파일은 삭제하지 않았습니다.'}; }
    const selection=await chooseSnackFiles(owner,choices);
    if (selection===null) return {ok:false,message:'간식 선택을 취소했어요. 파일은 그대로입니다.'};
    const proposal=await service.prepareChoice(selection);
    if (proposal.status==='blocked') return {ok:false,message:messages[proposal.reason]};
    const confirmation=await dialog.showMessageBox(owner,{type:'warning',title:'이 파일을 간식으로 줄까요?',
      message:'선택한 파일을 영구삭제합니다. 되돌릴 수 없습니다.',
      detail:proposal.candidates.map(item=>item.name).join('\n'),buttons:['취소','영구삭제하고 간식 주기'],defaultId:0,cancelId:0,noLink:true});
    if (confirmation.response!==1) {service.cancel(proposal.operationId);return {ok:false,message:'취소했어요. 파일은 그대로입니다.'};}
    const result=await service.confirm({operationId:proposal.operationId,permanentlyDelete:true});
    if (result.status==='blocked') return {ok:false,message:messages[result.reason]};
    if (!result.mealReady) {
      const detail=result.items.map(item=>`${item.name}: ${item.status==='deleted' ? '삭제됨' : '삭제 완료를 확인하지 못함'}`).join('\n');
      const recovery=service.recoveryNotices().map(item=>`휴지통 / ${item.folderName} / ${item.fileName}`).join('\n');
      await dialog.showMessageBox(owner,{type:'warning',title:'간식 처리를 마치지 못했습니다',
        message:'아래 결과를 확인해 주세요. 이미 삭제된 파일은 되돌릴 수 없습니다.',detail:[detail,recovery].filter(Boolean).join('\n\n'),buttons:['확인']});
      return {ok:false,message:'일부 파일을 처리하지 못했어요. 표시된 결과와 보존 위치를 확인해 주세요.'};
    }
    try {baby.beginSnackMeal(result.operationId);}
    catch {return {ok:false,message:'파일은 삭제됐지만 먹기 기록을 저장하지 못했어요. 같은 삭제를 다시 실행하지 마세요.'};}
    // Normal baby ticks finish the persisted meal; this wait does not drive its clock.
    while (baby.read()?.meal) await new Promise(resolve=>setTimeout(resolve,250));
    service.completeMeal(result.operationId);
    return {ok:true,message:'간식을 다 먹었어요. 다음 식사는 15분 뒤에 줄 수 있어요.'};
  } catch {return {ok:false,message:'간식 처리를 마치지 못했어요. 휴지통과 아기 상태를 확인해 주세요.'};}
  finally {active.delete(baby);}
}

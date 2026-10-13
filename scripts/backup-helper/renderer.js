'use strict';
const $ = id => document.getElementById(id);
let state = {}, busy = false, mode = 'backup';
const controls = [...document.querySelectorAll('button,input')];
function render() {
  for (const control of controls) control.disabled = busy;
  $('backup-now').disabled = busy || !state.app || !state.backupParent || !$('closed').checked;
  $('restore-now').disabled = busy || !state.backup || !state.restoreParent;
  const empty = { app: '평소 사용하는 Jarvis Pet 앱을 선택해 주세요.', backupParent: '보관할 폴더를 선택해 주세요.', backup: '이 도우미로 만든 백업 폴더를 선택해 주세요.', restoreParent: '복원된 펫을 보관할 폴더를 선택해 주세요.' };
  for (const key of Object.keys(empty)) $(key + '-path').textContent = state[key] || empty[key];
  $('notice').textContent = state.notice || '';
  document.querySelector('main').setAttribute('aria-busy', String(busy));
}
function feedback(title, message, kind = 'progress', folder = '') {
  $('feedback').hidden = false; $('feedback').dataset.kind = kind;
  $('feedback-title').textContent = title; $('feedback-message').textContent = message;
  $('output-path').hidden = !folder; $('output-path').textContent = folder;
  $('reveal').hidden = !folder;
}
async function send(action, value) {
  if (busy) return;
  busy = true; render();
  const operation = action === 'backupNow' || action === 'restoreNow';
  if (operation) feedback(action === 'backupNow' ? '백업을 만들고 검사하고 있습니다…' : '백업을 검사하고 복원하고 있습니다…', '앱과 자료의 크기에 따라 몇 분 걸릴 수 있습니다. 이 창을 열어 두세요.');
  else if (action === 'initialize') feedback('펫 앱을 찾고 있습니다…', '실행 위치만 확인합니다. 펫 자료를 열거나 변경하지 않습니다.');
  try {
    state = await window.backupHelper.send(action, value);
    if (state.error) {
      feedback('작업을 완료하지 못했습니다', `${state.error.message} (오류 번호: ${state.error.code})`, 'error');
      $('feedback').focus();
    } else if (state.result) {
      const backup = state.result.kind === 'backup';
      feedback(backup ? '백업을 안전하게 보관했습니다.' : '새 사본으로 복원했습니다.', backup ? '펫 자료와 앱 안의 외형을 복사하고 일치 여부를 확인했습니다. 이제 원래 펫을 다시 실행해도 됩니다. 백업 폴더 안의 앱은 직접 실행하지 마세요.' : '아직 복원된 펫을 실행하지 않았습니다. 폴더 안의 Jarvis Pet.app을 열면 복원된 자료를 사용합니다. 중복 알림을 피하려면 원래 펫과 동시에 실행하지 마세요. 이 폴더는 옮기지 말고 보관해 주세요.', 'success', state.result.folder);
      if (operation) { $('closed').checked = false; $('feedback').focus(); }
    } else $('feedback').hidden = true;
  } catch { feedback('연결을 확인해 주세요', '작업 결과를 확인하지 못했습니다. 새 폴더를 임의로 사용하지 말고 점검을 요청해 주세요.', 'error'); }
  finally { busy = false; render(); }
}
for (const key of ['app', 'backup', 'backupParent', 'restoreParent']) $('choose-' + key).addEventListener('click', () => { if (key === 'app') $('closed').checked = false; send(key); });
for (const tab of ['backup', 'restore']) $('tab-' + tab).addEventListener('click', () => {
  mode = tab;
  for (const key of ['backup', 'restore']) { $(key + '-panel').hidden = key !== mode; $('tab-' + key).setAttribute('aria-pressed', String(key === mode)); }
  $('feedback').hidden = true;
});
$('closed').addEventListener('change', render);
$('backup-now').addEventListener('click', () => send('backupNow', $('closed').checked));
$('restore-now').addEventListener('click', () => send('restoreNow'));
$('reveal').addEventListener('click', () => send('reveal'));
window.backupHelper.onWait(() => feedback('작업이 끝난 뒤 닫아 주세요', '복사와 검사를 진행하고 있습니다. 완료 결과를 확인할 때까지 기다려 주세요.'));
send('initialize');

(() => {
  const api=(window as typeof window & {trashPicker:import('../shared/trash-snack').TrashSnackPickerAPI}).trashPicker;
  const files=document.querySelector<HTMLElement>('#files')!;
  const message=document.querySelector<HTMLElement>('#message')!;
  const selection=document.querySelector<HTMLElement>('#selection')!;
  const search=document.querySelector<HTMLInputElement>('#search')!;
  const next=document.querySelector<HTMLButtonElement>('#next')!;
  const cancel=document.querySelector<HTMLButtonElement>('#cancel')!;
  const selected=new Set<string>();
  let choices:import('../shared/trash-snack').TrashSnackCandidate[]=[];
  let busy=false,loaded=false;
  function render() {
    const scroll=files.scrollTop;
    files.replaceChildren();
    const filtered=choices.filter(item=>item.name.toLocaleLowerCase().includes(search.value.toLocaleLowerCase()));
    for(const item of filtered) {
      const label=document.createElement('label');label.className='file';
      const input=document.createElement('input');input.type='checkbox';input.value=item.id;
      input.checked=selected.has(item.id);input.disabled=busy||(!input.checked&&selected.size>=2);
      input.onchange=()=>{
        const cursor=Array.from(files.querySelectorAll('input')).indexOf(input);
        if(input.checked&&selected.size<2)selected.add(item.id);else selected.delete(item.id);
        render();files.querySelectorAll<HTMLInputElement>('input')[cursor]?.focus({preventScroll:true});
      };
      const name=document.createElement('span');name.textContent=item.name;
      label.append(input,name);files.append(label);
    }
    files.scrollTop=scroll;
    selection.textContent=selected.size+' / 2개 선택';
    next.disabled=busy||selected.size===0;
    if(loaded)message.textContent=choices.length===0?'간식으로 고를 수 있는 파일이 없어요.':filtered.length===0?'찾는 이름의 파일이 없어요.':'';
  }
  search.oninput=render;
  const close=()=>{if(!busy)void api.cancel().catch(()=>{message.textContent='창을 닫지 못했어요. 다시 눌러 주세요.';});};
  cancel.onclick=close;
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close();}});
  document.querySelector<HTMLFormElement>('#picker-form')!.onsubmit=event=>{
    event.preventDefault();if(busy||selected.size<1||selected.size>2)return;
    busy=true;cancel.disabled=true;render();
    void api.choose([...selected]).catch(()=>{busy=false;cancel.disabled=false;render();message.textContent='선택을 전달하지 못했어요. 다시 눌러 주세요.';});
  };
  void api.read().then(items=>{choices=items;loaded=true;render();search.focus();})
    .catch(()=>{message.textContent='파일 목록을 불러오지 못했어요. 취소하고 다시 시도해 주세요.';});
})();

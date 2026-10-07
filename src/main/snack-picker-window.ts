import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { TrashSnackCandidate } from '../shared/trash-snack';

let current: BrowserWindow | null = null;
/** Explicit request only. Names are text, paths stay in the main-owned service. */
export function chooseSnackFiles(owner: BrowserWindow, choices: readonly TrashSnackCandidate[]): Promise<string[] | null> {
  if (owner.isDestroyed() || current) return Promise.resolve(null);
  const page=path.join(__dirname,'../renderer/snack-picker.html');
  const win=new BrowserWindow({width:480,height:520,minWidth:380,minHeight:360,
    show:false,parent:owner,title:'아기에게 줄 간식',minimizable:false,maximizable:false,
    autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'../preload/snack-picker.js'),
      contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,spellcheck:false}});
  current=win;
  const ids=new Set(choices.map(item=>item.id));
  return new Promise((resolve,reject)=>{
    let settled=false;
    const channels=['trash-picker:read','trash-picker:choose','trash-picker:cancel'];
    const valid=(event:IpcMainInvokeEvent)=>!win.isDestroyed() && event.sender===win.webContents &&
      event.senderFrame===win.webContents.mainFrame && event.senderFrame?.url===pathToFileURL(page).href;
    const finish=(selection:string[]|null,error?:unknown)=>{
      if(settled)return;settled=true;
      channels.forEach(channel=>ipcMain.removeHandler(channel));
      owner.removeListener('closed',ownerClosed);
      current=null;
      if(!win.isDestroyed())win.destroy();
      if(error)reject(error);else resolve(selection);
    };
    const ownerClosed=()=>finish(null);
    owner.once('closed',ownerClosed);
    win.once('closed',()=>finish(null));
    ipcMain.handle(channels[0],(event,...args:unknown[])=>{
      if(!valid(event)||args.length)throw new Error('SNACK_PICKER_DENIED');
      return choices.map(({id,name})=>({id,name}));
    });
    ipcMain.handle(channels[1],(event,...args:unknown[])=>{
      const selected=args[0];
      if(!valid(event)||args.length!==1||!Array.isArray(selected)||selected.length<1||selected.length>2||
        selected.some(id=>typeof id!=='string'||!ids.has(id))||new Set(selected).size!==selected.length)
        throw new Error('SNACK_PICKER_DENIED');
      // Let the invoke reply arrive before destroying its sender.
      setImmediate(()=>finish([...selected]));
    });
    ipcMain.handle(channels[2],(event,...args:unknown[])=>{
      if(!valid(event)||args.length)throw new Error('SNACK_PICKER_DENIED');
      setImmediate(()=>finish(null));
    });
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    win.webContents.on('will-navigate',event=>event.preventDefault());
    win.webContents.session.setPermissionRequestHandler((_w,_p,reply)=>reply(false));
    win.webContents.session.setPermissionCheckHandler(()=>false);
    void win.loadFile(page).then(()=>{if(!settled&&!win.isDestroyed()){win.show();win.focus();}}).catch(error=>finish(null,error));
  });
}

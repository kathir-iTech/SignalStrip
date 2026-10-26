import { app, BrowserWindow, ipcMain, safeStorage, shell, clipboard, dialog, Menu } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { Storage } from './storage';
import { Service } from './service';
import { validateCommand } from './commands';
import { active } from '../src/core/engine';

if(app.isPackaged){
  // Portable ZIP: keep state with this extracted copy, outside roaming/synced AppData.
  const data=path.join(path.dirname(process.execPath),'SignalStripData');
  mkdirSync(data,{recursive:true});app.setPath('userData',data);
}else if(process.env.SIGNALSTRIP_DATA_DIR&&path.isAbsolute(process.env.SIGNALSTRIP_DATA_DIR))app.setPath('userData',process.env.SIGNALSTRIP_DATA_DIR);
if(!app.requestSingleInstanceLock()){app.quit();}
else {
  let window:BrowserWindow|null=null,service:Service|null=null,quitting=false;
  app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.show();window.focus();}});
  app.on('window-all-closed',()=>app.quit());
  app.on('before-quit',event=>{
    if(service&&!quitting){event.preventDefault();quitting=true;void service.stop().finally(()=>app.quit());}
  });
  void app.whenReady().then(async()=>{
    if(!await safeStorage.isAsyncEncryptionAvailable())throw new Error('Windows protected credential storage is unavailable.');
    const storage=new Storage(app.getPath('userData'),{encrypt:async s=>safeStorage.encryptStringAsync(s),decrypt:async b=>(await safeStorage.decryptStringAsync(b)).result});
    service=new Service(storage);
    const index=path.resolve(__dirname,'../dist/index.html');
    const allowedUrl=pathToFileURL(index).href;
    window=new BrowserWindow({width:1180,height:820,minWidth:580,minHeight:300,backgroundColor:'#101516',title:'SignalStrip',icon:path.join(app.getAppPath(),'assets/icon.png'),show:false,
      webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,devTools:!app.isPackaged}});
    window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    window.webContents.on('will-navigate',(e,url)=>{if(url!==allowedUrl)e.preventDefault();});
    window.webContents.session.setPermissionRequestHandler((_wc,_permission,cb)=>cb(false));
    window.webContents.session.setPermissionCheckHandler(()=>false);
    Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'SignalStrip',submenu:[{role:'quit'}]},{label:'View',submenu:[{role:'reload'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'}]}]));
    const check=(event:Electron.IpcMainInvokeEvent)=>{
      if(!window||event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame||event.senderFrame.url!==allowedUrl)throw new Error('Untrusted renderer');
    };
    ipcMain.handle('strip:view',event=>{check(event);return service!.view;});
    let tail:Promise<unknown>=Promise.resolve();
    ipcMain.handle('strip:command',(event,raw)=>{
      check(event);const c=validateCommand(raw);
      const action=tail.then(async()=>{
        if(!service||!window)return;
        if(c.type==='auth-open'){
          const url=service.view.device?.url;
          if(url&&new URL(url).origin==='https://www.twitch.tv'&&new URL(url).pathname==='/activate')await shell.openExternal(url);
        }else if(c.type==='copy-overlay')clipboard.writeText(service.view.overlayUrl);
        else if(c.type==='export'){
          const result=await dialog.showSaveDialog(window,{title:'Export redacted incident history',defaultPath:'signalstrip-history.json',filters:[{name:'JSON',extensions:['json']}]});
          if(!result.canceled&&result.filePath){
            const incidents=[...(service.state.incident?[service.state.incident]:[]),...service.state.history].map(i=>({
              id:i.id,mode:i.mode,startedAt:i.startedAt,endedAt:i.endedAt,outcome:i.outcome,interrupted:i.interrupted,
              reports:active(i.reports).length,withdrawn:i.evidenceWithdrawn,
              changes:i.changes.map(c=>({at:c.at,field:c.field,before:c.before,after:c.after,status:c.status,note:c.note})),
              check:i.check?{id:i.check.id,startedAt:i.check.startedAt,status:i.check.status,matchingAccounts:active(i.check.responses).length}:null,
            }));
            await writeFile(result.filePath,JSON.stringify({app:'SignalStrip',version:app.getVersion(),exportedAt:new Date().toISOString(),incidents},null,2));
          }
        }else{
          await service.command(c);
          if(c.type==='compact'){
            window.setAlwaysOnTop(service.view.compact,'floating');
            window.setMinimumSize(service.view.compact?580:900,service.view.compact?240:640);
            window.setSize(service.view.compact?760:1180,service.view.compact?300:820);
          }
        }
        return service.view;
      }).catch(e=>{if(service){service.view.error=e instanceof Error?e.message:'Operation failed';service.publish();return service.view;}throw e;});
      tail=action.catch(()=>{});return action;
    });
    service.onView=view=>{if(window&&!window.isDestroyed())window.webContents.send('strip:changed',view);};
    await service.initialize();
    await window.loadFile(index);window.center();window.show();
  }).catch(e=>{dialog.showErrorBox('SignalStrip could not start',e instanceof Error?e.message:'Unexpected startup error');quitting=true;app.quit();});
}

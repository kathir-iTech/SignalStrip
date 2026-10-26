import { contextBridge, ipcRenderer } from 'electron';
import type { Command, View } from '../src/core/types';
contextBridge.exposeInMainWorld('signalstrip',{
  getView:()=>ipcRenderer.invoke('strip:view'),
  command:(command:Command)=>ipcRenderer.invoke('strip:command',command),
  subscribe:(callback:(view:View)=>void)=>{
    const listener=(_event:unknown,view:View)=>callback(view);
    ipcRenderer.on('strip:changed',listener);
    return ()=>ipcRenderer.removeListener('strip:changed',listener);
  },
});

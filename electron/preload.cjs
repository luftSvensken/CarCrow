const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('carcrow',{
  call:(action,payload)=>ipcRenderer.invoke('carcrow:call',action,payload),
  onChanged:(callback)=>{const listener=()=>callback();ipcRenderer.on('carcrow:changed',listener);return ()=>ipcRenderer.removeListener('carcrow:changed',listener);}
  ,onAgent:(callback)=>{const listener=(_event,data)=>callback(data);ipcRenderer.on('carcrow:agent',listener);return ()=>ipcRenderer.removeListener('carcrow:agent',listener);}
  ,onMarket:(callback)=>{const listener=(_event,data)=>callback(data);ipcRenderer.on('carcrow:market',listener);return ()=>ipcRenderer.removeListener('carcrow:market',listener);}
});

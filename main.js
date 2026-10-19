const { app, BrowserWindow } = require('electron');

function createWindow () {
  const win = new BrowserWindow({
    width: 1280, 
    height: 720, 
    fullscreen: true, 
    autoHideMenuBar: true
  });
  
  // This points your .exe directly to your live cloud server
  win.loadURL('https://ghosttown-prophunt.onrender.com'); 
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => { 
  if (process.platform !== 'darwin') app.quit(); 
});
const { app, BrowserWindow } = require('electron');
const path = require('path');

app.setName("Mimic's Edge: Echoes of Ghost Town");

function createWindow () {
  const win = new BrowserWindow({
    title: "Mimic's Edge: Echoes of Ghost Town",
    width: 1280,
    height: 720,
    fullscreen: true,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.ico')
  });

  // This points your .exe directly to your live cloud server
  win.loadURL('https://ghosttown-prophunt.onrender.com');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
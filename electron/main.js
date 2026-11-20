const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Activer le support haute fréquence et Windows Ink / DirectManipulation pour les stylets PC
app.commandLine.appendSwitch('enable-features', 'PointerEvent,TouchpadAndWheelScrollLatching');
app.commandLine.appendSwitch('high-dpi-support', '1');

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    title: 'InkFlow — Notes Manuscrites',
    icon: path.join(__dirname, '..', 'src-tauri', 'icons', 'icon.ico'),
    backgroundColor: '#f3f2ee',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

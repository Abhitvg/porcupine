const { Porcupine } = require('@picovoice/porcupine-node');
const { db } = require('./db');

// You will need a Picovoice AccessKey from console.picovoice.ai
const PICOVOICE_ACCESS_KEY = "YOUR_PICOVOICE_ACCESS_KEY"; 

function startVoiceListener(ipcMain, mainWindow) {
  console.log("[VOICE] Starting voice listener...");
  
  // NOTE: In a real environment, you need an audio recording library (e.g., @picovoice/pvrecorder-node)
  // to feed audio frames into porcupine.process(frame).
  
  // For the MVP, we simulate a wake word detection event and TTS processing.
  
  ipcMain.on('simulate-wake-word', () => {
    console.log("[VOICE] Wake word 'dopa' detected!");
    
    // Log to DB
    db.prepare("INSERT INTO logs (agent_id, message) VALUES (?, ?)").run('SYSTEM', 'Wake word "dopa" detected.');
    
    // Notify the UI to show active listening state
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('voice-status', { isListening: true });
    }
    
    // Simulate processing a voice command
    setTimeout(() => {
      const command = "Publish the latest SEO article.";
      db.prepare("INSERT INTO logs (agent_id, message) VALUES (?, ?)").run('USER', command);
      
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('voice-status', { isListening: false });
        mainWindow.webContents.send('voice-command', command);
      }
    }, 3000);
  });
}

module.exports = { startVoiceListener };

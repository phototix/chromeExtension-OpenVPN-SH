let isConnected = false;
let ovpnConfig = null;
const activePorts = new Set();

// Update connection state and UI
function updateConnectionState(connected) {
  isConnected = connected;
  chrome.action.setIcon({
    path: connected ? "icons/connected.png" : "icons/disconnected.png"
  });
  broadcastStatus();
}

function broadcastStatus() {
  activePorts.forEach(port => {
    try {
      port.postMessage({
        type: "status", 
        connected: isConnected,
        config: ovpnConfig?.raw || null
      });
    } catch (e) {
      activePorts.delete(port);
    }
  });
}

function parseOVPNConfig(configText) {
  if (typeof configText !== 'string') throw new Error("Config must be a string");
  
  const config = { 
    remotes: [],
    certificates: {},
    raw: configText
  };

  const lines = configText.split('\n');
  let currentSection = null;

  for (const line of lines) {
    const trimmed = line.trim();
    
    // Handle sections
    if (trimmed.startsWith('<')) {
      if (trimmed.startsWith('<ca>')) currentSection = 'ca';
      else if (trimmed.startsWith('<cert>')) currentSection = 'cert';
      else if (trimmed.startsWith('<key>')) currentSection = 'key';
      else if (trimmed.startsWith('<tls-crypt>')) currentSection = 'tls-crypt';
      else if (trimmed.startsWith('</')) currentSection = null;
      continue;
    }

    // Parse sections
    if (currentSection) {
      if (!config.certificates[currentSection]) {
        config.certificates[currentSection] = '';
      }
      config.certificates[currentSection] += line + '\n';
      continue;
    }

    // Parse remote servers
    if (trimmed.startsWith('remote ')) {
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 3) {
        config.remotes.push({
          host: parts[1],
          port: parts[2],
          proto: parts[3] || 'tcp'
        });
      }
    }
    
    // Parse auth method
    if (trimmed.startsWith('auth-user-pass')) {
      config.auth = 'user-pass';
    }
    
    // Parse cipher
    if (trimmed.startsWith('cipher ')) {
      config.cipher = trimmed.split(' ')[1];
    }
  }

  if (config.remotes.length === 0) throw new Error("No remote servers found in config");
  return config;
}

// Connection management
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "popup") {
    activePorts.add(port);
    
    // Send initial state
    port.postMessage({
      type: "init",
      connected: isConnected,
      config: ovpnConfig?.raw || null
    });

    port.onDisconnect.addListener(() => {
      activePorts.delete(port);
    });

    port.onMessage.addListener((msg) => {
      if (msg.type === "getStatus") {
        port.postMessage({
          type: "status",
          connected: isConnected,
          config: ovpnConfig?.raw || null
        });
      }
    });
  }
});

// Message handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    switch (request.action) {
      case "connect":
        ovpnConfig = parseOVPNConfig(request.config.raw);
        chrome.storage.local.set({ovpnConfig: ovpnConfig});
        updateConnectionState(true);
        sendResponse({success: true});
        break;
        
      case "disconnect":
        updateConnectionState(false);
        sendResponse({success: true});
        break;
        
      case "getStatus":
        sendResponse({
          success: true, 
          connected: isConnected,
          config: ovpnConfig?.raw || null
        });
        break;
        
      case "saveConfig":
        ovpnConfig = parseOVPNConfig(request.config.raw);
        chrome.storage.local.set({ovpnConfig: ovpnConfig});
        sendResponse({success: true});
        break;
        
      case "getConfig":
        sendResponse({
          success: true,
          config: ovpnConfig?.raw || null
        });
        break;
        
      default:
        sendResponse({success: false, error: "Unknown action"});
    }
  } catch (e) {
    sendResponse({success: false, error: e.message});
  }
  return true;
});

// Load saved config on startup
chrome.storage.local.get(['ovpnConfig'], (result) => {
  if (result.ovpnConfig?.raw) {
    try {
      ovpnConfig = parseOVPNConfig(result.ovpnConfig.raw);
    } catch (e) {
      console.error("Failed to load saved config:", e);
      chrome.storage.local.remove(['ovpnConfig']);
    }
  }
});
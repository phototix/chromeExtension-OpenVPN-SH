let isConnected = false;
let ovpnConfig = null;

// Load saved config from storage
chrome.storage.local.get(['ovpnConfig'], function(result) {
  if (result.ovpnConfig) {
    ovpnConfig = result.ovpnConfig;
  }
});

// Handle connection state changes
function updateConnectionState(connected) {
  isConnected = connected;
  chrome.action.setIcon({
    path: connected ? "icons/connected.png" : {
      "16": "icons/connected.png",
      "32": "icons/connected.png",
      "48": "icons/connected.png",
      "128": "icons/connected.png"
    }
  });
}

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "connect") {
    connectToVPN(request.config);
    sendResponse({status: "connecting"});
  } else if (request.action === "disconnect") {
    disconnectVPN();
    sendResponse({status: "disconnecting"});
  } else if (request.action === "getStatus") {
    sendResponse({connected: isConnected});
  } else if (request.action === "saveConfig") {
    saveConfig(request.config);
    sendResponse({status: "saved"});
  }
  return true;
});

function connectToVPN(config) {
  // In a real implementation, this would interface with OpenVPN
  // For this example, we'll simulate the connection
  
  // Parse the .ovpn config
  try {
    ovpnConfig = parseOVPNConfig(config);
    chrome.storage.local.set({ovpnConfig: ovpnConfig});
    
    // Set up proxy settings (simplified)
    chrome.proxy.settings.set({
      scope: 'regular',
      value: {
        mode: 'fixed_servers',
        rules: {
          singleProxy: {
            scheme: 'socks5',
            host: ovpnConfig.remote,
            port: ovpnConfig.port || 1080
          },
          bypassList: ['localhost', '127.0.0.1']
        }
      }
    });
    
    updateConnectionState(true);
    console.log("Connected to VPN");
  } catch (e) {
    console.error("Failed to connect:", e);
  }
}

function disconnectVPN() {
  chrome.proxy.settings.clear({scope: 'regular'});
  updateConnectionState(false);
  console.log("Disconnected from VPN");
}

function saveConfig(config) {
  ovpnConfig = config;
  chrome.storage.local.set({ovpnConfig: config});
}

// Simple OVPN config parser
function parseOVPNConfig(configText) {
  const lines = configText.split('\n');
  const config = {};
  
  for (const line of lines) {
    if (line.startsWith('remote ')) {
      const parts = line.split(' ');
      config.remote = parts[1];
      config.port = parts[2] || 1194;
    } else if (line.startsWith('proto ')) {
      config.proto = line.split(' ')[1];
    }
    // Add more parsing as needed
  }
  
  if (!config.remote) {
    throw new Error("No remote server found in config");
  }
  
  return config;
}
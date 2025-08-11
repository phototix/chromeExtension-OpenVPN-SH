document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const elements = {
    connectBtn: document.getElementById('connect-btn'),
    disconnectBtn: document.getElementById('disconnect-btn'),
    saveConfigBtn: document.getElementById('save-config'),
    ovpnConfigTextarea: document.getElementById('ovpn-config'),
    importBtn: document.getElementById('import-btn'),
    exportBtn: document.getElementById('export-btn'),
    statusElement: document.getElementById('status'),
    errorDisplay: document.getElementById('error-display'),
    connectionDetails: document.getElementById('connection-details')
  };

  let popupPort = null;
  let currentStatus = false;

  // UI Functions
  function updateUI(connected) {
    currentStatus = connected;
    elements.statusElement.className = `status ${connected ? 'connected' : 'disconnected'}`;
    elements.statusElement.querySelector('.status-text').textContent = 
      connected ? 'Connected' : 'Disconnected';
    elements.connectBtn.disabled = connected;
    elements.disconnectBtn.disabled = !connected;
    elements.ovpnConfigTextarea.disabled = connected;
    elements.saveConfigBtn.disabled = connected;
  }

  function showError(message, duration = 3000) {
    elements.errorDisplay.textContent = message || '';
    elements.errorDisplay.style.display = message ? 'block' : 'none';
    if (duration && message) {
      setTimeout(() => showError(''), duration);
    }
  }

  function setLoading(loading) {
    elements.connectBtn.disabled = loading;
    elements.disconnectBtn.disabled = loading;
    elements.connectBtn.textContent = loading ? 'Connecting...' : 'Connect';
    elements.disconnectBtn.textContent = loading ? 'Disconnecting...' : 'Disconnect';
  }

  function showConnectionDetails(config) {
    if (!config?.remotes?.length) {
      elements.connectionDetails.innerHTML = '';
      return;
    }
    
    const firstRemote = config.remotes[0];
    elements.connectionDetails.innerHTML = `
      <h4>Connection Details</h4>
      <p><strong>Server:</strong> ${firstRemote.host}:${firstRemote.port} (${firstRemote.proto})</p>
      ${config.cipher ? `<p><strong>Cipher:</strong> ${config.cipher}</p>` : ''}
      ${config.auth ? `<p><strong>Auth:</strong> ${config.auth}</p>` : ''}
    `;
  }

  // Config Functions
  function parseSimpleConfig(configText) {
    try {
      if (!configText) return null;
      
      const config = { remotes: [] };
      const lines = configText.split('\n');
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('remote ')) {
          const parts = trimmed.split(/\s+/);
          if (parts.length >= 3) {
            config.remotes.push({
              host: parts[1],
              port: parts[2],
              proto: parts[3] || 'tcp'
            });
          }
        } else if (trimmed.startsWith('cipher ')) {
          config.cipher = trimmed.split(' ')[1];
        } else if (trimmed.startsWith('auth-user-pass')) {
          config.auth = 'Username/Password';
        }
      }
      return config;
    } catch (e) {
      console.error("Config parsing error:", e);
      return null;
    }
  }

  // Connection Functions
  function setupPort() {
    try {
      popupPort = chrome.runtime.connect({name: "popup"});
      
      popupPort.onMessage.addListener((msg) => {
        if (msg.type === "init" || msg.type === "status") {
          updateUI(msg.connected);
          if (msg.config) {
            elements.ovpnConfigTextarea.value = msg.config;
            showConnectionDetails(parseSimpleConfig(msg.config));
          }
        }
      });
      
      popupPort.onDisconnect.addListener(() => {
        popupPort = null;
        checkStatusViaMessage();
      });
      
    } catch (e) {
      console.error("Port connection failed:", e);
      checkStatusViaMessage();
    }
  }

  async function checkStatusViaMessage() {
    try {
      const response = await chrome.runtime.sendMessage({action: "getStatus"});
      if (response.success) {
        updateUI(response.connected);
        if (response.config) {
          elements.ovpnConfigTextarea.value = response.config;
          showConnectionDetails(parseSimpleConfig(response.config));
        }
      }
    } catch (error) {
      console.error("Status check failed:", error);
    }
  }

  async function loadSavedConfig() {
    try {
      const response = await chrome.runtime.sendMessage({action: "getConfig"});
      if (response.success && response.config) {
        elements.ovpnConfigTextarea.value = response.config;
        showConnectionDetails(parseSimpleConfig(response.config));
      }
    } catch (error) {
      console.error("Failed to load config:", error);
    }
  }

  // Event Handlers
  async function handleConnect() {
    const config = elements.ovpnConfigTextarea.value.trim();
    if (!config) {
      showError("Please paste your .ovpn config first");
      return;
    }

    setLoading(true);
    showError('');
    
    try {
      const response = await chrome.runtime.sendMessage({
        action: "connect",
        config: { raw: config }
      });
      
      if (!response.success) throw new Error(response.error || "Connection failed");
      
      showConnectionDetails(parseSimpleConfig(config));
      showError("Connected successfully!", 2000);
      
    } catch (error) {
      showError(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    setLoading(true);
    try {
      const response = await chrome.runtime.sendMessage({action: "disconnect"});
      if (!response.success) throw new Error(response.error || "Disconnection failed");
      showError("Disconnected successfully!", 2000);
    } catch (error) {
      showError(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveConfig() {
    const config = elements.ovpnConfigTextarea.value.trim();
    if (!config) {
      showError("Config is empty");
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        action: "saveConfig",
        config: { raw: config }
      });
      
      if (!response.success) throw new Error(response.error || "Failed to save config");
      
      showError("Config saved successfully!", 2000);
      showConnectionDetails(parseSimpleConfig(config));
      
    } catch (error) {
      showError(error.message);
    }
  }

  function handleImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ovpn,.conf';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      try {
        const content = await readFileAsText(file);
        elements.ovpnConfigTextarea.value = content;
        showConnectionDetails(parseSimpleConfig(content));
      } catch (error) {
        showError("Failed to read config file");
        console.error(error);
      }
    };
    input.click();
  }

  function handleExport() {
    const config = elements.ovpnConfigTextarea.value.trim();
    if (!config) {
      showError("No config to export");
      return;
    }
    
    const blob = new Blob([config], {type: 'text/plain'});
    const url = URL.createObjectURL(blob);
    
    chrome.downloads.download({
      url: url,
      filename: 'vpn-config.ovpn',
      saveAs: true
    });
  }

  // Helper Functions
  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => resolve(event.target.result);
      reader.onerror = (error) => reject(error);
      reader.readAsText(file);
    });
  }

  // Initialize
  setupPort();
  loadSavedConfig();

  // Event Listeners
  elements.connectBtn.addEventListener('click', handleConnect);
  elements.disconnectBtn.addEventListener('click', handleDisconnect);
  elements.saveConfigBtn.addEventListener('click', handleSaveConfig);
  elements.importBtn.addEventListener('click', handleImport);
  elements.exportBtn.addEventListener('click', handleExport);
});
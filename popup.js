document.addEventListener('DOMContentLoaded', function() {
  const connectBtn = document.getElementById('connect-btn');
  const disconnectBtn = document.getElementById('disconnect-btn');
  const saveConfigBtn = document.getElementById('save-config');
  const ovpnConfigTextarea = document.getElementById('ovpn-config');
  const importBtn = document.getElementById('import-btn');
  const exportBtn = document.getElementById('export-btn');
  const statusElement = document.getElementById('status');
  
  // Check current status
  chrome.runtime.sendMessage({action: "getStatus"}, function(response) {
    updateUI(response.connected);
  });
  
  // Load saved config
  chrome.storage.local.get(['ovpnConfig'], function(result) {
    if (result.ovpnConfig && result.ovpnConfig.raw) {
      ovpnConfigTextarea.value = result.ovpnConfig.raw;
    }
  });
  
  // Connect button
  connectBtn.addEventListener('click', function() {
    const config = ovpnConfigTextarea.value;
    if (!config) {
      alert("Please paste your .ovpn config first");
      return;
    }
    
    chrome.runtime.sendMessage({
      action: "connect",
      config: { raw: config }
    }, function(response) {
      if (response.status === "connecting") {
        updateUI(true);
      }
    });
  });
  
  // Disconnect button
  disconnectBtn.addEventListener('click', function() {
    chrome.runtime.sendMessage({action: "disconnect"}, function(response) {
      if (response.status === "disconnecting") {
        updateUI(false);
      }
    });
  });
  
  // Save config button
  saveConfigBtn.addEventListener('click', function() {
    const config = ovpnConfigTextarea.value;
    if (!config) {
      alert("Config is empty");
      return;
    }
    
    chrome.runtime.sendMessage({
      action: "saveConfig",
      config: { raw: config }
    }, function(response) {
      if (response.status === "saved") {
        alert("Config saved");
      }
    });
  });
  
  // Import config button
  importBtn.addEventListener('click', function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ovpn';
    
    input.onchange = e => {
      const file = e.target.files[0];
      const reader = new FileReader();
      
      reader.onload = event => {
        ovpnConfigTextarea.value = event.target.result;
      };
      
      reader.readAsText(file);
    };
    
    input.click();
  });
  
  // Export config button
  exportBtn.addEventListener('click', function() {
    const config = ovpnConfigTextarea.value;
    if (!config) {
      alert("No config to export");
      return;
    }
    
    const blob = new Blob([config], {type: 'text/plain'});
    const url = URL.createObjectURL(blob);
    
    chrome.downloads.download({
      url: url,
      filename: 'vpn-config.ovpn',
      saveAs: true
    });
  });
  
  // Update UI based on connection status
  function updateUI(connected) {
    if (connected) {
      statusElement.className = "status connected";
      statusElement.querySelector('.status-text').textContent = "Connected";
      connectBtn.disabled = true;
      disconnectBtn.disabled = false;
      ovpnConfigTextarea.disabled = true;
      saveConfigBtn.disabled = true;
    } else {
      statusElement.className = "status disconnected";
      statusElement.querySelector('.status-text').textContent = "Disconnected";
      connectBtn.disabled = false;
      disconnectBtn.disabled = true;
      ovpnConfigTextarea.disabled = false;
      saveConfigBtn.disabled = false;
    }
  }
});
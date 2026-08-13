/**
 * GestureForge WebSocket Bridge
 * Connection stub to communicate with local Python scripts.
 */
class WebSocketBridge {
  constructor(url = 'ws://localhost:8765') {
    this.url = url;
    this.socket = null;
    this.isConnected = false;
  }

  connect() {
    console.log(`Connecting to WebSocket bridge at ${this.url} (Mocked)...`);
    this.isConnected = true;
  }

  send(data) {
    if (this.isConnected) {
      // Mock sent data
      // console.log("WebSocket sent:", data);
    }
  }
}

window.WebSocketBridge = WebSocketBridge;

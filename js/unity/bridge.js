/**
 * GestureForge Unity WebGL Bridge
 * Implements the Unity WebGL SendMessage API wrapper, mapping gesture calls to the engine.
 */
class UnityBridge {
  constructor() {
    this.gameInstance = null;
  }

  setGameInstance(instance) {
    this.gameInstance = instance;
  }

  sendMessage(objectName, methodName, value) {
    console.log(`[UnityBridge] SendMessage: ${objectName}.${methodName}(${value})`);
    
    // In our 2D HTML5 canvas context, direct the message to the active game simulation
    if (this.gameInstance && typeof this.gameInstance.handleGestureInput === 'function') {
      try {
        const payload = JSON.parse(value);
        this.gameInstance.handleGestureInput(payload.gesture, payload.confidence, payload.predictedX);
      } catch (e) {
        // Fallback for simple string parameter values
        this.gameInstance.handleGestureInput(value, 1.0, undefined);
      }
    }
  }
}

window.UnityBridge = new UnityBridge();

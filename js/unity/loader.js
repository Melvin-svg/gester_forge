/**
 * GestureForge Unity Instance Initialization / Loader Wrapper
 * Loads the 2D Game Engine onto the #unity-canvas.
 */
class UnityLoader {
  constructor(canvasId) {
    this.canvasId = canvasId;
    this.gameInstance = null;
  }

  load() {
    console.log(`[UnityLoader] Initializing 2D RPG engine on #${this.canvasId}...`);
    this.gameInstance = new CyberGameEngine(this.canvasId);
    // Bind game instance to the bridge wrapper
    window.UnityBridge.setGameInstance(this.gameInstance);
    return this.gameInstance;
  }
}

window.UnityLoader = UnityLoader;

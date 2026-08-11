/**
 * GestureForge Minimap Canvas Renderer
 * Displays player, enemies, and items on a procedural radar.
 */
class MinimapController {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (this.canvas) {
      this.ctx = this.canvas.getContext('2d');
      this.coordsEl = document.getElementById('mm-coords');
    }
  }

  update(player, enemies, projectiles) {
    if (!this.canvas) return;

    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw background radar grids
    this.ctx.strokeStyle = 'rgba(91, 141, 239, 0.1)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.arc(this.canvas.width / 2, this.canvas.height / 2, 40, 0, Math.PI * 2);
    this.ctx.arc(this.canvas.width / 2, this.canvas.height / 2, 80, 0, Math.PI * 2);
    this.ctx.stroke();

    // Map game coordinates (800x450) to canvas (120x120)
    const mapCoords = (x, y) => {
      const rx = (x / 800) * this.canvas.width;
      const ry = (y / 450) * this.canvas.height;
      return { x: rx, y: ry };
    };

    // Draw enemies
    this.ctx.fillStyle = '#f87171'; // Enemy red
    enemies.forEach(e => {
      const pt = mapCoords(e.x, e.y);
      this.ctx.beginPath();
      this.ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
      this.ctx.fill();
    });

    // Draw player
    this.ctx.fillStyle = '#5b8def'; // Player accent blue
    const pPt = mapCoords(player.x, player.y);
    this.ctx.beginPath();
    this.ctx.arc(pPt.x, pPt.y, 4, 0, Math.PI * 2);
    this.ctx.fill();

    // Update text coordinate display
    if (this.coordsEl) {
      this.coordsEl.textContent = `${Math.round(player.x)}, ${Math.round(player.y)}`;
    }
  }
}

window.MinimapController = MinimapController;

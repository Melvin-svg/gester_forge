/**
 * GestureForge Camera Handler
 * Manages webcam streams, HTML5 Video, and canvas overlays.
 */
class CyberCamera {
  constructor(videoElementId, trackingCanvasId) {
    this.video = document.getElementById(videoElementId);
    this.canvas = document.getElementById(trackingCanvasId);
    this.ctx = this.canvas.getContext('2d');
    this.stream = null;
    this.width = 640;
    this.height = 480;
    this.isMirrored = true;
  }

  /**
   * Request webcam access and bind stream to video element
   */
  async start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Your browser does not support webcam capture.');
    }

    const constraints = {
      video: {
        width: { ideal: this.width },
        height: { ideal: this.height },
        facingMode: 'user',
        frameRate: { ideal: 30 }
      },
      audio: false
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      console.warn("Using mock media stream due to getUserMedia failure:", e);
      const mockCanvas = document.createElement('canvas');
      mockCanvas.width = this.width;
      mockCanvas.height = this.height;
      const mockCtx = mockCanvas.getContext('2d');
      mockCtx.fillStyle = '#0c0c14';
      mockCtx.fillRect(0, 0, this.width, this.height);
      
      mockCtx.fillStyle = '#6a6a7a';
      mockCtx.font = "14px monospace";
      mockCtx.fillText("MOCK CAMERA STREAM (NO DEVICE)", 20, 40);

      this.stream = mockCanvas.captureStream(30);
      
      let angle = 0;
      const interval = setInterval(() => {
        if (!this.stream.active) {
          clearInterval(interval);
          return;
        }
        mockCtx.fillStyle = '#0c0c14';
        mockCtx.fillRect(0, 0, this.width, this.height);
        
        mockCtx.strokeStyle = 'rgba(91, 141, 239, 0.15)';
        mockCtx.strokeRect(20, 20, this.width - 40, this.height - 40);
        
        mockCtx.fillStyle = '#5b8def';
        mockCtx.font = "14px monospace";
        mockCtx.fillText("MOCK CAMERA STREAM (NO DEVICE)", 40, 50);
        
        mockCtx.fillStyle = 'rgba(91, 141, 239, 0.3)';
        mockCtx.beginPath();
        const cx = this.width / 2 + Math.cos(angle) * 100;
        const cy = this.height / 2 + Math.sin(angle) * 100;
        mockCtx.arc(cx, cy, 15, 0, 2 * Math.PI);
        mockCtx.fill();
        angle += 0.05;
      }, 33);
    }
    this.video.srcObject = this.stream;

    // Wait for metadata so we know the true frame size.
    await new Promise((resolve, reject) => {
      const onLoaded = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error('The webcam stream failed to load.'));
      };
      const cleanup = () => {
        this.video.removeEventListener('loadedmetadata', onLoaded);
        this.video.removeEventListener('error', onError);
      };

      if (this.video.readyState >= 1) {
        cleanup();
        resolve();
        return;
      }

      this.video.addEventListener('loadedmetadata', onLoaded);
      this.video.addEventListener('error', onError);
    });

    try {
      await this.video.play();
    } catch (err) {
      console.warn('Video playback did not start automatically: ', err);
    }

    this.resizeCanvas();
    return this.stream;
  }

  /**
   * Stop the camera stream
   */
  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.video.srcObject = null;
      this.stream = null;
    }
  }

  /**
   * Size the tracking canvas to its on-screen box.
   */
  resizeCanvas() {
    this.width = this.video.videoWidth || this.width;
    this.height = this.video.videoHeight || this.height;

    const viewport = this.video.parentElement;
    if (viewport) {
      const w = viewport.clientWidth;
      const h = viewport.clientHeight;
      if (w > 0 && h > 0) {
        this.canvas.width = w;
        this.canvas.height = h;
      }
    }
  }

  /**
   * Set mirrored state
   */
  setMirror(mirror) {
    this.isMirrored = mirror;
    if (mirror) {
      this.video.style.transform = 'scaleX(-1)';
    } else {
      this.video.style.transform = 'scaleX(1)';
    }
  }

  /**
   * Clears the drawing canvas overlay.
   */
  clearCanvas() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Draws a complete skeleton coordinate point on the canvas.
   */
  drawSkeleton(landmarks) {
    this.clearCanvas();
    if (!landmarks || landmarks.length === 0) return;

    // Scale calculations
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Helper: translate coordinates to canvas space (applying mirror if needed)
    const mapPt = (pt) => {
      let x = pt.x * w;
      let y = pt.y * h;
      if (this.isMirrored) {
        x = w - x;
      }
      return { x, y };
    };

    // Draw connection lines
    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
      [0, 5], [5, 6], [6, 7], [7, 8],       // Index
      [5, 9], [9, 10], [10, 11], [11, 12],  // Middle
      [9, 13], [13, 14], [14, 15], [15, 16], // Ring
      [13, 17], [17, 18], [18, 19], [19, 20], // Pinky
      [0, 17] // Wrist base loop
    ];

    this.ctx.strokeStyle = '#5b8def';
    this.ctx.lineWidth = 2;

    connections.forEach(([i, j]) => {
      const p1 = mapPt(landmarks[i]);
      const p2 = mapPt(landmarks[j]);
      this.ctx.beginPath();
      this.ctx.moveTo(p1.x, p1.y);
      this.ctx.lineTo(p2.x, p2.y);
      this.ctx.stroke();
    });

    // Draw joints
    this.ctx.fillStyle = '#f0f0f5';
    for (let i = 0; i < landmarks.length; i++) {
      const p = mapPt(landmarks[i]);
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, i === 0 ? 6 : 4, 0, 2 * Math.PI);
      this.ctx.fill();
    }
  }
}

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

    // Optional small picture-in-picture canvas (camera + skeleton), used to
    // keep hand tracking visible while the player is focused on the game.
    this.pipCanvas = null;
    this.pipCtx = null;
  }

  /**
   * Attach a small secondary canvas that mirrors the camera feed + skeleton.
   */
  setPipCanvas(canvasId) {
    this.pipCanvas = document.getElementById(canvasId);
    this.pipCtx = this.pipCanvas ? this.pipCanvas.getContext('2d') : null;
  }

  /**
   * Draw the current video frame and hand skeleton into the PiP canvas.
   */
  drawPip(landmarks) {
    if (!this.pipCanvas || !this.pipCtx || !this.video.videoWidth) return;

    // Keep the backing store matching the box's on-screen size for crisp lines.
    const boxW = Math.round(this.pipCanvas.clientWidth) || 160;
    const boxH = Math.round(this.pipCanvas.clientHeight) || 120;
    if (this.pipCanvas.width !== boxW || this.pipCanvas.height !== boxH) {
      this.pipCanvas.width = boxW;
      this.pipCanvas.height = boxH;
    }

    const ctx = this.pipCtx;
    const vidW = this.video.videoWidth;
    const vidH = this.video.videoHeight;
    const scale = Math.max(boxW / vidW, boxH / vidH);
    const drawW = vidW * scale;
    const drawH = vidH * scale;
    const offsetX = (boxW - drawW) / 2;
    const offsetY = (boxH - drawH) / 2;

    ctx.save();
    ctx.clearRect(0, 0, boxW, boxH);

    if (this.isMirrored) {
      ctx.translate(boxW, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(this.video, offsetX, offsetY, drawW, drawH);
    ctx.restore();

    if (!landmarks || landmarks.length === 0) return;

    // Reuse the same projection math as the main overlay so the skeleton
    // lines up with the frame drawn above.
    const project = (nx, ny) => {
      let x = offsetX + nx * drawW;
      const y = offsetY + ny * drawH;
      if (this.isMirrored) x = boxW - x;
      return { x, y };
    };
    const pts = landmarks.map(lm => project(lm.x, lm.y));

    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [9, 10], [10, 11], [11, 12],
      [13, 14], [14, 15], [15, 16],
      [17, 18], [18, 19], [19, 20],
      [5, 9], [9, 13], [13, 17],
      [0, 17]
    ];

    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.7)';
    for (const [start, end] of connections) {
      const p1 = pts[start];
      const p2 = pts[end];
      if (p1 && p2) {
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }

    pts.forEach((p, index) => {
      ctx.fillStyle = index === 0 ? '#39ff14' : ([4, 8, 12, 16, 20].includes(index) ? '#ff007f' : '#00f0ff');
      ctx.beginPath();
      ctx.arc(p.x, p.y, index === 0 ? 3 : 2, 0, 2 * Math.PI);
      ctx.fill();
    });
    ctx.restore();
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

    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.video.srcObject = this.stream;

    // Wait for metadata so we know the true frame size.
    // Metadata can already be available by the time we get here (warm camera,
    // previously granted permission), in which case the event never fires
    // again - so check readyState first instead of only listening.
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

      // HAVE_METADATA (1) or better means dimensions are already known
      if (this.video.readyState >= 1) {
        cleanup();
        resolve();
        return;
      }

      this.video.addEventListener('loadedmetadata', onLoaded);
      this.video.addEventListener('error', onError);
    });

    // play() rejects if the element is detached or autoplay is blocked;
    // it must not take down camera startup.
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
   *
   * The canvas is stretched to fill the viewport by CSS, so its backing store
   * must match the displayed box - otherwise drawing is scaled non-uniformly.
   * The video/canvas aspect mismatch is handled in videoToCanvas() instead.
   */
  resizeCanvas() {
    this.width = this.video.videoWidth || this.width;
    this.height = this.video.videoHeight || this.height;

    const viewport = this.video.parentElement;
    const boxW = Math.round(viewport.clientWidth) || this.width;
    const boxH = Math.round(viewport.clientHeight) || this.height;

    if (this.canvas.width !== boxW || this.canvas.height !== boxH) {
      this.canvas.width = boxW;
      this.canvas.height = boxH;
    }

    console.log(`Camera initialized: ${this.width}x${this.height} (viewport ${boxW}x${boxH})`);
  }

  /**
   * Set mirroring mode
   */
  setMirror(mirror) {
    this.isMirrored = mirror;
    const viewport = this.video.parentElement;
    if (mirror) {
      viewport.classList.remove('no-mirror');
    } else {
      viewport.classList.add('no-mirror');
    }
  }

  /**
   * Map a normalized landmark (0-1 in raw video space) to canvas pixels.
   *
   * The video element uses `object-fit: cover`, so it is scaled up until it
   * fills the box and the overflow is cropped equally on both sides. The same
   * transform has to be applied to the landmarks or the skeleton drifts away
   * from the hand on any webcam whose aspect ratio isn't the box's.
   */
  videoToCanvas(nx, ny) {
    const boxW = this.canvas.width;
    const boxH = this.canvas.height;
    const vidW = this.width;
    const vidH = this.height;

    const scale = Math.max(boxW / vidW, boxH / vidH);
    const drawW = vidW * scale;
    const drawH = vidH * scale;
    const offsetX = (boxW - drawW) / 2;
    const offsetY = (boxH - drawH) / 2;

    let x = offsetX + nx * drawW;
    const y = offsetY + ny * drawH;

    // The video is mirrored by CSS; the canvas is not, so flip here to match.
    if (this.isMirrored) {
      x = boxW - x;
    }

    return { x, y };
  }

  /**
   * Clear the overlay canvas
   */
  clearCanvas() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Draw hand landmarks and skeletal lines on tracking overlay
   */
  drawSkeleton(landmarks) {
    if (!landmarks || landmarks.length === 0) return;

    const ctx = this.ctx;
    this.clearCanvas();

    // Project every landmark into canvas space once
    const pts = landmarks.map(lm => this.videoToCanvas(lm.x, lm.y));

    ctx.save();

    // MediaPipe Hands connections (21-landmark topology)
    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4],        // Thumb
      [0, 5], [5, 6], [6, 7], [7, 8],        // Index
      [9, 10], [10, 11], [11, 12],           // Middle
      [13, 14], [14, 15], [15, 16],          // Ring
      [17, 18], [18, 19], [19, 20],          // Pinky
      [5, 9], [9, 13], [13, 17],             // Palm knuckles
      [0, 17]                                // Wrist to pinky base
    ];

    // Draw connection lines (bones)
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.6)'; // Neon Cyan
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#00f0ff';

    for (const [start, end] of connections) {
      const p1 = pts[start];
      const p2 = pts[end];
      if (p1 && p2) {
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }

    // Draw joints (landmarks)
    ctx.shadowBlur = 5;
    ctx.shadowColor = '#ff007f'; // Neon Pink

    pts.forEach((p, index) => {
      // Fingertips are drawn smaller and pink; the wrist anchor green
      let radius = 5;
      if ([4, 8, 12, 16, 20].includes(index)) {
        ctx.fillStyle = '#ff007f';
        radius = 4;
      } else if (index === 0) {
        ctx.fillStyle = '#39ff14';
      } else {
        ctx.fillStyle = '#00f0ff';
      }

      // A fresh path per joint - reusing one path fills every previous
      // circle again with the current colour.
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, 2 * Math.PI);
      ctx.fill();
    });

    ctx.restore();
  }
}

// Export class globally
window.CyberCamera = CyberCamera;

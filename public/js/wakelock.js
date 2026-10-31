// Keeps the display from sleeping.
//
// 1. Screen Wake Lock API: works on https:// pages and http://localhost.
// 2. Fallback for plain-http pages: a muted, looping video that covers the
//    page. Browsers hold their own wake lock while a visible video plays.
//    It's best effort, so the HUD says which method is active.

export class Awake {
  constructor() {
    this.state = 'off';
    this.lock = null;
    this.video = null;
    this.error = '';
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.enable();
    });
    setInterval(() => { if (document.visibilityState === 'visible' && !this.isActive()) this.enable(); }, 30000);
  }

  isActive() {
    if (this.lock && !this.lock.released) return true;
    return !!(this.video && !this.video.paused);
  }

  get label() {
    if (this.lock && !this.lock.released) return 'wake lock';
    if (this.video && !this.video.paused) return 'video keep-awake';
    return this.error ? `off (${this.error})` : 'off';
  }

  async enable() {
    if (this.lock && !this.lock.released) return;
    if ('wakeLock' in navigator && window.isSecureContext) {
      try {
        this.lock = await navigator.wakeLock.request('screen');
        this.state = 'lock';
        this.error = '';
        this.lock.addEventListener('release', () => { this.state = 'released'; });
        this.stopVideo();
        return;
      } catch (err) {
        this.error = err.name === 'NotAllowedError' ? 'needs a click' : err.message;
      }
    } else if (!window.isSecureContext) {
      this.error = 'http page: use https or localhost';
    }
    this.startVideo();
  }

  startVideo() {
    if (this.video) { this.video.play().catch(() => {}); return; }
    try {
      const c = document.createElement('canvas');
      c.width = 16; c.height = 16;
      const g = c.getContext('2d');
      let f = 0;
      const paint = () => { g.fillStyle = (f++ & 1) ? '#000000' : '#010101'; g.fillRect(0, 0, 16, 16); };
      paint();
      setInterval(paint, 1000);
      const stream = c.captureStream(2);
      const v = document.createElement('video');
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.setAttribute('playsinline', '');
      v.setAttribute('aria-hidden', 'true');
      v.srcObject = stream;
      Object.assign(v.style, {
        position: 'fixed', inset: '0', width: '100vw', height: '100vh', objectFit: 'cover',
        zIndex: '-1', pointerEvents: 'none', opacity: '1',
      });
      document.body.prepend(v);
      this.video = v;
      v.play().then(() => { this.state = 'video'; }).catch(() => { this.state = 'video-blocked'; });
    } catch (err) {
      this.error = err.message;
    }
  }

  stopVideo() {
    if (!this.video) return;
    this.video.pause();
    this.video.remove();
    this.video = null;
  }
}

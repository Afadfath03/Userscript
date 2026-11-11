// ==UserScript==
// @name         YouTube: Playback Defaults
// @namespace    https://github.com/Afadfath03/Userscript
// @version      1.3
// @description  Set a default speed, theater mode, volume, subtitles and audio track for every video
// @author       Afadfath03
// @homepageURL  https://github.com/Afadfath03/Userscript
// @supportURL   https://github.com/Afadfath03/Userscript/issues
// @downloadURL  https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-playback-defaults.user.js
// @updateURL    https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-playback-defaults.user.js
// @icon         https://raw.githubusercontent.com/Afadfath03/Userscript/main/assets/icons/youtube-playback-defaults.png
// @license      MIT
// @match        https://www.youtube.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// ==/UserScript==

(() => {
  const SPEEDS = ['leave', 0.75, 1, 1.25, 1.5, 1.75, 2];
  const VOLUMES = ['leave', 0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const THEATERS = ['leave', 'on', 'off'];
  const SUBTITLES = ['leave', 'on', 'off'];
  const AUDIOS = ['leave', 'original'];
  const CHOICES = {
    speed: SPEEDS,
    theater: THEATERS,
    volume: VOLUMES,
    subtitles: SUBTITLES,
    audio: AUDIOS,
  };
  const TITLES = {
    speed: 'Speed',
    hotkeys: 'Speed hotkeys',
    theater: 'Theater mode',
    volume: 'Volume',
    subtitles: 'Subtitles',
    audio: 'Audio track',
    pauseHidden: 'Pause when hidden',
  };

  const get = (key, fallback) => {
    const v = GM_getValue(`ytpd.${key}`, fallback);
    return v === undefined || v === null ? fallback : v;
  };
  const put = (key, value) => GM_setValue(`ytpd.${key}`, value);
  const setting = (key, fallback) => (CHOICES[key].includes(get(key, fallback)) ? get(key, fallback) : fallback);

  const speed = () => setting('speed', 'leave');
  const volume = () => setting('volume', 'leave');
  const theater = () => setting('theater', 'leave');
  const subtitles = () => setting('subtitles', 'leave');
  const audio = () => setting('audio', 'leave');
  const hotkeys = () => get('hotkeys', false) === true;
  const pauseHidden = () => get('pauseHidden', false) === true;

  const currentVideo = () => document.querySelector('#movie_player video');
  const player = () => document.getElementById('movie_player');

  function theaterOn() {
    const flexy = document.querySelector('ytd-watch-flexy');
    return flexy ? flexy.hasAttribute('theater') : null;
  }

  let theaterClickedAt = 0;
  let theaterClicks = 0;

  function applyTheater() {
    if (theater() === 'leave' || document.fullscreenElement) return true;
    const on = theaterOn();
    if (on === null || on === (theater() === 'on')) return true;
    // Clicking twice in a row undoes the first click, so space the attempts out
    if (Date.now() - theaterClickedAt < 800) return false;
    // A page that ignores the click would otherwise flip the mode over and over
    if (theaterClicks >= 3) return true;
    const button = document.querySelector('.ytp-size-button');
    if (!button) return false;
    theaterClickedAt = Date.now();
    theaterClicks++;
    button.click();
    return false;
  }

  function applyVideo() {
    const video = currentVideo();
    if (!video) return true;
    let done = true;
    const rate = speed();
    if (rate !== 'leave' && video.playbackRate !== rate) {
      video.playbackRate = rate;
      done = video.playbackRate === rate;
    }
    const level = volume();
    if (level !== 'leave') {
      const target = level / 100;
      if (Math.abs(video.volume - target) > 0.001) video.volume = target;
      if (target > 0 && video.muted) video.muted = false;
      if (Math.abs(video.volume - target) > 0.001) done = false;
    }
    return done;
  }

  let subtitleClickedAt = 0;
  let subtitleClicks = 0;

  function applySubtitles() {
    if (subtitles() === 'leave') return true;
    const button = document.querySelector('.ytp-subtitles-button');
    // Videos without captions keep the button hidden, and there is nothing to set
    if (!button || button.hidden || button.getAttribute('aria-pressed') === null) return true;
    const on = button.getAttribute('aria-pressed') === 'true';
    if (on === (subtitles() === 'on')) return true;
    if (Date.now() - subtitleClickedAt < 400) return false;
    // Toggling is not idempotent, so stop after two attempts
    if (subtitleClicks >= 2) return true;
    subtitleClickedAt = Date.now();
    subtitleClicks++;
    button.click();
    return false;
  }

  let audioSetAt = 0;
  let audioClicks = 0;

  function applyAudio() {
    if (audio() === 'leave') return true;
    const el = player();
    if (!el || typeof el.getAvailableAudioTracks !== 'function') return true;
    const tracks = el.getAvailableAudioTracks() || [];
    if (tracks.length < 2) return true;
    const first = tracks[0];
    const current = typeof el.getAudioTrack === 'function' ? el.getAudioTrack() : null;
    if (current && current.id === first.id) return true;
    if (Date.now() - audioSetAt < 1200) return false;
    if (audioClicks >= 3) return true;
    audioSetAt = Date.now();
    audioClicks++;
    if (typeof el.setAudioTrack === 'function') el.setAudioTrack(first);
    return false;
  }

  let tries = 0;

  function syncPass() {
    const videoDone = applyVideo();
    const theaterDone = applyTheater();
    const subtitlesDone = applySubtitles();
    const audioDone = applyAudio();
    return videoDone && theaterDone && subtitlesDone && audioDone;
  }

  function startSync() {
    tries = 0;
    theaterClicks = 0;
    subtitleClicks = 0;
    audioClicks = 0;
    const tick = () => {
      if (syncPass() || ++tries > 16) return;
      setTimeout(tick, 250);
    };
    tick();
  }

  const hooked = new WeakSet();

  function hookVideo() {
    const video = currentVideo();
    if (!video || hooked.has(video)) return;
    hooked.add(video);
    video.addEventListener('loadedmetadata', startSync);
  }

  function stepRate(delta) {
    const video = currentVideo();
    if (!video) return;
    const next = delta === 0 ? 1 : video.playbackRate + delta;
    video.playbackRate = Math.min(2, Math.max(0.25, Math.round(next * 4) / 4));
  }

  document.addEventListener(
    'keydown',
    (e) => {
      if (!hotkeys() || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key !== '[' && e.key !== ']' && e.key !== '0') return;
      if (document.getElementById('ytpd-panel')) return;
      const target = e.target;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      e.preventDefault();
      e.stopPropagation();
      stepRate(e.key === '0' ? 0 : e.key === ']' ? 0.25 : -0.25);
    },
    true
  );

  let pausedByUs = false;

  document.addEventListener('visibilitychange', () => {
    if (!pauseHidden()) return;
    const video = currentVideo();
    if (!video) return;
    if (document.hidden) {
      if (!video.paused) {
        pausedByUs = true;
        video.pause();
      }
      return;
    }
    if (!pausedByUs) return;
    pausedByUs = false;
    video.play().catch(() => {});
  });

  const CSS = `
#ytpd-backdrop{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5)}
#ytpd-panel{min-width:264px;max-width:88vw;max-height:calc(100vh - 24px);overflow:auto;padding:6px 0 8px;border-radius:12px;background:var(--yt-spec-base-background,#fff);color:var(--yt-spec-text-primary,#0f0f0f);box-shadow:0 12px 32px rgba(0,0,0,.45);font-family:Roboto,Arial,sans-serif}
#ytpd-panel h2{margin:0;padding:12px 20px 6px;font-size:13px;font-weight:500;color:var(--yt-spec-text-secondary,#606060)}
#ytpd-panel button{display:flex;align-items:center;gap:10px;width:100%;min-height:44px;padding:0 20px;border:0;background:none;color:inherit;font:inherit;font-size:14px;text-align:left;cursor:pointer}
#ytpd-panel button:hover{background:var(--yt-spec-badge-chip-background,rgba(0,0,0,.05))}
#ytpd-panel button:focus-visible{outline:2px solid var(--yt-spec-call-to-action,#065fd4);outline-offset:-2px}
#ytpd-panel .ytpd-mark{flex:0 0 14px;font-size:14px;line-height:1;color:inherit}
#ytpd-panel .ytpd-value{margin-left:auto;font-size:13px;color:var(--yt-spec-text-secondary,#606060)}
#ytpd-panel button[aria-current="true"]{font-weight:500}
`;

  let view = { kind: 'settings' };

  function closePanel() {
    document.removeEventListener('keydown', onKey, true);
    document.getElementById('ytpd-backdrop')?.remove();
    document.getElementById('ytpd-style')?.remove();
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closePanel();
      return;
    }
    if (e.key !== 'Tab') return;
    const panel = document.getElementById('ytpd-panel');
    if (!panel) return;
    const items = [...panel.querySelectorAll('button')];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (!items.includes(document.activeElement)) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function settingRow(label, value, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    const name = document.createElement('span');
    name.textContent = label;
    const current = document.createElement('span');
    current.className = 'ytpd-value';
    current.textContent = value;
    button.append(name, current);
    button.addEventListener('click', onClick);
    return button;
  }

  function optionRow(label, active, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    const mark = document.createElement('span');
    mark.className = 'ytpd-mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = active ? '\u2713' : '';
    button.append(mark, document.createTextNode(label));
    if (active) button.setAttribute('aria-current', 'true');
    button.addEventListener('click', onClick);
    return button;
  }

  function optionList(key) {
    if (key === 'speed') return SPEEDS.map((s) => [s, s === 'leave' ? 'Leave as-is' : `${s}x`]);
    if (key === 'volume') return VOLUMES.map((v) => [v, v === 'leave' ? 'Leave as-is' : `${v}%`]);
    if (key === 'audio') return AUDIOS.map((a) => [a, a === 'leave' ? 'Leave as-is' : 'Original (first track)']);
    const values = key === 'subtitles' ? SUBTITLES : THEATERS;
    return values.map((v) => [v, v === 'leave' ? 'Leave as-is' : v === 'on' ? 'On' : 'Off']);
  }

  const currentValue = (key) => {
    if (key === 'speed') return speed();
    if (key === 'volume') return volume();
    if (key === 'theater') return theater();
    if (key === 'subtitles') return subtitles();
    return audio();
  };

  function valueLabel(key) {
    if (key === 'hotkeys') return hotkeys() ? 'On' : 'Off';
    if (key === 'pauseHidden') return pauseHidden() ? 'On' : 'Off';
    const v = currentValue(key);
    if (v === 'leave') return 'Default';
    if (key === 'speed') return `${v}x`;
    if (key === 'volume') return `${v}%`;
    if (key === 'audio') return 'Original';
    return v === 'on' ? 'On' : 'Off';
  }

  function setValue(key, value) {
    put(key, value);
    if (key === 'speed') drawMenu();
    view = { kind: 'settings' };
    render();
    startSync();
  }

  function render() {
    const panel = document.getElementById('ytpd-panel');
    if (!panel) return;
    panel.textContent = '';

    const title = document.createElement('h2');
    if (view.kind === 'settings') {
      title.textContent = 'Playback';
      panel.append(title);
      for (const key of ['speed', 'hotkeys', 'theater', 'volume', 'subtitles', 'audio', 'pauseHidden']) {
        panel.append(
          settingRow(TITLES[key], valueLabel(key), () => {
            if (key === 'hotkeys' || key === 'pauseHidden') {
              put(key, !get(key, false));
              render();
              return;
            }
            view = { kind: 'options', key };
            render();
          })
        );
      }
    } else {
      const key = view.key;
      title.textContent = TITLES[key];
      panel.append(title);
      panel.append(
        optionRow('\u2190 Back', false, () => {
          view = { kind: 'settings' };
          render();
        })
      );
      for (const [value, label] of optionList(key)) {
        panel.append(optionRow(label, currentValue(key) === value, () => setValue(key, value)));
      }
    }

    const active = panel.querySelector('[aria-current="true"]');
    const first = panel.querySelector('button');
    (active || first)?.focus();
  }

  function openPanel() {
    if (document.getElementById('ytpd-backdrop')) return;
    const style = document.createElement('style');
    style.id = 'ytpd-style';
    style.textContent = CSS;
    document.head.append(style);

    const backdrop = document.createElement('div');
    backdrop.id = 'ytpd-backdrop';
    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) closePanel();
    });

    const panel = document.createElement('div');
    panel.id = 'ytpd-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Playback');

    backdrop.append(panel);
    document.body.append(backdrop);
    document.addEventListener('keydown', onKey, true);
    view = { kind: 'settings' };
    render();
  }

  let menuId = null;

  function drawMenu() {
    if (typeof GM_registerMenuCommand !== 'function') return;
    if (menuId !== null && typeof GM_unregisterMenuCommand === 'function') GM_unregisterMenuCommand(menuId);
    const rate = speed();
    menuId = GM_registerMenuCommand(`Playback: ${rate === 'leave' ? 'default' : `${rate}x`}`, openPanel);
  }

  drawMenu();
  document.addEventListener('yt-navigate-finish', () => {
    hookVideo();
    startSync();
  });
  window.addEventListener('yt-page-data-updated', () => {
    hookVideo();
    startSync();
  });
  hookVideo();
  startSync();
})();

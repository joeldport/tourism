// ===================================================================
// TABLE OF CONTENTS — search for the ALL-CAPS heading text below to
// jump to a section (line numbers aren't listed here since they drift
// as the file changes; the heading text doesn't). Sections run in the
// order they execute/appear, not grouped by topic.
//
//   KEYBOARD-VS-MOUSE DETECTION ... input-method tracking (isKeyboardNav)
//   LANGUAGE SELECTOR .............. Google Translate integration
//   CONSENT BANNER .................. first-visit full-screen modal
//   HIGH CONTRAST MODE .............. data-high-contrast="on" toggle
//   WEATHER CATEGORY NORMALIZATION .. NWS forecast text -> category
//   BACKGROUND VIDEO ................ lazy-loaded, weather-aware
//   BACKGROUND VIDEO/AUDIO CONTROLS . persistent play/pause control bar
//   AMBIENT AUDIO TRACKS ............ looping background music system
//   VERTICAL FIT SCALE .............. font-size scaling to avoid scroll
//   LIVE WEATHER ..................... geolocation -> NWS grid point
//   NWS WEATHER ...................... forecast fetch + rendering
//   ILLINOIS BEACHGUARD .............. IL beach advisory RSS feed
//   INDIANA BEACHALERT (IDEM) ........ IN beach advisory data
//   BEACH SEARCH ...................... filters both beach lists
//   LAKE MICHIGAN BUOYS .............. NDBC + GLOS buoy data (2-phase)
//   DEV TESTING PANEL ................ F1 weather-override panel (hidden by default, ships to prod)
//   RESOURCE LINK HEALTH CHECKER ..... periodic dead-link detection
//   RESOURCES ACCORDION .............. responsive auto-expand/collapse
//   PERIODIC DATA REFRESH ............ the 15-min refresh loop that
//                                       ties weather/buoys/beaches together
// ===================================================================

// Diagnostic: surfaces any uncaught error loudly in the console,
// including its source file/line, so a failure earlier in this file
// (or in a third-party script loaded on the page) can't silently
// prevent later code — like the accordion wiring — from ever running.
window.addEventListener('error', (e) => {
  console.error('[page error]', e.message, 'at', e.filename + ':' + e.lineno, e.error);
});
console.log('%c[script.js] loaded and running — version v95', 'background:#13294B;color:#fff;font-size:14px;padding:4px 8px;');

// ===================================================================
// KEYBOARD-VS-MOUSE DETECTION — tracks which input method drove the
// most recent focus change, the same "what-input"-style pattern most
// focus-visible polyfills use: any Tab keydown flips it to keyboard,
// any mousedown flips it back. Exposed as isKeyboardNav() for any
// feature (currently just the resources accordion) that needs to
// treat keyboard-driven focus differently from a mouse click.
// ===================================================================
let _slmoKeyboardNav = false;
window.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') _slmoKeyboardNav = true;
}, true);
window.addEventListener('mousedown', () => {
  _slmoKeyboardNav = false;
}, true);
function isKeyboardNav() {
  return _slmoKeyboardNav;
}

// Icons are inline SVG referencing <symbol> definitions in the sprite
// sheet near the top of <body> (see index.html) — not Font Awesome
// icon-font classes anymore, so every icon comes from this one helper
// rather than repeating the same three lines of markup everywhere.
function iconHtml(name, extraClass) {
  const cls = extraClass ? `icon ${extraClass}` : 'icon';
  return `<svg class="${cls}" aria-hidden="true" focusable="false"><use href="#i-${name}" xlink:href="#i-${name}"></use></svg>`;
}

// ===================================================================
// LANGUAGE SELECTOR — GTranslate-like experience built directly on
// Google's own translate element, no third-party service involved.
//
// How it works:
//  1. On page load, read the `googtrans` cookie (Google's own cookie
//     format: "/sourceLang/targetLang", e.g. "/en/es"). If a language
//     other than English is saved, set our <select> to match it
//     immediately — so the control always reflects the current
//     language, even right after a fresh load.
//  2. Google's translate element ALSO reads this same cookie itself
//     when it initializes (see googleTranslateElementInit() in
//     index.html), so the page translates automatically on load
//     without us having to drive its internal UI at all.
//  3. When the user picks a different language, we write the cookie
//     ourselves (at the root path, so it covers the whole site) and
//     reload the page. Letting the reload do the work avoids the
//     mid-page DOM-rewrite flicker that comes from driving Google's
//     live translate UI after the fact, and is what makes this feel
//     immediate and clean rather than janky.
//  4. All of Google's own UI (banner, tooltips, highlighting, logo)
//     is suppressed via CSS (see styles.css) — translation keeps
//     working, visitors just never see Google's own chrome.
//
// (Briefly swapped for GTranslate's free dropdown widget, since
// Google's own widget is officially end-of-life for general use — but
// reverted after GTranslate's script never actually translated
// anything while testing via a file:// URL, even though this version
// is confirmed working in that same file:// setup in Firefox. See the
// note above googleTranslateElementInit() in index.html for more.)
// ===================================================================
const GOOGTRANS_COOKIE = 'googtrans';

function getCookie(name) {
  const match = document.cookie.match('(?:^|; )' + name + '=([^;]*)');
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name, value, days) {
  const maxAge = days * 24 * 60 * 60;
  // No explicit `domain` attribute: omitting it scopes the cookie to
  // the exact current host, which works correctly for any domain
  // (including localhost/IP addresses during testing) without needing
  // to know the production domain name in advance.
  //
  // The `Secure` flag is added only when actually on HTTPS — Chrome is
  // documented (via Google's own Translate community forum reports)
  // to be stricter than Firefox about honoring cookies that aren't
  // marked Secure on a secure page, which lines up with translation
  // working in Firefox but not Chrome despite the cookie being set
  // correctly in both. Adding `Secure` unconditionally would instead
  // BREAK the cookie entirely on plain http:// (e.g. local testing),
  // since browsers refuse to set Secure cookies without HTTPS.
  const secureFlag = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax${secureFlag}`;
}

function deleteCookie(name) {
  document.cookie = `${name}=; path=/; max-age=0`;
}

// The exact, correct label for each option — used to forcibly restore
// the select's text if Google's translator mangles it anyway. Real-
// world reports (e.g. select2's GitHub issues) confirm `notranslate`
// is NOT always reliably respected on <select>/<option> elements
// specifically, even though it works consistently on normal text —
// so this is a defensive backstop, not a redundant belt-and-suspenders
// for its own sake.
// Each label pairs the English name with the language's own native
// name (e.g. "Korean - 한국어") so a visitor can identify a language
// they don't already read, not just one whose script they recognize.
const LANG_OPTION_LABELS = {
  '': 'Select Language',
  'en|en': 'English',
  'en|es': 'Spanish - Español',
  'en|pl': 'Polish - Polski',
  'en|zh-CN': 'Chinese - 中文',
  'en|tl': 'Filipino',
  'en|de': 'German - Deutsch',
  'en|ar': 'Arabic - العربية',
  'en|vi': 'Vietnamese - Tiếng Việt',
  'en|ko': 'Korean - 한국어',
  'en|ja': 'Japanese - 日本語',
};

function restoreLanguageOptionLabels() {
  const select = document.getElementById('langSelect');
  if (!select) return;
  Array.from(select.options).forEach((opt) => {
    const correctLabel = LANG_OPTION_LABELS[opt.value];
    if (correctLabel && opt.textContent !== correctLabel) {
      opt.textContent = correctLabel;
    }
  });
}

function initLanguageSelect() {
  const select = document.getElementById('langSelect');
  if (!select) return;

  // A plain <select> should open its dropdown on Enter/Space with zero
  // extra code — reported not happening for some screen reader users,
  // and this appearance:none-styled select is exactly the kind of
  // element where that can go wrong in some browser/AT combinations.
  // showPicker() is the modern, explicit way to open it programmatically;
  // feature-detected so this is a no-op wherever native behavior was
  // already working (nothing here can make things worse, only better).
  if (typeof select.showPicker === 'function') {
    select.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        try { select.showPicker(); } catch { /* e.g. not called from a user gesture — ignore */ }
      }
    });
  }

  // Reflect the currently-saved language in the select on every load,
  // so the control is never out of sync with what's actually applied.
  const saved = getCookie(GOOGTRANS_COOKIE); // looks like "/en/es" or null
  const currentLangIsEnglish = !saved || saved.split('/')[2] === 'en';
  document.documentElement.classList.toggle('lang-is-english', currentLangIsEnglish);
  // Filipino's translated nav-toggle labels ("Mga Mapa", "Mga Boya", etc.)
  // run noticeably longer than the English originals, which is what
  // overflows the 4-buttons-in-a-row mobile layout — this class lets
  // CSS shrink/hide the icons in that one case to make room (see
  // .nav-toggle i rules in styles.css).
  const currentLangIsFilipino = !!saved && saved.split('/')[2] === 'tl';
  document.documentElement.classList.toggle('lang-is-filipino', currentLangIsFilipino);
  if (saved) {
    const targetLang = saved.split('/')[2]; // "/en/es" -> "es"
    if (targetLang && targetLang !== 'en') {
      const matchingOption = Array.from(select.options).find(
        (opt) => opt.value.split('|')[1] === targetLang
      );
      if (matchingOption) select.value = matchingOption.value;
    }
  }

  select.addEventListener('change', function () {
    const value = select.value; // e.g. "en|es"
    if (!value) return;

    const targetLang = value.split('|')[1];

    if (targetLang === 'en') {
      // Reverting to English: real-world reports show simply deleting
      // the cookie can be unreliable (Google's element sometimes keeps
      // translating anyway). Setting it explicitly to "/en/en" — a
      // no-op translation — is the more dependable way to get back to
      // the original page, in addition to clearing it.
      setCookie(GOOGTRANS_COOKIE, '/en/en', 365);
      deleteCookie(GOOGTRANS_COOKIE);
    } else {
      setCookie(GOOGTRANS_COOKIE, `/en/${targetLang}`, 365);
    }

    // history.scrollRestoration is set inline in <head> (must run
    // before the page's first layout to reliably take effect — see
    // that comment for why). This explicit reset is the deterministic
    // half of the fix: guarantees a clean top-of-page landing on
    // every one of this page's independently-scrolling columns,
    // regardless of what each was scrolled to before the reload.
    document.querySelectorAll('.col, .col-main-wrapper').forEach((col) => {
      col.scrollTop = 0;
    });
    window.scrollTo(0, 0);

    location.reload();
  });

  restoreLanguageOptionLabels();

  // Google's translator can run at unpredictable times after the
  // initial load (it has to fetch translations asynchronously), so a
  // single one-time restore isn't enough — watch the select for any
  // further mutations and correct them as they happen.
  if ('MutationObserver' in window) {
    const observer = new MutationObserver(() => restoreLanguageOptionLabels());
    Array.from(select.options).forEach((opt) => {
      observer.observe(opt, { characterData: true, childList: true, subtree: true });
    });
  }
}

// ===================================================================
// CONSENT BANNER — shown on first visit until the user agrees.
// Uses localStorage (NOT a tracking cookie) to remember the choice.
// The single key stored is 'slmo-consent-v1' = 'agreed'.
//
// To remove before production: delete this function, the
// initConsentBanner() call below, and the #consentBanner element
// in index.html. Nothing else depends on this.
// ===================================================================
// ===================================================================
// SCROLL LOCK — prevents the page from scrolling behind a fixed-
// position overlay (currently just the consent banner) while it's
// open. On desktop this is close to a no-op — body is already
// overflow:hidden/height:100vh by default there — but the mobile/
// reflow breakpoint deliberately RELEASES that lock (overflow:
// visible, so the page can scroll normally in the stacked single-
// column mobile layout), and nothing was re-locking it specifically
// while a modal sat on top. Plain overflow:hidden on body alone is
// well-documented as unreliable for this on iOS Safari specifically
// — touch drags can still move the page underneath a fixed overlay
// even with it set — so this pins body in place with position:fixed
// and a negative top offset instead, the standard robust technique,
// then restores the exact scroll position on unlock.
//
// Declared here, before initConsentBanner (which calls lockBodyScroll
// synchronously, as soon as it runs, for a first-time visitor) — NOT
// after it, which is where this used to live. That was a real bug:
// lockBodyScroll/unlockBodyScroll are hoisted function declarations,
// so they were always callable regardless of position, but the
// `_scrollLockY` variable they both use is `let`, which is NOT fully
// hoisted — it sits in a temporal dead zone until its own declaration
// line actually executes. With the declaration positioned after
// initConsentBanner's call, invoking lockBodyScroll() from inside it
// threw "Cannot access '_scrollLockY' before initialization" —
// synchronously, right after the banner was shown and focused but
// before the function reached the line that attaches the "I
// understand" button's click listener. The banner opened correctly;
// clicking the button did nothing, because that listener was never
// actually registered.
// ===================================================================
let _scrollLockY = 0;
function lockBodyScroll() {
  _scrollLockY = window.scrollY || document.documentElement.scrollTop || 0;
  // A custom property, not a direct style.top assignment — body
  // already carries `top: 0 !important` (see that rule's own comment,
  // for a reason unrelated to this) which would silently override a
  // plain inline style.top from here. The matching CSS rule below
  // uses this custom property inside its own !important + more-
  // specific `body.scroll-locked` selector instead, which correctly
  // outranks the plain `body` rule's !important.
  document.body.style.setProperty('--scroll-lock-offset', `-${_scrollLockY}px`);
  document.body.classList.add('scroll-locked');
}
function unlockBodyScroll() {
  document.body.classList.remove('scroll-locked');
  document.body.style.removeProperty('--scroll-lock-offset');
  window.scrollTo(0, _scrollLockY);
}

function initConsentBanner() {
  const CONSENT_KEY = 'slmo-consent-v1';
  const banner = document.getElementById('consentBanner');
  const agreeBtn = document.getElementById('consentAgreeBtn');
  if (!banner || !agreeBtn) return;

  // Already agreed — stay hidden (the HTML has [hidden] by default)
  try {
    if (localStorage.getItem(CONSENT_KEY) === 'agreed') return;
  } catch {
    // localStorage blocked (private browsing strictest mode) —
    // show the banner but don't try to persist the choice
  }

  // Show the banner and trap focus inside it
  banner.hidden = false;
  agreeBtn.focus();
  lockBodyScroll();

  // Prevent Tab from leaving the banner while it's open
  banner.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault(); // only one focusable element, so just keep focus here
    }
    // No Escape dismiss — they need to actively agree
  });

  agreeBtn.addEventListener('click', () => {
    try { localStorage.setItem(CONSENT_KEY, 'agreed'); } catch { /* blocked */ }
    banner.hidden = true;
    unlockBodyScroll();
  });
}

initConsentBanner();

// ===================================================================
// HIGH CONTRAST MODE — toggles data-high-contrast="on" on <html>.
// Preference persisted in localStorage so it survives page loads.
// The select control in the header drives this; the CSS variable
// overrides handle all the visual changes automatically via cascade.
// ===================================================================
function initHighContrast() {
  const btn = document.getElementById('contrastToggle');
  if (!btn) return;

  const CONTRAST_KEY = 'slmo-high-contrast';
  let active = false;

  function applyContrast(on) {
    active = on;
    if (on) {
      document.documentElement.setAttribute('data-high-contrast', 'on');
      btn.setAttribute('aria-pressed', 'true');
      btn.setAttribute('aria-label', 'Disable high contrast mode');
      btn.classList.add('contrast-toggle--active');
    } else {
      document.documentElement.removeAttribute('data-high-contrast');
      btn.setAttribute('aria-pressed', 'false');
      btn.setAttribute('aria-label', 'Enable high contrast mode');
      btn.classList.remove('contrast-toggle--active');
    }
    try { localStorage.setItem(CONTRAST_KEY, on ? 'on' : 'off'); } catch { /* blocked */ }
  }

  // Restore saved preference
  let saved = 'off';
  try { saved = localStorage.getItem(CONTRAST_KEY) || 'off'; } catch { /* blocked */ }
  if (saved === 'on') applyContrast(true);

  btn.addEventListener('click', () => applyContrast(!active));
}

initHighContrast();

// Shared by initBgVideoPlayToggle and initLazyBackgroundVideo — a
// returning visitor's own choice to turn the ambient video ON is
// remembered the same way high-contrast mode is (see initHighContrast
// above); a first-time visitor still always lands paused.
const BG_VIDEO_PLAY_KEY = 'slmo-bg-video-playing';

initLanguageSelect();

// Logo acts as a "refresh the page" shortcut — moved here from an
// inline onclick attribute in the markup (href="." in the HTML is the
// no-JS fallback: it still takes you back to the current page even if
// this script fails to load, it just won't force a hard reload).
const brandLogoLink = document.getElementById('brandLogoLink');
if (brandLogoLink) {
  brandLogoLink.addEventListener('click', (e) => {
    e.preventDefault();
    location.reload();
  });
}

// ===================================================================
// WEATHER CATEGORY NORMALIZATION — single source of truth used by
// both the background video and background music systems. Maps NWS
// shortForecast text to one of 9 named categories (thunderstorm,
// winter, heavy-rain, light-rain, fog, windy, overcast, partly-cloudy,
// sunny). Priority order below matches the spec (most severe first)
// so compound forecasts like "Chance Showers and Thunderstorms"
// resolve to the highest priority.
// ===================================================================
function normalizeWeatherCategory(shortForecast) {
  const t = (shortForecast || '').toLowerCase();
  if (t.includes('thunderstorm') || t.includes('t-storm'))                              return 'thunderstorm';
  if (t.includes('snow') || t.includes('sleet') || t.includes('blizzard') ||
      t.includes('flurries') || t.includes('freezing rain') || t.includes('ice'))       return 'winter';
  if (t.includes('heavy rain') || t.includes('showers'))                                return 'heavy-rain';
  if (t.includes('rain') || t.includes('drizzle'))                                      return 'light-rain';
  if (t.includes('fog') || t.includes('haze'))                                          return 'fog';
  if (t.includes('wind') || t.includes('breezy') || t.includes('blustery'))            return 'windy';
  if (t.includes('overcast') || t.includes('mostly cloudy') || t.includes('cloudy'))   return 'overcast';
  if (t.includes('partly') || t.includes('few clouds') || t.includes('partly sunny'))  return 'partly-cloudy';
  if (t.includes('clear') || t.includes('sunny'))                                       return 'sunny';
  return null;
}

// Maps weather category → video filename (without path/extension).
// Default video is SLMO_Background_Video (no category).
const WEATHER_VIDEO_MAP = {
  'sunny':        'SLMO_Background_Video_Sunny',
  'partly-cloudy':'SLMO_Background_Video_Partly_Cloudy',
  'overcast':     'SLMO_Background_Video_Overcast',
  'light-rain':   'SLMO_Background_Video_Light_Rain',
  'heavy-rain':   'SLMO_Background_Video_Heavy_Rain',
  'thunderstorm': 'SLMO_Background_Video_Thunderstorm',
  'windy':        'SLMO_Background_Video_Windy',
  'fog':          'SLMO_Background_Video_Fog',
  'winter':       'SLMO_Background_Video_Winter',
};
const DEFAULT_VIDEO = 'SLMO_Background_Video';

function weatherVideoSrc(category) {
  const name = (category && WEATHER_VIDEO_MAP[category]) || DEFAULT_VIDEO;
  return `assets/${name}.mp4`;
}

// ===================================================================
// BACKGROUND VIDEO — lazy-loaded after page load, weather-aware.
// Two <video> elements (bgVideo + bgVideoAlt) cross-fade between
// weather-specific clips. The active element has opacity:1; the
// alternate sits behind at opacity:0. To crossfade: load new src into
// the alt, play it, then swap opacities and role labels.
// ===================================================================
const bgVideoState = {
  // Which element is currently visible ('a' = bgVideo, 'b' = bgVideoAlt)
  active: 'a',
  currentSrc: null,
  crossfading: false,
};

function initLazyBackgroundVideo() {
  const videoA = document.getElementById('bgVideo');
  if (!videoA) return;

  function loadAndPlay() {
    // Load the default video into the primary element on page load,
    // but start PAUSED — only showing the first frame. Motion sickness
    // is a real concern; the visitor explicitly unpauses if they want
    // the ambient video to play.
    const src = videoA.dataset.src || weatherVideoSrc(null);
    bgVideoState.currentSrc = src;
    const source = document.createElement('source');
    source.src = src;
    source.type = 'video/mp4';
    videoA.appendChild(source);
    videoA.load();
    // Seek to first frame once metadata is available, then stay paused.
    videoA.addEventListener('loadedmetadata', () => {
      videoA.currentTime = 0;
      // Exception to "stay paused": if this visitor previously chose
      // to turn the video ON themselves (see initBgVideoPlayToggle),
      // honor that returning choice the same way high-contrast mode
      // is remembered. First-time visitors still always land paused —
      // this only fires for a preference the visitor set explicitly.
      let savedPlaying = 'off';
      try { savedPlaying = localStorage.getItem(BG_VIDEO_PLAY_KEY) || 'off'; } catch { /* blocked */ }
      if (savedPlaying === 'on' && window.__slmoSetVideoPlaying) {
        window.__slmoSetVideoPlaying(true);
      }
    }, { once: true });
    // Do NOT call play() — video starts paused by default.
  }

  if (document.readyState === 'complete') {
    loadAndPlay();
  } else {
    window.addEventListener('load', loadAndPlay);
  }
}

function crossfadeBgVideo(category) {
  const videoA = document.getElementById('bgVideo');
  const videoB = document.getElementById('bgVideoAlt');
  if (!videoA || !videoB) return;

  const newSrc = weatherVideoSrc(category);
  if (newSrc === bgVideoState.currentSrc && !bgVideoState.crossfading) return; // nothing to do
  bgVideoState.currentSrc = newSrc;

  // Respect prefers-reduced-motion — swap instantly without fade
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const [activeEl, altEl] = bgVideoState.active === 'a'
    ? [videoA, videoB]
    : [videoB, videoA];

  // Load new video into the currently-hidden element
  altEl.innerHTML = '';
  const source = document.createElement('source');
  source.src = newSrc;
  source.type = 'video/mp4';
  altEl.appendChild(source);
  altEl.load();

  function doFade() {
    bgVideoState.crossfading = true;
    if (prefersReduced) {
      // Instant swap — no transition
      activeEl.style.opacity = '0';
      altEl.style.opacity = '1';
      bgVideoState.active = bgVideoState.active === 'a' ? 'b' : 'a';
      bgVideoState.crossfading = false;
      return;
    }
    // Fade alt in (it's behind active at z-index -1 relative)
    altEl.style.opacity = '1';
    // After transition completes, fade out old active and reassign z-index
    const FADE_MS = 400;
    setTimeout(() => {
      activeEl.style.opacity = '0';
      bgVideoState.active = bgVideoState.active === 'a' ? 'b' : 'a';
      bgVideoState.crossfading = false;
    }, FADE_MS);
  }

  if (bgVideoState._playVideo && !activeEl.paused) bgVideoState._playVideo(altEl);
  // Only seek to first frame (don't play) if video is paused
  else {
    altEl.addEventListener('loadedmetadata', () => { altEl.currentTime = 0; }, { once: true });
  }

  // If the video file doesn't exist or fails to load, fall back to
  // the default video rather than showing a blank/broken background.
  // Guard against infinite loop: only fall back if we're not already
  // trying to load the default.
  const defaultSrc = weatherVideoSrc(null);
  altEl.addEventListener('error', () => {
    if (newSrc !== defaultSrc) {
      console.warn(`[bg-video] Failed to load ${newSrc} — falling back to default video`);
      crossfadeBgVideo(null);
    }
  }, { once: true });

  // Also listen on the <source> element, since some browsers fire
  // error on <source> rather than the <video> element itself.
  source.addEventListener('error', () => {
    if (newSrc !== defaultSrc) {
      console.warn(`[bg-video] Source error for ${newSrc} — falling back to default video`);
      crossfadeBgVideo(null);
    }
  }, { once: true });

  // Wait for the new video to have loaded enough to play seamlessly
  altEl.addEventListener('canplay', doFade, { once: true });
  // Fallback: if canplay doesn't fire within 1s, fade anyway —
  // but only if the video isn't in an error state (errored videos
  // will have triggered the error handler above instead)
  setTimeout(() => {
    if (bgVideoState.currentSrc === newSrc && altEl.error === null) doFade();
  }, 1000);
}

initLazyBackgroundVideo();

// ===================================================================
// BACKGROUND VIDEO/AUDIO CONTROLS — small, persistent control bar in
// the bottom-right corner (see .bg-video-controls in styles.css).
// Two independent toggles: pause/resume the ambient video, and
// play/stop a looping ambient audio track. Both are real controls
// over something that actually changes for the visitor (motion,
// sound), so unlike the video element itself they're fully keyboard-
// reachable with live aria-pressed state, not just decorative chrome.
// ===================================================================
function initBgVideoPlayToggle() {
  const button = document.getElementById('bgVideoPlayToggle');
  const videoA = document.getElementById('bgVideo');
  const videoB = document.getElementById('bgVideoAlt');
  if (!button || !videoA) return;

  // Returns the currently-active video element (the visible one).
  function activeVideo() {
    return bgVideoState.active === 'b' ? videoB : videoA;
  }

  // Play or pause both video elements together — the active one is
  // visible, the alt is preloading the next weather video. Keeping
  // both in sync means a crossfade initiated while paused stays
  // paused, and vice versa.
  function playBoth() {
    [videoA, videoB].forEach(v => {
      if (!v) return;
      const p = v.play();
      if (p && p.catch) p.catch(() => {});
    });
  }
  function pauseBoth() {
    [videoA, videoB].forEach(v => { if (v) v.pause(); });
  }

  // Expose so crossfadeBgVideo can respect the current play state.
  bgVideoState._playVideo = (el) => {
    if (el && !activeVideo().paused) {
      const p = el.play();
      if (p && p.catch) p.catch(() => {});
    } else if (el) {
      el.addEventListener('loadedmetadata', () => { el.currentTime = 0; }, { once: true });
    }
  };

  let pausedAudioOnVideoPause = false;

  // 30-second loop — seek back to 0 at the 30s mark rather than
  // letting the video play indefinitely. The full files may be much
  // longer but only the first 30 seconds are needed; this saves
  // significant bandwidth since browsers stop buffering once they
  // catch up to the current playhead position.
  // A brief opacity dip at the seam (100ms fade out, instant seek,
  // 100ms fade in) makes the loop imperceptible against the heavy
  // blur filter already on the video.
  const LOOP_AT = 30; // seconds
  const LOOP_FADE_MS = 150;

  function attachLoopListener(el) {
    if (!el || el._loopListenerAttached) return;
    el._loopListenerAttached = true;
    el.addEventListener('timeupdate', () => {
      if (el.currentTime >= LOOP_AT) {
        const origOpacity = el.style.opacity || '1';
        el.style.transition = `opacity ${LOOP_FADE_MS}ms ease`;
        el.style.opacity = '0';
        setTimeout(() => {
          el.currentTime = 0;
          el.style.opacity = origOpacity;
          // Remove the inline transition so the crossfade system's
          // own CSS transition takes over cleanly afterwards.
          setTimeout(() => { el.style.transition = ''; }, LOOP_FADE_MS);
        }, LOOP_FADE_MS);
      }
    });
  }

  // Attach loop listeners to both video elements so whichever is
  // active at any given time gets the 30s loop.
  if (videoA) attachLoopListener(videoA);
  if (videoB) attachLoopListener(videoB);

  button.addEventListener('click', () => {
    setVideoPlaying(activeVideo().paused);
  });

  function setVideoPlaying(shouldPlay) {
    const ambientAudio = window.__slmoAmbientAudio;
    if (shouldPlay) {
      playBoth();
      button.setAttribute('aria-pressed', 'true');
      button.setAttribute('aria-label', 'Pause background video');
      button.innerHTML = iconHtml('pause');
      if (ambientAudio && pausedAudioOnVideoPause) {
        ambientAudio.play();
        pausedAudioOnVideoPause = false;
      }
    } else {
      pauseBoth();
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-label', 'Play background video');
      button.innerHTML = iconHtml('play');
      if (ambientAudio && ambientAudio.isPlaying()) {
        ambientAudio.pause();
        pausedAudioOnVideoPause = true;
      }
    }
    try { localStorage.setItem(BG_VIDEO_PLAY_KEY, shouldPlay ? 'on' : 'off'); } catch { /* blocked */ }
  }

  // Called from initLazyBackgroundVideo once the video is actually
  // loaded, if this visitor previously chose to leave it playing.
  window.__slmoSetVideoPlaying = setVideoPlaying;
}

initBgVideoPlayToggle();

// ===================================================================
// AMBIENT AUDIO TRACKS — three real tracks, played as a single looping
// playlist rather than one track on repeat. Starts at a random track
// on each page load (small variety touch); once playing, a track that
// finishes automatically advances to the next one, wrapping back to
// track 1 after track 3. The prev/next buttons (only shown while audio
// is actually on, same pattern as the volume slider) let a visitor
// skip manually in either direction without waiting for the current
// track to end.
// ===================================================================
const AMBIENT_TRACKS = [
  'assets/track_01.mp3',
  'assets/track_02.mp3',
  'assets/track_03.mp3',
  'assets/track_04.mp3',
];

// track_02 and track_03 each have ~1 second of dead silence at the very
// start of the file (track_01 doesn't) — rather than re-export the
// audio files themselves, skipping past it in code is the simpler fix
// and avoids re-uploading assets. Indexed to match AMBIENT_TRACKS
// above; 0 means "start at the beginning" (track_01's case).
const AMBIENT_TRACK_START_OFFSETS = [0, 1, 1, 0];

// Maps weather category (and special conditions) to a track index (0-3).
// Centralized so the same logic applies whether triggered by weather
// data arriving or the card flip changing the active side.
function selectMusicTrack({ category, isNight = false, isSeasonal = false } = {}) {
  if (isSeasonal || isNight || category === 'winter') return 3; // track_04
  if (['light-rain','heavy-rain','overcast','fog'].includes(category)) return 1; // track_02
  if (['sunny','partly-cloudy'].includes(category)) return 2; // track_03
  return 0; // track_01 default
}

function isNighttime() {
  const h = new Date().getHours();
  return h >= 21 || h < 6; // 9pm–6am
}

function initAmbientAudio() {
  const button = document.getElementById('bgAudioToggle');
  const prevButton = document.getElementById('bgAudioPrevToggle');
  const nextButton = document.getElementById('bgAudioNextToggle');
  const audioEl = document.getElementById('bgAmbientAudio');
  const volumeSlider = document.getElementById('bgVolumeSlider');
  const trackLabel = document.getElementById('bgAudioTrackLabel');
  if (!button || !audioEl) return;

  let currentTrackIndex = 0;
  let isPlaying = false;
  let crossfadePending = false;

  const TRACK_NAMES = ['Ambient 1', 'Ambient 2', 'Ambient 3', 'Ambient 4'];
  function updateTrackLabel() {
    if (!trackLabel) return;
    trackLabel.textContent = TRACK_NAMES[currentTrackIndex] || `Track ${currentTrackIndex + 1}`;
  }

  function loadTrack(index, { autoplay = false } = {}) {
    currentTrackIndex = ((index % AMBIENT_TRACKS.length) + AMBIENT_TRACKS.length) % AMBIENT_TRACKS.length;
    audioEl.src = AMBIENT_TRACKS[currentTrackIndex];

    const startOffset = AMBIENT_TRACK_START_OFFSETS[currentTrackIndex] || 0;
    if (startOffset > 0) {
      audioEl.addEventListener('loadedmetadata', () => {
        audioEl.currentTime = startOffset;
      }, { once: true });
    }

    if (autoplay) {
      const p = audioEl.play();
      if (p && p.catch) p.catch((err) => {
        console.warn('[ambient-audio] play() failed:', err.message);
      });
    }
  }

  // Cross-fade between tracks over ~2s by fading volume down then up.
  // If the user hasn't turned audio on yet, just queue the right track
  // so it's ready when they do.
  function crossfadeToTrack(newIndex) {
    if (newIndex === currentTrackIndex) return; // already on this track
    if (!isPlaying) {
      loadTrack(newIndex);
      return;
    }
    if (crossfadePending) return; // already mid-fade, let it finish
    crossfadePending = true;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const FADE_MS = prefersReduced ? 0 : 2000;
    const STEP_MS = 50;
    const steps = FADE_MS / STEP_MS;
    const startVol = audioEl.volume;
    let step = 0;

    const fadeOut = setInterval(() => {
      step++;
      audioEl.volume = Math.max(0, startVol * (1 - step / steps));
      if (step >= steps) {
        clearInterval(fadeOut);
        loadTrack(newIndex, { autoplay: true });
        updateTrackLabel();
        // Fade back in
        step = 0;
        const fadeIn = setInterval(() => {
          step++;
          audioEl.volume = Math.min(startVol, startVol * (step / steps));
          if (step >= steps) {
            clearInterval(fadeIn);
            audioEl.volume = startVol;
            crossfadePending = false;
          }
        }, STEP_MS);
      }
    }, STEP_MS);
  }

  // Called by weather system when the active weather category changes.
  // Exposed on window.__slmoAmbientAudio so renderWeather can reach it.
  function setWeatherTrack(category) {
    const idx = selectMusicTrack({ category, isNight: isNighttime() });
    crossfadeToTrack(idx);
  }

  // Initial track: pick by weather if known, else start on track_01.
  // Will be overridden once weather data loads via setWeatherTrack().
  loadTrack(0);

  audioEl.addEventListener('ended', () => {
    // Loop the current track rather than advancing — weather controls
    // track selection now, not the sequential playlist.
    loadTrack(currentTrackIndex, { autoplay: isPlaying });
  });

  const VOLUME_STORAGE_KEY = 'slmo-ambient-volume';
  const savedVolume = parseInt(localStorage.getItem(VOLUME_STORAGE_KEY), 10);
  const initialVolume = Number.isNaN(savedVolume) ? 50 : Math.min(100, Math.max(0, savedVolume));
  audioEl.volume = initialVolume / 100;
  if (volumeSlider) volumeSlider.value = String(initialVolume);

  if (volumeSlider) {
    volumeSlider.addEventListener('input', () => {
      const level = parseInt(volumeSlider.value, 10);
      audioEl.volume = level / 100;
      localStorage.setItem(VOLUME_STORAGE_KEY, String(level));
    });
  }

  if (prevButton) {
    prevButton.addEventListener('click', () => {
      loadTrack(currentTrackIndex - 1, { autoplay: isPlaying });
      updateTrackLabel();
    });
  }
  if (nextButton) {
    nextButton.addEventListener('click', () => {
      loadTrack(currentTrackIndex + 1, { autoplay: isPlaying });
      updateTrackLabel();
    });
  }

  function playAmbientAudio() {
    isPlaying = true;
    const p = audioEl.play();
    if (p && p.catch) p.catch((err) => {
      console.warn('[ambient-audio] play() failed:', err.message);
    });
    button.setAttribute('aria-pressed', 'true');
    button.setAttribute('aria-label', 'Pause ambient audio');
    button.innerHTML = iconHtml('volume-high');
    if (volumeSlider) volumeSlider.hidden = false;
    if (prevButton) prevButton.hidden = false;
    if (nextButton) nextButton.hidden = false;
    if (trackLabel) { updateTrackLabel(); trackLabel.hidden = false; }
  }

  function pauseAmbientAudio() {
    isPlaying = false;
    audioEl.pause();
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', 'Play ambient audio');
    button.innerHTML = iconHtml('volume-xmark');
    if (volumeSlider) volumeSlider.hidden = true;
    if (prevButton) prevButton.hidden = true;
    if (nextButton) nextButton.hidden = true;
    if (trackLabel) trackLabel.hidden = true;
  }

  button.addEventListener('click', () => {
    if (audioEl.paused) playAmbientAudio();
    else pauseAmbientAudio();
  });

  window.__slmoAmbientAudio = {
    play: playAmbientAudio,
    pause: pauseAmbientAudio,
    isPlaying: () => isPlaying,
    setWeatherTrack,
  };
}

initAmbientAudio();

// Measures the fixed header's REAL rendered height and writes it to a
// CSS variable the layout uses for its top clearance. The header's
// height isn't a fixed constant any more — on narrow screens its
// content (logo, brand text, language selector, nav toggles) can wrap
// onto a second line, making it taller than any single hardcoded
// breakpoint value could predict. Re-measures on resize and whenever
// the header's own content changes size (e.g. GTranslate's widget
// finishing its async load and changing the header's height).
// ===================================================================
// VERTICAL FIT SCALE — scales font-size (which cascades to most
// spacing via rem units) and specific card/gap dimensions, via CSS
// custom properties that height-related rules read from, whenever the
// viewport's height differs meaningfully from 1275px — the height
// this design was visually tuned against. Works BOTH directions:
// shrinks on shorter screens (laptops with limited vertical space)
// and grows on taller ones (4K TVs and similar large displays, where
// a real CSS viewport can expose ~2160px of height at native 1:1
// scale — without scaling up, content that was sized for 1275px
// reads as comparatively tiny on a canvas that much larger).
// Deliberately NOT a transform:scale() on the whole page: that scales
// width too, which would make the header/footer bars (meant to always
// span the full real viewport width) visibly mismatched against the
// page — the actual ask here is "make vertical content fit/fill
// proportionally," not "scale everything including width."
//
// The scale-up direction is capped at 1.3x rather than left unbounded
// — unlike shrinking (where the floor is naturally bounded by
// mobile/tablet taking over below 1067px), there's no equivalent
// upper handoff to another layout, so an extreme display (8K, a
// giant screen wall) could otherwise scale content absurdly large.
// 1.3x was chosen as "comfortably larger," not "cartoonish," for the
// realistic 4K-TV case this was raised for (~2160px tall).
//
// Works alongside a separate fix, not a replacement for it: the
// header's logo is now explicitly sized to genuinely match
// --header-h (see .brand-logo in styles.css) — previously the logo
// alone made the header render ~24px taller than --header-h claimed,
// eating into the columns' real space before this scale factor even
// gets applied.
//
// Never applies below the 1400px width threshold used throughout this
// project for the stacked mobile/tablet layout — that layout was
// already confirmed correct as-is and should never be touched by this.
// ===================================================================
const VERTICAL_FIT_REFERENCE_HEIGHT = 1275;
const VERTICAL_FIT_MAX_SCALE_UP = 1.3;

function syncVerticalFitScale() {
  // Below this height (matching the mobile/stacked layout's own
  // max-height: 1067px breakpoint in styles.css), the page has
  // already switched to the full mobile layout instead — which
  // scrolls normally and doesn't need font-size shrinking at all.
  // Continuing to scale text down here would fight against that
  // switch rather than complement it.
  if (window.innerWidth <= 1400 || window.innerHeight <= 1067) {
    document.documentElement.style.setProperty('--vertical-fit-scale', '1');
    return;
  }
  const scale = Math.min(VERTICAL_FIT_MAX_SCALE_UP, window.innerHeight / VERTICAL_FIT_REFERENCE_HEIGHT);
  document.documentElement.style.setProperty('--vertical-fit-scale', String(scale));
}

window.addEventListener('load', syncVerticalFitScale);
window.addEventListener('resize', syncVerticalFitScale);
syncVerticalFitScale(); // run once immediately too, in case load already fired

function syncHeaderClearance() {
  const header = document.querySelector('.site-header');
  if (!header) return;
  const rect = header.getBoundingClientRect();
  const clearance = rect.height + rect.top + 16; // header's own height + its top offset + breathing room
  document.documentElement.style.setProperty('--measured-header-clearance', `${clearance}px`);
}

window.addEventListener('load', syncHeaderClearance);
window.addEventListener('resize', syncHeaderClearance);
syncHeaderClearance(); // run once immediately too, in case load already fired

if ('ResizeObserver' in window) {
  const headerEl = document.querySelector('.site-header');
  if (headerEl) {
    new ResizeObserver(syncHeaderClearance).observe(headerEl);
  }
}

// Same live-measurement approach as the page header above, but for
// the sticky "Interactive Outdoor Maps" heading inside the Maps
// column — the Buoys nav link jumps to a heading further down inside
// that same scrolling column, and needs to land just below this
// sticky heading rather than partially underneath it. A previous
// hand-estimated flat scroll-margin-top value (computed from the
// heading's CSS padding/border/line-height on paper) was still
// landing in the wrong place — measuring the real rendered element
// directly is the more reliable fix, consistent with how the page
// header's own clearance is already handled.
function syncMapsHeadingClearance() {
  const heading = document.querySelector('.col-main .col-heading');
  if (!heading) return;
  const rect = heading.getBoundingClientRect();
  const clearance = rect.height + 8; // heading's own rendered height + a small breathing-room buffer
  document.documentElement.style.setProperty('--measured-maps-heading-clearance', `${clearance}px`);
}

window.addEventListener('load', syncMapsHeadingClearance);
window.addEventListener('resize', syncMapsHeadingClearance);
syncMapsHeadingClearance();

if ('ResizeObserver' in window) {
  const mapsHeadingEl = document.querySelector('.col-main .col-heading');
  if (mapsHeadingEl) {
    new ResizeObserver(syncMapsHeadingClearance).observe(mapsHeadingEl);
  }
}

// Mobile-only: shrinks the header and hides the language selector once
// the page scrolls down, giving more room to actual content. Matches
// the same breakpoint the CSS now uses for the whole mobile/stacked
// layout range (merged into one consistent 1400px threshold — see the
// comment in styles.css about closing the old 560px/1400px gap) —
// checked live (not just once) since a phone can rotate or a window
// can resize across that boundary. The actual show/hide is pure CSS
// (.header-scrolled descendant selector) — this just toggles that one
// class based on scroll position and width.
const MOBILE_HEADER_SCROLL_BREAKPOINT = 1400;
const HEADER_SCROLL_THRESHOLD = 24; // px scrolled before the header starts shrinking

function updateHeaderScrollState() {
  const header = document.querySelector('.site-header');
  if (!header) return;
  const isMobileWidth = window.innerWidth <= MOBILE_HEADER_SCROLL_BREAKPOINT;
  const isScrolled = window.scrollY > HEADER_SCROLL_THRESHOLD;
  header.classList.toggle('header-scrolled', isMobileWidth && isScrolled);
  // The header's height just changed (or may have) — the ResizeObserver
  // above will also catch this, but calling it directly here keeps the
  // layout's top clearance in sync without waiting on the next paint.
  syncHeaderClearance();
}

window.addEventListener('scroll', updateHeaderScrollState, { passive: true });
window.addEventListener('resize', updateHeaderScrollState);
updateHeaderScrollState();

// Scroll-spy: lights up whichever of the three nav links (Resources /
// Maps / Alerts) corresponds to the column currently in view —
// most meaningful on mobile, where the columns stack and scrolling
// moves between them. Uses IntersectionObserver rather than manual
// scroll-position math, since it's the standard, efficient way to
// detect "is this element on screen right now."
function initNavScrollSpy() {
  const navLinks = Array.from(document.querySelectorAll('.nav-toggle[data-nav-target]'));
  if (navLinks.length === 0) return;

  const targets = navLinks
    .map((link) => ({ link, el: document.getElementById(link.dataset.navTarget) }))
    .filter((entry) => entry.el);

  if (targets.length === 0) return;

  const setActive = (targetId) => {
    navLinks.forEach((link) => {
      link.classList.toggle('nav-toggle--active', link.dataset.navTarget === targetId);
    });
  };

  const observer = new IntersectionObserver(
    (entries) => {
      // Among currently-intersecting sections, pick whichever has the
      // largest visible portion — avoids flickering between two
      // sections when a scroll position briefly shows slivers of both.
      const visible = entries.filter((e) => e.isIntersecting);
      if (visible.length === 0) return;
      const mostVisible = visible.reduce((best, e) => (e.intersectionRatio > best.intersectionRatio ? e : best));
      setActive(mostVisible.target.id);
    },
    {
      // Counts a section as "in view" once it occupies a meaningful
      // middle band of the viewport, rather than the instant any
      // sliver of it appears at the very edge.
      rootMargin: '-40% 0px -40% 0px',
      threshold: [0, 0.25, 0.5, 0.75, 1],
    }
  );

  targets.forEach(({ el }) => observer.observe(el));

  // On mobile/tablet, the page genuinely starts at the Resources
  // section (it's first in document order, and the scroll-restoration
  // fix elsewhere already ensures a fresh load lands at the top) —
  // but nothing highlighted ANY nav button until the user scrolled,
  // since the IntersectionObserver above only fires on an actual
  // visibility change, not on initial load. Desktop doesn't need this:
  // all three columns are independently visible at once there, so a
  // single "active" highlight doesn't carry the same meaning.
  if (window.innerWidth <= 1400 || window.innerHeight <= 1067) {
    setActive('resourcesNav');
  }
}

initNavScrollSpy();

// Keeps the footer copyright year current automatically, no manual edits needed.
const copyrightYearEl = document.getElementById('copyrightYear');
if (copyrightYearEl) {
  copyrightYearEl.textContent = String(new Date().getFullYear());
}

// Keyboard arrow-key scrolling for the independently-scrolling columns.
// Each column has tabindex="0" so it can receive focus directly; once
// focused, Up/Down/PageUp/PageDown/Home/End scroll that column only.
const scrollableColumns = document.querySelectorAll('.col');

scrollableColumns.forEach((col) => {
  col.addEventListener('keydown', (e) => {
    const step = 60;
    switch (e.key) {
      case 'ArrowDown':
        col.scrollTop += step;
        e.preventDefault();
        break;
      case 'ArrowUp':
        col.scrollTop -= step;
        e.preventDefault();
        break;
      case 'PageDown':
        col.scrollTop += col.clientHeight * 0.9;
        e.preventDefault();
        break;
      case 'PageUp':
        col.scrollTop -= col.clientHeight * 0.9;
        e.preventDefault();
        break;
      case 'Home':
        col.scrollTop = 0;
        e.preventDefault();
        break;
      case 'End':
        col.scrollTop = col.scrollHeight;
        e.preventDefault();
        break;
      default:
        break;
    }
  });
});

// ===================================================================
// LIVE WEATHER — uses the browser's Geolocation API for coordinates,
// BigDataCloud's free reverse-geocoding endpoint for a human-readable
// place name, and Open-Meteo (free, keyless, CORS-enabled) for the
// actual current conditions. No paid/keyed AccuWeather API is called
// from the client — that would require a secret key that can't safely
// live in client-side code.
// ===================================================================

// Looks up an approximate location from the visitor's IP address —
// no browser permission prompt, no navigator.geolocation call. Less
// precise than GPS (city-level, not exact), but works immediately and
// silently for every visitor. Calling the endpoint with no lat/lon
// triggers BigDataCloud's automatic IP-based fallback.
async function lookupLocationFromIp() {
  const url = 'https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=en';
  const res = await fetch(url);
  if (!res.ok) throw new Error('IP location lookup failed');
  const data = await res.json();
  const city = data.city || data.locality || '';
  const region = data.principalSubdivisionCode ? data.principalSubdivisionCode.split('-').pop() : (data.principalSubdivision || '');
  const placeLabel = city && region ? `${city}, ${region}` : (city || data.countryName || 'Your area');
  if (typeof data.latitude !== 'number' || typeof data.longitude !== 'number') {
    throw new Error('IP location lookup returned no coordinates');
  }
  return { placeLabel, latitude: data.latitude, longitude: data.longitude };
}

// NWS gives a plain-English shortForecast string rather than a
// numeric code, and its own icon URLs are explicitly marked deprecated
// by NWS's own API team with no fixed replacement timeline (confirmed
// via their GitHub discussions) — so matching against keywords in the
// forecast text is more durable than depending on a URL structure
// that's already slated to change. Checked in this order (most
// specific/severe conditions first) so e.g. "Thunderstorms" doesn't
// fall through to a generic "rain" match.
function describeNwsForecast(shortForecast, isDaytime) {
  const text = (shortForecast || '').toLowerCase();
  const day = isDaytime !== false;
  const icon = day ? 'fa-sun' : 'fa-moon';

  if (text.includes('thunderstorm') || text.includes('t-storm')) return { label: shortForecast, icon: 'fa-cloud-bolt' };
  if (text.includes('snow') || text.includes('flurries') || text.includes('blizzard')) return { label: shortForecast, icon: 'fa-snowflake' };
  if (text.includes('freezing rain') || text.includes('sleet') || text.includes('ice')) return { label: shortForecast, icon: 'fa-cloud-rain' };
  if (text.includes('heavy rain') || text.includes('showers')) return { label: shortForecast, icon: 'fa-cloud-showers-heavy' };
  if (text.includes('drizzle')) return { label: shortForecast, icon: 'fa-cloud-rain' };
  if (text.includes('rain')) return { label: shortForecast, icon: 'fa-cloud-rain' };
  if (text.includes('fog') || text.includes('haze')) return { label: shortForecast, icon: 'fa-smog' };
  if (text.includes('overcast')) return { label: shortForecast, icon: 'fa-cloud' };
  if (text.includes('mostly cloudy') || text.includes('cloudy')) return { label: shortForecast, icon: day ? 'fa-cloud-sun' : 'fa-cloud-moon' };
  if (text.includes('partly') || text.includes('few clouds')) return { label: shortForecast, icon: day ? 'fa-cloud-sun' : 'fa-cloud-moon' };
  if (text.includes('clear') || text.includes('sunny')) return { label: shortForecast, icon };
  return { label: shortForecast || 'Conditions Unavailable', icon: 'fa-circle-question' };
}

// ===================================================================
// NWS (National Weather Service) WEATHER — replaces the earlier
// Open-Meteo integration. Open-Meteo's free tier is non-commercial use
// only; api.weather.gov is public US government data with no usage
// restriction at all, which matters since this site runs on
// iiseagrant.org. Goes through a Cloudflare Worker proxy (see
// /proxy/nws-weather-proxy-worker.js) because NWS requires a real,
// identifying User-Agent header on every request, and browsers
// permanently forbid JavaScript from setting that header via fetch()
// — there's no client-side workaround, so the proxy sets it
// server-side instead, the same pattern already used for the IDPH and
// NDBC data elsewhere in this project.
//
// NWS forecasts are PERIOD-based (e.g. "Today," "Tonight"), not a
// single instantaneous "current conditions" snapshot the way
// Open-Meteo's `current` block was — so this displays the first
// (most current) period rather than averaging/picking fields out of
// a live snapshot.
// ===================================================================
const NWS_PROXY_BASE_URL = 'https://southern-lake-michigan-outdoors-weather.joeldport.workers.dev';

async function fetchNwsForecast(lat, lon) {
  const pointsUrl = NWS_PROXY_BASE_URL
    ? `${NWS_PROXY_BASE_URL}/points?lat=${lat}&lon=${lon}`
    : `https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`;

  const pointsRes = await fetch(pointsUrl, NWS_PROXY_BASE_URL ? {} : { headers: { Accept: 'application/geo+json' } });
  if (!pointsRes.ok) throw new Error(`NWS points lookup failed (${pointsRes.status})`);
  const pointsData = await pointsRes.json();
  const forecastUrl = pointsData?.properties?.forecast;
  if (!forecastUrl) throw new Error('NWS points response had no forecast URL');

  const finalForecastUrl = NWS_PROXY_BASE_URL
    ? `${NWS_PROXY_BASE_URL}/forecast?url=${encodeURIComponent(forecastUrl)}`
    : forecastUrl;

  const forecastRes = await fetch(finalForecastUrl, NWS_PROXY_BASE_URL ? {} : { headers: { Accept: 'application/geo+json' } });
  if (!forecastRes.ok) throw new Error(`NWS forecast fetch failed (${forecastRes.status})`);
  const forecastData = await forecastRes.json();
  const periods = forecastData?.properties?.periods;
  if (!periods || periods.length === 0) throw new Error('NWS forecast response had no periods');
  return periods[0]; // first period = current/most-immediate conditions
}

// Stores both locations' weather data after fetch, so the card flip
// can switch between them without re-fetching.
const weatherState = {
  slmo: null,   // { placeLabel, period } — Southern Lake Michigan
  local: null,  // { placeLabel, period } — user's detected location
  activeSide: 'slmo', // 'slmo' or 'local'
};

function renderWeather({ placeLabel, period }, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const { label, icon } = describeNwsForecast(period.shortForecast, period.isDaytime);
  const temp = Math.round(period.temperature);
  const wind = period.windSpeed || 'N/A';
  const windDir = period.windDirection || '';

  // Only the SLMO side gets the (approximate) note and its explanation.
  // The local side shows the detected city name, which is already specific.
  const isSlmo = containerId === 'weatherContentSlmo';
  const locationNote = isSlmo
    ? ` <abbr class="weather-approx" title="This forecast uses a fixed NWS grid point (41.85°N, 87.65°W) to represent general conditions along the southern Lake Michigan shoreline. Actual conditions at any specific beach may differ due to lake breezes, fog, or local terrain.">(approximate)</abbr>`
    : '';

  container.innerHTML = `
    <div class="weather-main">
      ${iconHtml(icon.replace(/^fa-/, ''), 'weather-icon')}
      <div class="weather-temp-block">
        <span class="weather-temp">${temp}<span class="weather-unit">°${period.temperatureUnit || 'F'}</span></span>
        <span class="weather-cond">${label}</span>
      </div>
    </div>
    <p class="weather-location">${placeLabel}${locationNote} &middot; ${period.name || 'Current'}</p>
    <dl class="weather-stats">
      <div><dt>Wind</dt><dd>${windDir} ${wind}</dd></div>
    </dl>
  `;
}

function applyWeatherEffects(shortForecast) {
  // Update background video and music to match the currently-visible
  // weather card side. Both systems use the same normalized category.
  const category = normalizeWeatherCategory(shortForecast);
  crossfadeBgVideo(category);
  if (window.__slmoAmbientAudio) {
    window.__slmoAmbientAudio.setWeatherTrack(category);
  }
}

function applyActiveWeather() {
  const data = weatherState.activeSide === 'local' ? weatherState.local : weatherState.slmo;
  if (data && data.period) {
    applyWeatherEffects(data.period.shortForecast);
  }
}

function renderWeatherError(message) {
  const container = document.getElementById('weatherContentSlmo');
  if (!container) return;
  container.innerHTML = `
    <p class="weather-error">${iconHtml('triangle-exclamation')} ${message}</p>
    <a href="https://www.weather.gov/" target="_blank" rel="noopener" class="weather-link">Check weather.gov directly ${iconHtml('arrow-up-right-from-square')}<span class="sr-only"> (opens in new tab)</span></a>
  `;
}

// Southern Lake Michigan's own approximate center — used as a
// fallback location when IP geolocation either fails outright or
// returns a coordinate NWS can't possibly serve (confirmed via a real
// failure: BigDataCloud once returned a South Korean coordinate for a
// visitor, which correctly 502'd against NWS since that point isn't
// on any US forecast grid at all). IP geolocation is well-known to be
// wrong sometimes — VPNs, certain ISPs, and corporate networks can
// all throw it off — so this isn't a one-off bug to chase further,
// it's a real, expected failure mode worth guarding against directly.
const SLMO_FALLBACK_LOCATION = { placeLabel: 'Southern Lake Michigan', latitude: 41.85, longitude: -87.65 };

// Rough bounding box for the continental US (NWS's coverage area) —
// deliberately generous rather than precise, since this only needs
// to catch obviously-wrong locations (other continents, oceans far
// from any US coastline), not validate borders exactly.
function isLikelyWithinNwsCoverage(lat, lon) {
  return lat >= 24 && lat <= 50 && lon >= -125 && lon <= -66;
}

async function initWeather() {
  // Fetch Southern Lake Michigan (fallback/primary) and local weather
  // in parallel. SLMO always uses the known fallback location; local
  // uses IP geolocation and falls back to SLMO if it fails or lands
  // outside NWS coverage. Both sides of the card are populated
  // independently so the flip feels instant.
  const [slmoResult, localResult] = await Promise.allSettled([
    // SLMO side — always the fallback location
    (async () => {
      const period = await fetchNwsForecast(SLMO_FALLBACK_LOCATION.latitude, SLMO_FALLBACK_LOCATION.longitude);
      return { placeLabel: SLMO_FALLBACK_LOCATION.placeLabel, period };
    })(),
    // Local side — IP geolocation, with NWS-coverage guard
    (async () => {
      let { placeLabel, latitude, longitude } = await lookupLocationFromIp();
      if (!isLikelyWithinNwsCoverage(latitude, longitude)) {
        console.warn(`[weather] IP geolocation returned a coordinate outside NWS's coverage area (${latitude}, ${longitude}) — falling back to Southern Lake Michigan's own location instead of attempting a request NWS can't serve`);
        ({ placeLabel, latitude, longitude } = SLMO_FALLBACK_LOCATION);
      }
      const period = await fetchNwsForecast(latitude, longitude);
      return { placeLabel, period };
    })(),
  ]);

  if (slmoResult.status === 'fulfilled') {
    weatherState.slmo = slmoResult.value;
    renderWeather(slmoResult.value, 'weatherContentSlmo');
  } else {
    console.error('[weather] SLMO fetch failed:', slmoResult.reason);
    renderWeatherError('Couldn\u2019t load live weather right now.');
  }

  if (localResult.status === 'fulfilled') {
    weatherState.local = localResult.value;
    renderWeather(localResult.value, 'weatherContentLocal');
  } else {
    console.error('[weather] local fetch failed:', localResult.reason);
    const localContainer = document.getElementById('weatherContentLocal');
    if (localContainer) {
      localContainer.innerHTML = `<p class="weather-error">${iconHtml('triangle-exclamation')} Couldn\u2019t load local weather.</p>`;
    }
  }

  // Apply video/audio for the default (SLMO) side
  applyActiveWeather();

  // Wire the flip buttons — toggle .weather-card--flipped on the card
  // which swaps opacity between the two faces via CSS.
  const card = document.getElementById('weatherCard');
  const flipToLocal = document.getElementById('weatherFlipToLocal');
  const flipToSlmo = document.getElementById('weatherFlipToSlmo');
  const frontFace = card ? card.querySelector('.weather-card-face--front') : null;
  const backFace = card ? card.querySelector('.weather-card-face--back') : null;

  // The face that's opacity:0 / pointer-events:none is still in the
  // DOM (for the crossfade), so its links/buttons stay reachable by
  // Tab even though they're invisible — a keyboard-only navigation
  // trap. `inert` removes a subtree from the tab order (and from
  // screen reader / find-in-page reach) while it's not the visible
  // side, in addition to CSS already hiding it visually.
  function syncFaceInertness(side) {
    if (!frontFace || !backFace) return;
    if (side === 'local') {
      frontFace.setAttribute('inert', '');
      backFace.removeAttribute('inert');
    } else {
      backFace.setAttribute('inert', '');
      frontFace.removeAttribute('inert');
    }
  }
  syncFaceInertness('slmo'); // front face is visible by default on load

  function setFlipSide(side) {
    weatherState.activeSide = side;
    if (card) card.classList.toggle('weather-card--flipped', side === 'local');
    syncFaceInertness(side);
    applyActiveWeather();
  }

  if (flipToLocal) flipToLocal.addEventListener('click', () => setFlipSide('local'));
  if (flipToSlmo)  flipToSlmo.addEventListener('click',  () => setFlipSide('slmo'));
}

initWeather();

// ===================================================================
// ILLINOIS BEACHGUARD — live data from the Illinois Department of
// Public Health beach advisory RSS feed. The feed lists ONLY beaches
// that currently have an active advisory or closure (statewide, not
// just Lake Michigan), so absence from the feed means no advisory.
//
// IMPORTANT — CORS: the IDPH server does not send an
// Access-Control-Allow-Origin header, so browsers block this fetch
// from any site other than idph.illinois.gov itself. That's almost
// certainly why this has been failing consistently — it isn't
// something fixable from this side alone. The real fix is a small
// server-side proxy that fetches the feed and re-serves it with CORS
// headers attached (see /proxy/idph-rss-proxy-worker.js in this
// project for a ready-to-deploy Cloudflare Worker). Once deployed,
// set PROXY_URL below to that worker's URL.
// ===================================================================
const PROXY_URL = 'https://southern-lake-michigan-outdoors-beaches.joeldport.workers.dev';
const DIRECT_RSS_URL = 'https://idph.illinois.gov/envhealth/ilbeaches/public/RssFeed.aspx';

// ===================================================================
// Comprehensive-ish list of Illinois Lake Michigan public beaches.
// Most of these have no live advisory data most of the time — they're
// shown as "Check site" links to the right place, while any beach
// here that DOES currently have a real advisory (matched by name
// against the live IDPH feed) gets bumped to the front with its real
// status instead. Not claimed to be 100% exhaustive — easy to extend
// with more beaches/links later if any are missing.
// ===================================================================
// Real Illinois Lake Michigan public beaches, sourced directly from
// IDPH's own BeachGuard data export (filtered to GREAT_LAKE_TEXT =
// "Michigan"; 55 beaches as of this export). Each links to that exact
// beach's real IDPH BeachGuard detail page via its BEACH_ID, the
// authoritative source you asked this to be rooted in — not
// third-party park-district sites. Most show "Check site" most of the
// time; any beach here that DOES currently have a live advisory
// (matched by name against the live IDPH RSS feed) gets bumped to the
// front with its real status instead of the generic badge.
// ===================================================================
const IL_LAKE_MICHIGAN_BEACHES = [
  { name: '12th Street', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=317' },
  { name: '57th Street Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=319' },
  { name: '63rd Street Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=350' },
  { name: 'Calumet Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=323' },
  { name: 'Evanston Church Dog Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=326' },
  { name: 'Evanston Clark Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=327' },
  { name: 'Evanston Greenwood Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=328' },
  { name: 'Evanston Lee Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=329' },
  { name: 'Evanston Lighthouse Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=330' },
  { name: 'Evanston South Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=331' },
  { name: 'Foster Avenue Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=334' },
  { name: 'George A. Lane Park & Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=336' },
  { name: 'Glencoe Park Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=337' },
  { name: 'Hartigan Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=321' },
  { name: 'Helen Doria Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=537' },
  { name: 'Highland Park Avenue Boating Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=340' },
  { name: 'Highland Park Moraine Park Dog Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=341' },
  { name: 'Highland Park Rosewood Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=342' },
  { name: 'Illinois Beach State Park Camp Logan Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=347' },
  { name: 'Illinois Beach State Park North Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=349' },
  { name: 'Illinois Beach State Park Resort Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=346' },
  { name: 'Illinois Beach State Park Sailing Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=348' },
  { name: 'Illinois Beach State Park South Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=345' },
  { name: 'Kenilworth Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=354' },
  { name: 'Lake Bluff Dog Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=355' },
  { name: 'Lake Bluff Sunrise Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=356' },
  { name: 'Lake Forest Forest Park Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=357' },
  { name: 'Leone Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=359' },
  { name: 'Lincoln Street Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=367' },
  { name: 'Margaret T Burroughs (31st St. Beach)', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=318' },
  { name: 'Marion Mahoney Griffin Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=351' },
  { name: 'Montrose Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=360' },
  { name: 'Montrose Dog Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=361' },
  { name: 'North Avenue Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=363' },
  { name: 'North Chicago Foss Park Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=364' },
  { name: 'North Point Marina Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=365' },
  { name: 'North Shore Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=366' },
  { name: 'Oak Street Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=368' },
  { name: 'Oakwood Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=422' },
  { name: 'Ohio Street Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=369' },
  { name: 'Osterman Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=353' },
  { name: 'Park Avenue North', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=505' },
  { name: 'Rainbow Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=371' },
  { name: 'South Shore Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=374' },
  { name: 'Tobey Prinz Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=370' },
  { name: 'Waukegan North Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=376' },
  { name: 'Waukegan South Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=377' },
  { name: 'Wilmette Gillson Park Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=378' },
  { name: 'Wilmette Gillson Park Dog Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=379' },
  { name: 'Wilmette Langdon Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=421' },
  { name: 'Winnetka Centennial Dog Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=380' },
  { name: 'Winnetka Elder Park Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=381' },
  { name: 'Winnetka Lloyd Park Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=382' },
  { name: 'Winnetka Maple Park Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=383' },
  { name: 'Winnetka Tower Beach', link: 'https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=384' },
];

// IDPH's own RSS feed has a real bug: every <link> element it
// publishes still points to the dead legacy domain
// (http://app.idph.state.il.us/...?BeachId=N) instead of their
// current live site (https://idph.illinois.gov/...?BeachID=N) — this
// isn't something on our end, it's baked into the feed itself
// (confirmed by fetching RssFeed.aspx directly). The legacy domain
// 404s. Rewriting each link to the live host/casing fixes it.
function fixIdphLegacyLink(rawLink) {
  const match = rawLink.match(/BeachId=(\d+)/i);
  if (!match) return rawLink; // unexpected shape — leave as-is rather than guess
  const beachId = match[1];
  return `https://idph.illinois.gov/envhealth/ilbeaches/public/BeachDetail.aspx?BeachID=${beachId}`;
}

function parseIdphRss(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) throw new Error('RSS parse error');

  const items = Array.from(doc.querySelectorAll('item')).map((item) => {
    const title = item.querySelector('title')?.textContent?.trim() || '';
    const rawLink = item.querySelector('link')?.textContent?.trim() || '#';
    const link = fixIdphLegacyLink(rawLink);
    // Titles vary in shape:
    //   "Closure - Lake Michigan - Highland Park Avenue Boating Beach"  (3 parts: status - waterbody - beach)
    //   "Closure - Rehoboth Baptist Camp"                                (2 parts: status - beach, no waterbody)
    const parts = title.split(' - ').map((p) => p.trim());
    const statusType = parts[0] || 'Advisory';
    const beachName = parts.length > 2 ? parts.slice(2).join(' - ') : (parts[1] || title);
    return { title, link, statusType, beachName };
  });
  return items;
}

function badgeClassForStatus(statusType) {
  const t = statusType.toLowerCase();
  if (t.includes('closure') || t.includes('closed')) return 'badge--danger';
  if (t.includes('advisory')) return 'badge--warn';
  return 'badge--warn';
}

// Real advisory row: shows the actual status (Closure/Advisory) from
// the live feed, linking to that advisory's own detail page.
function advisoryListItemHtml(item) {
  return `
      <li>
        <span>${item.beachName}</span>
        <a href="${item.link}" target="_blank" rel="noopener" class="badge ${badgeClassForStatus(item.statusType)}">${item.statusType}<span class="sr-only"> — view details (opens in new tab)</span></a>
      </li>`;
}
// Backward-compatible alias (used as the default itemRenderer elsewhere)
const beachListItemHtml = advisoryListItemHtml;

// "Check site" row: no current advisory data for this beach, just a
// link to wherever its real status can actually be checked. Defaults
// to the IDEM portal since that's the right destination for every
// Indiana beach (no per-beach pages exist there); Illinois call sites
// always pass an explicit per-beach link instead.
// `isKnownOpen` distinguishes two genuinely different situations that
// otherwise look identical ("no current advisory"): for Illinois, the
// IDPH feed only ever publishes an entry when a beach has an active
// closure/advisory — so a beach NOT in the feed is confirmed open by
// the system's own logic, and gets a real green "Open" badge. For
// Indiana, there's no live feed at all (IDEM's portal can't be read
// from here), so "no data" genuinely means no data, not "confirmed
// open" — that stays the neutral "Check site" badge so it doesn't
// imply a status we don't actually have.
function checkSiteListItemHtml(name, link = 'https://portal.idem.in.gov/BeachAlert/', isKnownOpen = false) {
  if (isKnownOpen) {
    return `
      <li>
        <span>${name}</span>
        <a href="${link}" target="_blank" rel="noopener" class="badge badge--ok">Open<span class="sr-only"> — view ${name} (opens in new tab)</span></a>
      </li>`;
  }
  return `
      <li>
        <span>${name}</span>
        <a href="${link}" target="_blank" rel="noopener" class="badge badge--unknown">Check site<span class="sr-only"> — view ${name} (opens in new tab)</span></a>
      </li>`;
}

// Builds a beach list's HTML: items in `primary` always show first;
// if `secondary` has anything, it's tucked behind a "Show N more"
// toggle. `idPrefix` keeps element IDs unique when this is reused for
// more than one list (e.g. "il" and "in"). `itemRenderer` controls how
// each entry in `primary`/`secondary` becomes an <li> — defaults to
// the RSS-shaped renderer but callers can pass their own.
function renderAccordionBeachList(listEl, primary, secondary, idPrefix, emptyMessageHtml, itemRenderer = beachListItemHtml) {
  if (!listEl) {
    console.warn(`[accordion:${idPrefix}] listEl is null/undefined — aborting`);
    return;
  }

  if (primary.length === 0 && secondary.length === 0) {
    listEl.innerHTML = emptyMessageHtml;
    return;
  }

  const primaryHtml = primary.map(itemRenderer).join('');

  if (secondary.length === 0) {
    listEl.innerHTML = primaryHtml;
    return;
  }

  const toggleId = `${idPrefix}AccordionToggle`;
  const panelId = `${idPrefix}AccordionPanel`;
  const secondaryHtml = secondary.map(itemRenderer).join('');

  listEl.innerHTML = `
    ${primaryHtml}
    <li class="beach-accordion-toggle-row">
      <button type="button" class="beach-accordion-toggle" id="${toggleId}" aria-expanded="false" aria-controls="${panelId}">
        ${iconHtml('chevron-down')}
        Show ${secondary.length} more
      </button>
    </li>
    <li class="beach-accordion-panel" id="${panelId}" hidden>
      <ul class="beach-list beach-list--nested">${secondaryHtml}</ul>
    </li>
  `;

  const toggle = document.getElementById(toggleId);
  const panel = document.getElementById(panelId);

  // Guard against duplicate IDs: warn loudly if more than one element
  // in the document shares this ID, since getElementById will only
  // ever return the first and a duplicate would silently break things.
  const allWithToggleId = document.querySelectorAll(`#${toggleId}`);
  const allWithPanelId = document.querySelectorAll(`#${panelId}`);
  if (allWithToggleId.length > 1) {
    console.error(`[accordion:${idPrefix}] DUPLICATE ID DETECTED: #${toggleId} appears ${allWithToggleId.length} times in the document`);
  }
  if (allWithPanelId.length > 1) {
    console.error(`[accordion:${idPrefix}] DUPLICATE ID DETECTED: #${panelId} appears ${allWithPanelId.length} times in the document`);
  }

  if (toggle && panel) {
    toggle.addEventListener('click', () => {
      const isOpen = !panel.hasAttribute('hidden');
      if (isOpen) {
        panel.setAttribute('hidden', '');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.innerHTML = `${iconHtml('chevron-down')} Show ${secondary.length} more`;
      } else {
        panel.removeAttribute('hidden');
        toggle.setAttribute('aria-expanded', 'true');
        toggle.innerHTML = `${iconHtml('chevron-up')} Show fewer`;
      }
    });
  } else {
    console.error(`[accordion:${idPrefix}] could not attach listener — toggle or panel missing after render`);
  }
}

function renderIlBeachList(items) {
  const list = document.getElementById('ilBeachList');
  if (!list) return;

  // ALL real advisories from the live IDPH feed — no filtering by
  // waterbody. Filtering by "is this Lake Michigan" was an extra
  // layer of guesswork on top of the feed that risked exactly what
  // happened: real advisories silently disappearing because their
  // name didn't fuzzy-match a separate roster closely enough. The
  // feed itself is the authoritative source this is meant to be
  // rooted in, so every advisory it reports gets shown.
  const advisoryEntries = items.map((item) => ({ kind: 'advisory', item }));

  // Names that already have a live advisory, so a beach isn't also
  // listed a second time as a plain "Check site" entry below.
  const advisoryNames = new Set(items.map((i) => i.beachName.toLowerCase()));

  // Every known beach that does NOT currently have a live advisory —
  // shown as "Check site," linking to its real IDPH BeachGuard page.
  const checkSiteBeaches = IL_LAKE_MICHIGAN_BEACHES.filter(
    (b) => !advisoryNames.has(b.name.toLowerCase())
  );
  const checkSiteEntries = checkSiteBeaches.map((beach) => ({ kind: 'checksite', beach }));

  const itemRenderer = (entry) =>
    entry.kind === 'advisory'
      ? advisoryListItemHtml(entry.item)
      : checkSiteListItemHtml(entry.beach.name, entry.beach.link, true);

  // Visible-by-default: the 3 most recent advisories. Everything else
  // — remaining advisories first, then every "Check site" beach —
  // lives behind a single accordion, so people aren't shown all ~50
  // beaches at once but everything is still reachable with one click
  // (or instantly via search, which searches this full list either
  // way regardless of accordion state).
  const visibleAdvisories = advisoryEntries.slice(0, 3);
  const overflowAdvisories = advisoryEntries.slice(3);

  const finalPrimary = visibleAdvisories;
  const finalSecondary = [...overflowAdvisories, ...checkSiteEntries];

  renderAccordionBeachList(list, finalPrimary, finalSecondary, 'il', '', itemRenderer);

  const stamp = document.getElementById('ilFeedTimestamp');
  if (stamp) {
    const now = new Date();
    stamp.textContent = ` \u00b7 checked ${now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }
}

// Fallback shown when no live feed (direct or proxied) can be reached.
// Uses the SAME accordion builder as the live-data path (rather than a
// separate flat list), so the "Show more" toggle exists here too —
// this fallback path was previously a plain list with no accordion at
// all, which is almost certainly why the accordion looked broken: if
// the feed fails intermittently, this no-toggle fallback would render
// instead of the real accordion, even though both share the same
// #ilBeachList container and look superficially similar.
function renderIlBeachFallback() {
  const list = document.getElementById('ilBeachList');
  if (!list) return;

  // Deliberately NOT passing isKnownOpen=true here, unlike the normal
  // live-feed path — this function only runs when the feed itself
  // couldn't be reached, so "open" genuinely isn't confirmed; showing
  // it as open would be actively wrong, not just unconfirmed.
  const renderer = (beach) => checkSiteListItemHtml(beach.name, beach.link);
  const primary = IL_LAKE_MICHIGAN_BEACHES.slice(0, 3);
  const secondary = IL_LAKE_MICHIGAN_BEACHES.slice(3);

  renderAccordionBeachList(list, primary, secondary, 'il', '', renderer);

  const stamp = document.getElementById('ilFeedTimestamp');
  if (stamp) stamp.textContent = ' \u00b7 live feed unreachable from this site, showing beach links instead';
}

async function tryFetchRss(url) {
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`RSS fetch failed (${res.status})`);
  return res.text();
}

async function initIlBeachguard() {
  // Try the proxy first if one is configured, then fall back to the
  // direct feed (which will likely be CORS-blocked from most domains).
  const attempts = PROXY_URL ? [PROXY_URL, DIRECT_RSS_URL] : [DIRECT_RSS_URL];

  for (const url of attempts) {
    try {
      const xmlText = await tryFetchRss(url);
      const items = parseIdphRss(xmlText);
      renderIlBeachList(items);
      return; // success, stop here
    } catch {
      // try the next URL in the list, if any
    }
  }

  // Every attempt failed — show the named-beach fallback instead of a bare error.
  renderIlBeachFallback();
}

initIlBeachguard();

// ===================================================================
// INDIANA BEACHALERT (IDEM) — confirmed via the official "Indiana -
// Active Beaches" export (33 Lake Michigan beaches, 17 inland). No
// live advisory feed is possible here at all: IDEM's BeachAlert
// portal (a Power Apps Portal / Dynamics-backed site) loads its data
// through an authenticated session tied to the portal's own domain —
// there's no public endpoint this site can read from, and no
// indication IDEM issues anything via a channel this site could ever
// connect to. Every beach below is shown as "Check site," linking to
// the real portal — this isn't a "maybe later" placeholder, it's the
// correct, durable state for the Indiana side. ("EPABEACH" from the
// export is the state's own internal test record, not a real public
// beach, and is excluded here.)
// ===================================================================
const IN_LAKE_MICHIGAN_BEACHES = [
  'Broadway Beach',
  'Buffington Harbor Beach',
  'Central Beach Area: IN Dunes National Park',
  'Dunbar Beach Area: IN Dunes National Park',
  'Duneland Beach Stop 34',
  'Hammond Marina East Beach',
  'Hammond Marina West Beach',
  'Indiana Dunes State Park East Beach',
  'Indiana Dunes State Park West Beach',
  'Jeorse Park Beach I',
  'Jeorse Park Beach II',
  'Kemil Beach Area: IN Dunes National Park',
  'Lake Street Beach',
  'Lake View Beach Area:IN Dunes National Park',
  'Long Beach Stop 14',
  'Long Beach Stop 20',
  'Long Beach Stop 24',
  'Marquette Park Beach',
  'Michiana Shores Stop 37',
  'Mount Baldy Beach Area:IN Dunes National Park',
  'Ogden Dunes East Beach',
  'Ogden Dunes West Beach',
  'Portage Lakefront: IN Dunes National Park',
  'Porter Beach Area: IN Dunes National Park',
  'Sheridan Beach Stop 2',
  'Sheridan Beach Stop 7',
  'Shoreland Hills Beach Stop 31',
  'Washington Park Beach',
  'Wells Street Beach',
  'West Beach Area: IN Dunes National Park',
  'Whihala Beach East',
  'Whihala Beach West',
];

const IN_OTHER_BEACHES = [
  'Cedar Lake Beach',
  "Chain O' Lakes State Park",
  'Clubhouse Beach',
  'Hermits Lake Beach',
  'Hudson Lake Beach',
  'Lake Dalecarlia Beach',
  'Lake George',
  'Lower Fish Lake Beach',
  'New Stone Lake Beach',
  'Old Stone Lake Beach',
  'Pine Lake - Assembly Beach',
  'Pine Lake - Kiwanis Park Beach',
  'Pine Lake - Waverly Road Beach',
  'Robinson Lake Beach',
  'Sandy Beach',
  'Stone Lake Launch Beach',
  'Upper Fish Lake Beach',
];

function renderInBeachList() {
  const list = document.getElementById('inBeachList');
  if (!list) return;

  // No live advisory data exists for Indiana at all (IDEM's portal
  // has no public feed this site can read), so there's nothing to
  // rank by recency/severity the way Illinois's advisories are
  // ranked. Instead, the full list (Lake Michigan + inland beaches
  // combined) is sorted alphabetically, and the first 3 alphabetically
  // are what's visible by default — a simple, predictable ordering
  // rather than an arbitrary category-based one.
  const allBeaches = [...IN_LAKE_MICHIGAN_BEACHES, ...IN_OTHER_BEACHES]
    .map((name) => ({ name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const primary = allBeaches.slice(0, 3);
  const secondary = allBeaches.slice(3);

  renderAccordionBeachList(list, primary, secondary, 'in', '', (item) => checkSiteListItemHtml(item.name));
}

renderInBeachList();

// ===================================================================
// BEACH SEARCH — filters the Illinois Beachguard and Indiana
// BeachAlert lists live as the user types. Matches against every
// beach row in both lists, including ones currently tucked inside the
// "Show more" accordions; if a match is found inside a collapsed
// accordion, that accordion is automatically expanded so the match is
// actually visible rather than technically "shown" but still hidden.
// Runs after both lists have rendered, since it needs their real DOM.
// ===================================================================
function initBeachSearch() {
  const input = document.getElementById('beachSearchInput');
  const status = document.getElementById('beachSearchStatus');
  if (!input) return;

  // Real beach rows only — excludes the toggle button's own <li> and
  // the accordion panel's wrapper <li> (that one mirrors empty/whole
  // state of its children, not a beach itself).
  function getBeachRows() {
    const lists = [document.getElementById('ilBeachList'), document.getElementById('inBeachList')];
    let rows = [];
    lists.forEach((list) => {
      if (!list) return;
      const listRows = list.querySelectorAll('li');
      listRows.forEach((li) => {
        if (li.classList.contains('beach-accordion-toggle-row')) return;
        if (li.classList.contains('beach-accordion-panel')) return;
        if (li.classList.contains('beach-status-row')) return;
        rows.push(li);
      });
    });
    return rows;
  }

  function expandAccordionFor(row) {
    const panel = row.closest('.beach-accordion-panel');
    if (!panel) return; // row isn't inside a collapsed accordion at all
    if (panel.hasAttribute('hidden')) {
      panel.removeAttribute('hidden');
    }
    const toggle = document.getElementById(panel.id.replace('Panel', 'Toggle'));
    if (toggle) toggle.setAttribute('aria-expanded', 'true');
  }

  // While a search is active, the "Show N more / Show fewer" toggle is
  // hidden entirely rather than shown with a corrected count — once
  // search has auto-expanded a panel, there's nothing meaningful left
  // for that control to do, and a stale "Show 47 more" next to a
  // handful of real matches looks broken (which is exactly what
  // prompted this fix). Clearing the search restores normal toggle
  // behavior, recollapsing anything search had opened.
  function updateTogglesForSearch(searchActive) {
    document.querySelectorAll('.beach-accordion-toggle-row').forEach((toggleRow) => {
      toggleRow.classList.toggle('beach-search-hidden', searchActive);
    });
    if (!searchActive) {
      // Restore each panel to its natural collapsed state and put each
      // toggle's label back to a real "Show N more" reflecting its
      // actual full count, undoing any auto-expand search performed.
      document.querySelectorAll('.beach-accordion-panel').forEach((panel) => {
        panel.setAttribute('hidden', '');
        const toggle = document.getElementById(panel.id.replace('Panel', 'Toggle'));
        if (!toggle) return;
        const fullCount = panel.querySelectorAll('li').length;
        toggle.setAttribute('aria-expanded', 'false');
        toggle.innerHTML = `${iconHtml('chevron-down')} Show ${fullCount} more`;
      });
    }
  }

  function applyFilter() {
    const term = input.value.trim().toLowerCase();
    const rows = getBeachRows();
    const sections = [
      document.getElementById('ilBeachList')?.closest('.beachguard-card'),
      document.getElementById('inBeachList')?.closest('.beachguard-card'),
    ].filter(Boolean);

    if (term === '') {
      rows.forEach((row) => row.classList.remove('beach-search-hidden'));
      sections.forEach((section) => section.classList.remove('beach-search-hidden'));
      updateTogglesForSearch(false);
      if (status) status.textContent = '';
      return;
    }

    let visibleCount = 0;
    rows.forEach((row) => {
      const text = row.textContent.toLowerCase();
      const matches = text.includes(term);
      row.classList.toggle('beach-search-hidden', !matches);
      if (matches) {
        visibleCount += 1;
        expandAccordionFor(row);
      }
    });

    updateTogglesForSearch(true);

    // Hide an entire section (heading link, source citation, the whole
    // card) when none of its rows currently match — otherwise the card's
    // surrounding chrome stays visible around an empty/irrelevant list.
    sections.forEach((section) => {
      const hasVisibleRow = section.querySelectorAll('li:not(.beach-search-hidden):not(.beach-accordion-toggle-row):not(.beach-accordion-panel)').length > 0;
      section.classList.toggle('beach-search-hidden', !hasVisibleRow);
    });

    if (status) {
      status.textContent = visibleCount === 0
        ? `No beaches match "${input.value.trim()}"`
        : `${visibleCount} beach${visibleCount === 1 ? '' : 'es'} match "${input.value.trim()}"`;
    }
  }

  input.addEventListener('input', applyFilter);

  // Exposed so the periodic data refresh (see refreshLiveData below)
  // can re-apply whatever search is currently active after it
  // re-renders the Illinois/Indiana lists from scratch — otherwise a
  // search typed in right before the 15-minute refresh fires would
  // silently vanish, with every beach reappearing, even though the
  // search box still shows the term the visitor typed.
  window.reapplyBeachSearch = applyFilter;
}

initBeachSearch();

// ===================================================================
// LAKE MICHIGAN BUOYS — real-time conditions from NOAA's National
// Data Buoy Center (NDBC), stations 45170/45198/45174/45186/45187.
// NDBC serves plain-text files with no documented CORS policy, so —
// same as the Illinois Beachguard feed — a direct browser fetch from
// this domain may be blocked. Tries a direct fetch first, falls back
// to a Cloudflare Worker proxy (see /proxy/ndbc-buoy-proxy-worker.js)
// if one is configured below.
//
// File format (NDBC's documented realtime2 standard met layout):
//   #YY  MM DD hh mm WDIR WSPD GST WVHT DPD APD MWD PRES ATMP WTMP DEWP VIS PTDY TIDE
//   #yr  mo dy hr mn degT  m/s m/s   m  sec sec deg  hPa degC degC degC nmi  hPa   ft
//   2026 06 26 14 00  230  5.1 6.2  0.3   3 2.1 240 1013  22.5  18.1   MM  MM   MM  MM
// First two lines are headers; the most recent reading is the first
// data row. "MM" means missing/not reported for that field.
// ===================================================================
const NDBC_PROXY_BASE_URL = 'https://southern-lake-michigan-outdoors-buoys.joeldport.workers.dev'; // assumed to follow the same naming pattern as the confirmed-working Beachguard worker — please verify this loads correctly once live
const NDBC_DIRECT_BASE_URL = 'https://www.ndbc.noaa.gov/data/realtime2';

function parseNdbcRealtimeText(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 3) return null; // needs 2 header lines + at least 1 data row

  const headerCols = lines[0].replace('#', '').trim().split(/\s+/);
  const dataRow = lines[2].trim().split(/\s+/); // index 2: first row after both header lines

  const record = {};
  headerCols.forEach((col, i) => {
    record[col] = dataRow[i];
  });
  return record;
}

// GLOS/Seagull ERDDAP — Illinois-Indiana Sea Grant's own data pipeline
// for its 3 IISG-owned buoys (Chicago=obs_98, Michigan City=obs_47,
// Wilmette=obs_57; confirmed via GLOS's own ERDDAP metadata). Tried
// FIRST for those 3 specifically, since this is the organization's own
// instrument data — more current than the NDBC relay in testing, and
// likely better CORS support per IOOS/ERDDAP's own stated best
// practices. Waukegan (45186) and Winthrop Harbor (45187) don't have a
// confirmed GLOS dataset ID yet, so they stay on NDBC only for now —
// no guessed IDs, given this project's history with unverified ones.
//
// ERDDAP's CSV response (line 1: column names, line 2: units, line 3+:
// data, newest first) is simpler to parse reliably than its JSON
// shape, which wasn't directly confirmed during research — CSV's
// format is unambiguous and documented the same way across all ERDDAP
// installations.
const GLOS_ERDDAP_BASE_URL = 'https://seagull-erddap.glos.org/erddap/tabledap';
const GLOS_FIELDS = 'time,sea_surface_temperature,air_temperature,wind_speed';

function parseGlosErddapCsv(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 3) return null; // header + units + at least 1 data row

  // ERDDAP's CSV header ALWAYS appends each column's units in
  // parentheses (confirmed by inspecting a real obs_47.csv export
  // pulled directly from GLOS's own ERDDAP server, and independently
  // confirmed by multiple ERDDAP-client examples — e.g. erddapy's own
  // documented usage of "time (UTC)" as a literal column name) — so
  // "time" alone is never the literal header text; it's always
  // "time (UTC)". Same story for every other column this function
  // reads: "sea_surface_temperature (K)", "air_temperature (K)",
  // "wind_speed (m s-1)", never the bare names. Matching on the
  // portion before " (" handles this without needing to hardcode
  // every exact unit string (which could differ if GLOS ever changes
  // units on a field). This was a real, previously-undiscovered bug:
  // every prior version of this function compared against the bare
  // names and would have silently failed (timeIndex === -1, then
  // every record.* lookup below also undefined) even on a fully
  // successful, fresh response from GLOS — independent of and on top
  // of the separate dataset-ID question this project went back and
  // forth on.
  const rawColumns = lines[0].split(',').map((c) => c.trim());
  const baseColumnName = (col) => col.split(' (')[0];
  const columns = rawColumns.map(baseColumnName);
  const timeIndex = columns.indexOf('time');

  // No longer relying on the server to have sorted rows for us (the
  // orderByMax("time") server-side function was removed — see the
  // comment above the URL construction in fetchFromGlos — since it
  // requires literal double-quote characters that aren't valid raw
  // URL syntax and were a likely cause of the consistent 502s seen in
  // testing). Genuinely finds the row with the latest time value
  // instead of assuming row order.
  const dataLines = lines.slice(2).filter((line) => line.trim().length > 0);
  if (dataLines.length === 0) return null;

  let latestRow = null;
  let latestTime = -Infinity;
  for (const line of dataLines) {
    const cells = line.split(',').map((c) => c.trim());
    const timeValue = timeIndex >= 0 ? Date.parse(cells[timeIndex]) : NaN;
    const comparableTime = Number.isNaN(timeValue) ? -Infinity : timeValue;
    if (comparableTime >= latestTime) {
      latestTime = comparableTime;
      latestRow = cells;
    }
  }
  if (!latestRow) return null;

  const record = {};
  columns.forEach((col, i) => {
    record[col] = latestRow[i];
  });

  if (!record.sea_surface_temperature && !record.air_temperature && !record.wind_speed) {
    return null;
  }

  // Normalize into the same shape parseNdbcRealtimeText produces (°C,
  // °C, m/s under NDBC's own field names) so renderBuoyCard needs no
  // changes regardless of which source actually supplied the data.
  // GLOS reports temperatures in Kelvin, not Celsius — convert here.
  const kelvinToCelsius = (k) => (k ? String(parseFloat(k) - 273.15) : k);
  return {
    WTMP: kelvinToCelsius(record.sea_surface_temperature),
    ATMP: kelvinToCelsius(record.air_temperature),
    WSPD: record.wind_speed,
    // BUG FIX: this was previously omitted from the returned object
    // even though `record.time` was already parsed correctly above
    // (it's how the "latest row" was picked in the first place).
    // getDataAge() reads this field for source==='glos' specifically —
    // without it, every genuine GLOS reading rendered with no
    // observation timestamp at all, which is exactly what looked like
    // a red flag even though the underlying data was real.
    time: record.time,
  };
}

async function fetchFromGlos(glosId) {
  // SETTLED, for real this time — confirmed by directly loading
  // https://seagull-erddap.glos.org/erddap/tabledap/obs_47.html (the
  // dataset's own live Data Access Form, not a search snippet or a
  // metadata page that could be stale/cached): "obs_47" — the BARE id,
  // no "_latest" suffix — is a real, currently-loaded, valid dataset
  // ("Michigan City Buoy: meterorological station"). A real obs_47.csv
  // export was pulled directly from that page and inspected — the
  // file is well-formed with real timestamped readings; it just stops
  // updating around 2026-06-18, meaning ANY URL hitting this dataset
  // (this one or the never-correct "_latest" variant) will get zero
  // rows for "time>now-1day" until GLOS's own ingestion pipeline for
  // this buoy starts receiving fresh data again. That gap is real and
  // external — not fixable from this codebase.
  //
  // For anyone reading this after a future round of doubt: this file
  // went back and forth on whether "_latest" belongs on the end of
  // this id TWICE before settling here. Both of the earlier
  // conclusions were built on search-result snippets and indirect
  // evidence, which turned out to be unreliable for this question —
  // what actually settled it was loading the dataset's own live page
  // directly and inspecting a real .csv pulled from it. If this ever
  // needs re-litigating, redo exactly that — don't trust a search
  // snippet's word for what dataset IDs currently exist on this
  // server, even one that looks authoritative.
  const url = NDBC_PROXY_BASE_URL
    ? `${NDBC_PROXY_BASE_URL}/glos?id=${glosId}`
    : `${GLOS_ERDDAP_BASE_URL}/obs_${glosId}.csv?${GLOS_FIELDS}&time>now-1day`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const errorBody = await res.text().catch(() => '(could not read response body)');
      console.warn(`[buoy:glos] obs_${glosId} responded with HTTP ${res.status} — full response from the proxy/upstream:\n${errorBody}`);
      throw new Error(`GLOS fetch failed (${res.status})`);
    }
    const text = await res.text();
    const record = parseGlosErddapCsv(text);
    if (!record) {
      console.warn(`[buoy:glos] obs_${glosId} returned a response but no usable fields — possible column-name mismatch. Raw response (first 300 chars):`, text.slice(0, 300));
    } else {
      console.log(`[buoy:glos] obs_${glosId} succeeded:`, record);
    }
    return record;
  } catch (err) {
    if (err instanceof TypeError) {
      console.warn(`[buoy:glos] obs_${glosId} fetch failed before getting a response — likely CORS or a network error:`, err.message);
    }
    throw err;
  }
}

function celsiusToFahrenheit(c) {
  return c * 9 / 5 + 32;
}
function msToMph(ms) {
  return ms * 2.23694;
}

function formatBuoyField(rawValue, convertFn, unitSuffix, decimals = 0) {
  if (!rawValue || rawValue === 'MM') return null;
  const num = parseFloat(rawValue);
  if (Number.isNaN(num)) return null;
  const converted = convertFn ? convertFn(num) : num;
  return `${converted.toFixed(decimals)}${unitSuffix}`;
}

// `source` is 'glos' or 'ndbc' (whichever actually answered for this
// card) — shown as a small label so it's visible at a glance whether
// the preferred GLOS source is actually working, rather than only
// discoverable by opening dev tools.
// Parses a record's observation time into a real Date, regardless of
// which source it came from — shared by getDataAge() (the visitor-
// facing "X min ago" label) and the GLOS-vs-NDBC freshness guard in
// initBuoyCards() (which needs a raw, comparable timestamp rather
// than a rounded human label).
function getObservedAt(record, source) {
  if (source === 'glos' && record.time) {
    // GLOS ERDDAP: `time` column is already an ISO string (UTC)
    // e.g. "2026-06-18T01:50:00Z"
    const d = new Date(record.time);
    return isNaN(d.getTime()) ? null : d;
  }
  if (record.YY && record.MM && record.DD && record.hh && record.mm) {
    // NDBC realtime2 format: separate year/month/day/hour/minute
    // columns, always UTC. Construct manually to avoid any timezone
    // ambiguity that Date.parse() of a local string could introduce.
    const d = new Date(Date.UTC(
      parseInt(record.YY, 10),
      parseInt(record.MM, 10) - 1, // months are 0-indexed in JS
      parseInt(record.DD, 10),
      parseInt(record.hh, 10),
      parseInt(record.mm, 10)
    ));
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

// How old is this data reading? Returns a short human-readable string
// ("10 min ago", "3 hours ago", "5 days ago") plus a freshness class
// for color-coding. Buoys report roughly hourly, so anything under 2
// hours is genuinely current; same-day-but-older is worth flagging;
// anything over 24 hours is the safety-critical case — old data that
// a visitor might mistakenly treat as today's conditions.
function getDataAge(record, source) {
  const observedAt = getObservedAt(record, source);
  if (!observedAt) return null;

  const ageMs = Date.now() - observedAt.getTime();
  const ageMin = Math.round(ageMs / 60_000);
  const ageHrs = Math.round(ageMs / 3_600_000);
  const ageDays = Math.round(ageMs / 86_400_000);

  let label;
  if (ageMin < 2)          label = 'just now';
  else if (ageMin < 60)    label = `${ageMin} min ago`;
  else if (ageHrs < 24)    label = `${ageHrs} hr ago`;
  else if (ageDays < 60)   label = `${ageDays} day${ageDays === 1 ? '' : 's'} ago`;
  else                     label = `${Math.round(ageDays / 30)} mo ago`;

  // freshness class drives the color in CSS — green under 2 hours
  // (within a normal hourly-update cycle), amber for same-ish day
  // but overdue, red for anything that's genuinely days or months old
  // and should NOT be relied on for today's conditions.
  let freshnessClass;
  if (ageHrs < 2)    freshnessClass = 'buoy-age--fresh';
  else if (ageHrs < 24) freshnessClass = 'buoy-age--stale';
  else               freshnessClass = 'buoy-age--old';

  return { label, freshnessClass };
}

function renderBuoyCard(card, record, source) {
  const dataEl = card.querySelector('.buoy-card-data');
  if (!dataEl) return;

  if (!record) {
    dataEl.innerHTML = `<span class="buoy-no-data">No current data &mdash; buoy may be out of season or offline</span>`;
    return;
  }

  const waterTemp = formatBuoyField(record.WTMP, celsiusToFahrenheit, '°F', 1);
  const airTemp = formatBuoyField(record.ATMP, celsiusToFahrenheit, '°F', 1);
  const windSpeed = formatBuoyField(record.WSPD, msToMph, ' mph');

  // Any field that comes back empty gets a "see site" tooltip rather
  // than a bare, unexplained dash — a station-specific note (like
  // Wilmette's thermistor chain, set via data-no-water/-wind/-air)
  // takes priority when one exists; every other missing field falls
  // back to a generic "Reading unavailable: see site" so a visitor
  // knows to check the buoy's own page rather than assuming the site
  // failed to load something. Deliberately NOT "<field>: see site"
  // (e.g. "Wind: see site") — the field name is already right there
  // via the adjacent <dt>, so repeating it was both redundant AND
  // grammatically inconsistent with the station-specific notes, which
  // read as "<reason>: see site" (a specific cause, not a field name).
  // All three messages now share the exact same "<phrase>: see site"
  // shape, whether <phrase> is a generic status or a specific reason.
  //
  // The `title` attribute alone only reaches sighted mouse users — a
  // screen reader has no reliable way to surface it on a plain,
  // non-interactive span. The nested .sr-only span carries the exact
  // same text into the accessibility tree, in the normal reading
  // flow, so a screen reader visitor gets the explanation too instead
  // of just silence or an unexplained dash character.
  function missingFieldSpan(customNote) {
    const note = customNote || 'Reading unavailable: see site';
    return `<span class="buoy-no-sensor" title="${note}">—<span class="sr-only"> (${note})</span></span>`;
  }
  const waterDisplay = waterTemp || missingFieldSpan(card.dataset.noWater);
  const airDisplay   = airTemp   || missingFieldSpan(card.dataset.noAir);
  const windDisplay  = windSpeed || missingFieldSpan(card.dataset.noWind);

  if (!waterTemp && !airTemp && !windSpeed) {
    dataEl.innerHTML = `<span class="buoy-no-data">No current data &mdash; buoy may be out of season or offline</span>`;
    return;
  }

  const sourceLabel = source === 'glos' ? 'GLOS' : 'NDBC';
  const age = getDataAge(record, source);
  const ageHtml = age
    ? `<span class="buoy-age ${age.freshnessClass}" title="Observation timestamp (UTC): ${record.time || `${record.YY}-${record.MM}-${record.DD} ${record.hh}:${record.mm}`}">${age.label}</span>`
    : '';

  dataEl.innerHTML = `
    <dl>
      <div><dt>Water</dt><dd>${waterDisplay}</dd></div>
      <div><dt>Air</dt><dd>${airDisplay}</dd></div>
      <div><dt>Wind</dt><dd>${windDisplay}</dd></div>
    </dl>
    <p class="buoy-card-source-used">via ${sourceLabel}${ageHtml ? `<span class="buoy-age-line">${ageHtml}</span>` : ''}</p>
  `;
}

function renderBuoyError(card) {
  const dataEl = card.querySelector('.buoy-card-data');
  if (!dataEl) return;
  const link = card.dataset.link;
  dataEl.innerHTML = `<span class="buoy-no-data">Live data unavailable &mdash; <a href="${link}" target="_blank" rel="noopener">check site<span class="sr-only"> (opens in new tab)</span></a></span>`;
}

async function fetchFromNdbc(station) {
  const urls = NDBC_PROXY_BASE_URL
    ? [`${NDBC_PROXY_BASE_URL}/?station=${station}`, `${NDBC_DIRECT_BASE_URL}/${station}.txt`]
    : [`${NDBC_DIRECT_BASE_URL}/${station}.txt`];

  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[buoy:ndbc] station ${station} responded with HTTP ${res.status} from ${url}`);
        throw new Error(`NDBC fetch failed (${res.status})`);
      }
      const record = parseNdbcRealtimeText(await res.text());
      if (record) return record;
      console.warn(`[buoy:ndbc] station ${station} returned a response but no usable fields from ${url} — possible format change`);
    } catch (err) {
      if (err instanceof TypeError) {
        console.warn(`[buoy:ndbc] station ${station} fetch failed before getting a response from ${url} — likely CORS or a network error:`, err.message);
      }
      // try the next URL, if any
    }
  }
  return null;
}

// Returns { record, source } rather than just a bare record, so the
// caller (and ultimately the card itself) knows whether GLOS actually
// answered or whether it silently fell back to NDBC — previously this
// was indistinguishable without opening the console.
async function initBuoyCards() {
  const cards = document.querySelectorAll('.buoy-card');
  if (cards.length === 0) return;

  // PHASE 1 — NDBC, every card, all in parallel. This is the source
  // that's actually reliable right now, so it's deliberately the only
  // thing standing between page load and a visitor seeing real
  // numbers. Awaited in full (Promise.all) before phase 2 even
  // starts, so every card already has good data on screen before any
  // GLOS request goes out — not just "usually first" as a side effect
  // of two unrelated per-card chains racing each other, but an actual
  // page-wide guarantee that phase 2 cannot start early.
  await Promise.all(
    Array.from(cards).map(async (card) => {
      const station = card.dataset.station;
      try {
        const ndbcRecord = await fetchFromNdbc(station);
        if (ndbcRecord) {
          renderBuoyCard(card, ndbcRecord, 'ndbc');
          card._ndbcRecord = ndbcRecord; // kept for the phase-2 freshness comparison below
        } else {
          renderBuoyError(card);
        }
      } catch {
        renderBuoyError(card);
      }
    })
  );

  const stamp = document.getElementById('buoyTimestamp');
  if (stamp) {
    const now = new Date();
    stamp.textContent = ` \u00b7 checked ${now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }

  // PHASE 2 — GLOS, attempted only after every card already has real
  // NDBC data on screen. GLOS's public ERDDAP feed has been
  // unreliable for an extended stretch (investigated at length; the
  // short version: GLOS's own Seagull app/API shows live data for
  // these same buoys, but that's a separate, authenticated backend —
  // confirmed by directly hitting it and getting "Missing
  // Authentication Token" — while the public ERDDAP mirror this app
  // uses has been stuck since 2026-06-18 for reasons outside this
  // codebase to fix). Running this as a clearly separate, later phase
  // — rather than racing it against NDBC per-card — reflects that
  // GLOS is currently a "nice if it works, never load-bearing"
  // enhancement, not a co-equal source. A card silently upgrades from
  // NDBC to GLOS data if and when this succeeds; nothing changes for
  // a visitor if it doesn't.
  //
  // FRESHNESS GUARD — a successful GLOS response isn't automatically
  // "the win" on its own. Real-world scenario this actually protects
  // against: GLOS's dataset loads fine but its *last ingested row* is
  // hours or days older than what NDBC already served (exactly the
  // kind of stale-but-technically-valid response the 2026-06-18
  // GLOS pipeline gap could produce). Comparing observation
  // timestamps — not just "did the request succeed" — means the card
  // always ends up showing whichever source's reading is actually
  // more current, not just whichever source is preferred by default.
  // If either timestamp is unparseable, that source doesn't block the
  // comparison (missing data shouldn't accidentally look "freshest").
  await Promise.all(
    Array.from(cards).map(async (card) => {
      const glosId = card.dataset.glosId;
      if (!glosId) return;
      try {
        const glosRecord = await fetchFromGlos(glosId);
        if (!glosRecord) return;

        const glosTime = getObservedAt(glosRecord, 'glos');
        const ndbcTime = card._ndbcRecord ? getObservedAt(card._ndbcRecord, 'ndbc') : null;
        const glosIsStale = glosTime && ndbcTime && glosTime.getTime() < ndbcTime.getTime();
        if (glosIsStale) {
          console.log(`[buoy:glos] station ${card.dataset.station}: GLOS answered but its reading (${glosTime.toISOString()}) is older than NDBC's (${ndbcTime.toISOString()}) — keeping NDBC on screen.`);
          return;
        }

        renderBuoyCard(card, glosRecord, 'glos');
      } catch {
        // GLOS failed — the card already shows NDBC data from phase
        // 1, so there's nothing further to do here.
      }
    })
  );
}

// ===================================================================
// DEV TESTING PANEL — weather category override buttons. Ships to
// production deliberately (not stripped) — CSS now defaults this to
// display:none on its own (see #devWeatherPanel in styles.css), so it
// stays genuinely hidden from normal visitors regardless of whether
// this JS runs, while still being reachable via F1 for the site owner
// on the live site. An earlier version of this comment said to strip
// this function out for production — that was tried, and it broke
// worse than leaving it in: this function was the ONLY thing that
// ever set the panel to display:none, so removing just the JS while
// leaving the CSS/HTML in place made the panel default to visible
// with no way to hide it, rather than not existing at all.
// ===================================================================
function initDevWeatherPanel() {
  const panel = document.getElementById('devWeatherPanel');
  if (!panel) return;

  // Hidden by default — press F1 to show/hide during development.
  panel.style.display = 'none';

  document.addEventListener('keydown', (e) => {
    if (e.key === 'F1') {
      e.preventDefault();
      const show = panel.style.display === 'none';
      panel.style.display = show ? 'flex' : 'none';
      // Show dead links in the resources list while the dev panel is
      // open so you can see what was removed; re-hide when closing.
      hiddenLis.forEach(li => {
        li.style.display = show ? '' : 'none';
        li.style.background = show ? 'rgba(239,68,68,0.08)' : '';
        li.style.borderRadius = show ? '4px' : '';
        li.style.paddingLeft = show ? '4px' : '';
      });
      if (show) updateDevDeadLinksPanel();
    }
  });

  const categories = [
    { id: 'sunny',         label: '☀️  Sunny' },
    { id: 'partly-cloudy', label: '⛅  Partly Cloudy' },
    { id: 'overcast',      label: '☁️  Overcast' },
    { id: 'light-rain',    label: '🌦  Light Rain' },
    { id: 'heavy-rain',    label: '🌧  Heavy Rain' },
    { id: 'thunderstorm',  label: '⛈  Thunderstorm' },
    { id: 'windy',         label: '💨  Windy' },
    { id: 'fog',           label: '🌫  Fog' },
    { id: 'winter',        label: '❄️  Winter' },
  ];

  const deadPanel = document.getElementById('devDeadLinksPanel');

  const title = document.createElement('div');
  title.className = 'dev-panel-title';
  title.textContent = '🛠 Weather Override';
  panel.insertBefore(title, deadPanel);

  let activeBtn = null;

  categories.forEach(({ id, label }) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.dataset.category = id;
    btn.addEventListener('click', () => {
      if (activeBtn) activeBtn.classList.remove('dev-active');
      btn.classList.add('dev-active');
      activeBtn = btn;
      crossfadeBgVideo(id);
      if (window.__slmoAmbientAudio) {
        window.__slmoAmbientAudio.setWeatherTrack(id);
      }
    });
    panel.insertBefore(btn, deadPanel);
  });
}

// ===================================================================
// RESOURCE LINK HEALTH CHECKER
// -------------------------------------------------------------------
// Browsers can't reliably check external URLs (CORS blocks most HEAD
// requests). This uses a Cloudflare Worker proxy that does the HEAD
// request server-side. Worker source: link-check-proxy-worker.js.
//
// Set LINK_CHECK_PROXY_URL to your deployed Worker URL to activate.
// If not configured, all links stay visible with no status dots.
//
// Status dots (solid filled circles):
//   Grey  = checking (animated)
//   Green = confirmed reachable
//   Yellow = uncertain (proxy down / timeout / inconclusive)
//   Red   = confirmed dead → <li> hidden from users
//           Dead links remain visible in the F1 dev panel.
// ===================================================================
const LINK_CHECK_PROXY_URL = 'https://southern-lake-michigan-outdoors-links.joeldport.workers.dev';
const LINK_CHECK_TIMEOUT_MS = 5000;
const LINK_CHECK_CONCURRENCY = 4;

// Tracks dead links so the dev panel can list them
const deadLinks = []; // { text, href }
const hiddenLis = []; // <li> elements hidden by the link checker

function makeDot(statusClass) {
  const dot = document.createElement('span');
  dot.className = `res-link-status ${statusClass}`;
  dot.setAttribute('aria-hidden', 'true');
  return dot;
}

// Domains where a failed link check should never hide the link —
// these are known-good government sites that may reject HEAD/GET from
// Cloudflare's network but are unambiguously legitimate. A failed
// check returns yellow (uncertain) rather than red (dead/hidden).
const NEVER_HIDE_DOMAINS = [
  'dnr.illinois.gov',
  'illinois.gov',
  'idph.state.il.us',
];

function isNeverHide(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return NEVER_HIDE_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
  } catch { return false; }
}

async function checkLink(url) {
  if (!LINK_CHECK_PROXY_URL) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LINK_CHECK_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${LINK_CHECK_PROXY_URL}?url=${encodeURIComponent(url)}`,
      { signal: controller.signal }
    );
    if (!res.ok) return null;
    const data = await res.json();
    // Worker had a network error reaching the target — uncertain, not dead.
    if (data.error && !data.ok) return null;
    // Domain is on the never-hide list — treat failures as uncertain.
    if (!data.ok && isNeverHide(url)) return null;
    return data.ok === true ? 'ok' : 'dead';
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ===================================================================
// RESOURCES ACCORDION — some categories auto-expand under the right
// conditions rather than always starting closed:
//  - Boating and Fishing (the two busiest, most-browsed categories)
//    start OPEN whenever the viewport is wide enough for the 3-column
//    desktop layout (see data-auto-expand-min-width below) — a mouse/
//    sighted visitor there sees the full list right away, exactly
//    like the old always-expanded layout.
//  - Parks, Travel, and Water Safety instead each auto-expand once
//    the viewport is TALL enough to comfortably fit them without
//    pushing everything else off-screen (see each one's own
//    data-auto-expand-min-height below) — more vertical room means
//    more categories can stay open without cost. This is purely
//    height-driven and works at any viewport width, not just at a
//    specific reference width.
// Every other category, and all of these on a short/narrow viewport,
// starts closed.
//
// The auto-open state creates a tradeoff for keyboard/screen-reader
// visitors though: without something extra, they'd have to Tab past
// every link in each open group just to reach the ones after it. So
// the FIRST time keyboard focus (not a mouse click) lands in an
// auto-expanded group, it auto-collapses — the visitor can still
// reopen it with Enter/Space if they want the list, but the default
// path skips straight past it, same as every other category. This
// only fires once per group per page load; after that it's a normal
// accordion the visitor fully controls.
//
// HOW THE min-height THRESHOLDS WERE CALCULATED — Parks, Travel, and
// Water Safety open in that order as the viewport grows taller, each
// threshold marking "enough room for every group up to and including
// this one to sit open at once." Solving for the two unknowns (a
// fixed per-group header/margin cost, and a per-link row cost) from
// the gaps between the three original thresholds and each group's
// link count gives a clean, exact fit:
//     50px per link (row height) + 78px fixed overhead per group
// i.e. threshold(group) = previous threshold + 78 + 50 * linkCount.
// Water Safety (7 links) originally landed at 2228px — 68px past a
// real 4K TV's 2160px viewport height, which is why it wasn't
// expanding there. All three thresholds below are shifted down by
// that same 68px (preserving the 50px/78px rate, not re-guessing it),
// landing Water Safety exactly on 2160px so all 5 categories are open
// on a 4K TV: Parks 1454, Travel 1732, Water Safety 2160.
//
// RECALCULATING AFTER A LINK IS ADDED/REMOVED — each group's
// data-auto-expand-link-count records the count its current
// data-auto-expand-min-height was calculated for. isLinkCountStale()
// below compares that against the real, live <li> count and warns in
// the console if they've drifted apart (e.g. a link was added to
// Parks) — since inserting a link into an earlier group changes how
// much room every LATER group needs too, a single change can mean
// re-deriving more than one threshold, which is worth doing
// deliberately rather than silently auto-patching in production.
// Using the rate above: a group gaining/losing N links shifts its own
// threshold AND every later group's threshold by N * 50px.
// ===================================================================
function initResourceAccordionBehavior() {
  const autoExpandGroups = Array.from(document.querySelectorAll('.res-group--auto-expand'));
  if (!autoExpandGroups.length) return;

  autoExpandGroups.forEach((el) => {
    const recordedCount = el.dataset.autoExpandLinkCount;
    if (recordedCount) {
      const actualCount = el.querySelectorAll('li').length;
      if (actualCount !== parseInt(recordedCount, 10)) {
        const groupName = el.querySelector('h3')?.textContent || '(unnamed group)';
        console.warn(
          `[resources accordion] "${groupName}" now has ${actualCount} links but its ` +
          `data-auto-expand-min-height was calculated for ${recordedCount}. Its threshold ` +
          `(and every later group's, by the same 50px-per-link rate) is now stale — ` +
          `see the comment above initResourceAccordionBehavior() in script.js to recalculate.`
        );
      }
    }
  });

  // Matches styles.css's own mobile/desktop breakpoint exactly (see
  // that @media rule's comment for the full reasoning) — touch-
  // primary devices always count as mobile regardless of width, so
  // an iPad in landscape still gets every group collapsed even though
  // it's wide enough to otherwise clear the per-group width/height
  // conditions below. Defined once and shared rather than duplicated
  // per group, both for efficiency and so it can't drift out of sync
  // with itself across groups.
  const mobileMql = window.matchMedia('(max-width: 1333px), (max-height: 700px), (hover: none) and (pointer: coarse)');

  autoExpandGroups.forEach((el) => {
    // Each group declares exactly one condition: a min-width (the
    // existing "wide enough for desktop" case) or a min-height (the
    // new "tall enough to spare" case).
    const minWidth = el.dataset.autoExpandMinWidth;
    const minHeight = el.dataset.autoExpandMinHeight;
    const query = minWidth ? `(min-width: ${minWidth}px)` : `(min-height: ${minHeight}px)`;
    const mql = window.matchMedia(query);

    function applyResponsiveDefault() {
      // Don't stomp on a state the visitor has already interacted
      // with this page load (either by clicking, or via the
      // keyboard auto-collapse below).
      if (el.dataset.userToggled === 'true' || el.dataset.autoCollapsed === 'true') return;
      // Mobile always wins, regardless of what the per-group width/
      // height condition would otherwise say — every group starts
      // collapsed on mobile, full stop.
      if (mobileMql.matches) {
        el.open = false;
        return;
      }
      el.open = mql.matches;
    }
    applyResponsiveDefault();
    mql.addEventListener('change', applyResponsiveDefault);
    mobileMql.addEventListener('change', applyResponsiveDefault);

    // A real click/tap on the summary is the visitor intentionally
    // choosing a state — stop treating this group as "responsive
    // default" territory from then on, same as after a keyboard
    // auto-collapse.
    const summary = el.querySelector('summary');
    if (summary) {
      summary.addEventListener('click', () => {
        el.dataset.userToggled = 'true';
      });
    }

    el.addEventListener('focusin', () => {
      if (el.dataset.autoCollapsed === 'true') return;
      if (!isKeyboardNav()) return;
      if (!el.open) return;
      el.open = false;
      el.dataset.autoCollapsed = 'true';
    });
  });
}

initResourceAccordionBehavior();

// ===================================================================
// RESOURCES ACCORDION — SCROLL INTO VIEW. When a visitor expands a
// group (any of the 5 — this isn't limited to the auto-expand ones),
// scroll its summary to the top of the resources column so the
// content that just appeared is actually visible, rather than
// expanding silently below the fold and requiring a manual scroll to
// discover. Reuses the same scroll-margin-top already set up for
// WCAG 2.4.11 (see that rule in styles.css), so this correctly clears
// both the fixed page header and the column's own sticky heading —
// no separate offset math needed here.
//
// Only fires for a visitor's own click/tap (or keyboard activation,
// which synthesizes a click same as a mouse would) — NOT for the
// responsive auto-expand/collapse logic above setting .open
// programmatically on load or resize, which should never yank the
// page around without the visitor having done anything.
// ===================================================================
function initResourceAccordionScrollIntoView() {
  const allGroups = document.querySelectorAll('.res-group');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  allGroups.forEach((el) => {
    const summary = el.querySelector('summary');
    if (!summary) return;

    let userInitiated = false;
    summary.addEventListener('click', () => {
      userInitiated = true;
    });

    el.addEventListener('toggle', () => {
      if (el.open && userInitiated) {
        summary.scrollIntoView({
          behavior: reduceMotion.matches ? 'auto' : 'smooth',
          block: 'start',
        });
      }
      userInitiated = false;
    });
  });
}

initResourceAccordionScrollIntoView();

// ===================================================================
// FONT FALLBACK — the self-hosted files in assets/fonts/ are the
// intended path (fast, same-origin), but if they ever fail to load —
// wrong deploy path, files not uploaded, whatever the cause — this
// checks for that and pulls in Google's own CDN as a backup, rather
// than silently falling through to the browser's generic system font.
//
// Deliberately NOT hardcoding Google's font-file URLs directly into
// the @font-face src list in styles.css: those are long, opaque,
// per-file hashes (e.g. .../UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2bo...)
// that Google can and does change over time, and guessing at the 7
// I couldn't independently verify would risk shipping URLs that
// silently 404 — the exact failure mode this exists to protect
// against. Falling back to Google's own CSS endpoint instead sidesteps
// that: Google resolves the correct current file on its own, so
// there's nothing here that can go stale.
//
// Cost if local fonts load fine (the expected case): zero — this
// check runs, finds everything already loaded, and does nothing
// further. Cost if they don't: same as the original Google-Fonts-CDN
// setup this replaced — worse than the ideal, but strictly better
// than missing fonts, and only reached if something's already wrong.
// ===================================================================
function initFontFallback() {
  if (!('fonts' in document)) return; // very old browser — nothing to check with

  const timeout = new Promise((resolve) => setTimeout(resolve, 3000));
  const check = Promise.all([
    document.fonts.load('400 16px Inter'),
    document.fonts.load('700 16px "Plus Jakarta Sans"'),
  ]).catch(() => {}); // a rejected load() also means "didn't load" — the check below still catches it

  Promise.race([check, timeout]).then(() => {
    const interOk = document.fonts.check('400 16px Inter');
    const jakartaOk = document.fonts.check('700 16px "Plus Jakarta Sans"');
    if (interOk && jakartaOk) return; // self-hosted fonts are working — nothing to do

    console.warn('[fonts] self-hosted font files did not load — falling back to Google Fonts CDN.');
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&family=Inter:wght@400;500;600;700&display=swap';
    document.head.appendChild(link);
  });
}
initFontFallback();

async function initLinkHealthChecker() {
  if (!LINK_CHECK_PROXY_URL) return;

  const nav = document.getElementById('resourcesNav');
  if (!nav) return;
  const items = Array.from(nav.querySelectorAll('.res-group a[href]'));

  items.forEach(a => {
    const extIcon = a.querySelector('.ext-icon');
    const dot = makeDot('res-link-status--checking');
    dot.title = 'Checking link…';
    if (extIcon) a.insertBefore(dot, extIcon);
    else a.appendChild(dot);
  });

  for (let i = 0; i < items.length; i += LINK_CHECK_CONCURRENCY) {
    const batch = items.slice(i, i + LINK_CHECK_CONCURRENCY);
    await Promise.all(batch.map(async (a) => {
      const url = a.getAttribute('href');
      const dot = a.querySelector('.res-link-status');
      const result = await checkLink(url);

      if (result === null) {
        if (dot) { dot.className = 'res-link-status res-link-status--unknown'; dot.title = 'Status unknown: could not verify this link'; }
        return;
      }
      if (result === 'ok') {
        if (dot) { dot.className = 'res-link-status res-link-status--ok'; dot.title = 'Link verified: reachable'; }
        return;
      }
      // dead — hide from visitors, record for dev panel
      if (dot) { dot.className = 'res-link-status res-link-status--dead'; dot.title = 'Link unreachable: hidden from visitors'; }

      const text = a.textContent.replace(/\(opens in new tab\)/gi, '').trim();
      deadLinks.push({ text, href: url, reason: 'unreachable' });

      setTimeout(() => {
        const li = a.closest('li');
        if (li) {
          li.style.display = 'none';
          hiddenLis.push(li);
        }
      }, 1200);
    }));
  }

  updateDevDeadLinksPanel();
}

function updateDevDeadLinksPanel() {
  const panel = document.getElementById('devDeadLinksPanel');
  if (!panel) return;
  panel.innerHTML = '';

  const title = document.createElement('div');
  title.className = 'dev-dead-title';

  if (deadLinks.length === 0) {
    title.textContent = LINK_CHECK_PROXY_URL
      ? 'No dead links found ✓'
      : 'Link checker not configured';
    title.style.color = LINK_CHECK_PROXY_URL ? '#22c55e' : '#eab308';
    panel.appendChild(title);
    return;
  }

  title.textContent = `Dead links hidden (${deadLinks.length})`;
  panel.appendChild(title);

  deadLinks.forEach(({ text, href }) => {
    const item = document.createElement('div');
    item.className = 'dev-dead-item';
    item.textContent = text.replace(/\(opens in new tab\)/gi, '').trim();
    item.title = href;
    panel.appendChild(item);
  });
}

initLinkHealthChecker();

initDevWeatherPanel();

initBuoyCards();

// ===================================================================
// PERIODIC DATA REFRESH — re-fetches weather, buoy, and beach advisory
// data on a timer, WITHOUT reloading the whole page (no flash, no
// scroll reset, no re-running header/translate setup). This is the
// gentler, more efficient alternative to a full page refresh for live
// data. Also re-applies any active beach search afterward, so typing
// a search right before the timer fires doesn't get silently cleared.
//
// Interval: every 15 minutes. NDBC buoy files update roughly hourly
// and beach advisories don't change minute-to-minute either, so
// refreshing faster wouldn't surface anything new — it would just
// spend Cloudflare Worker request budget for no benefit. On the free
// tier (100,000 requests/day, shared across both proxies — 6 worker
// calls per refresh: 1 for beach advisories + 5 for buoys; weather
// doesn't count against this budget at all, since Open-Meteo and
// BigDataCloud are called directly, not through a Worker), a 15
// minute interval comfortably supports over 150 permanently-open tabs
// before approaching the daily cap, which is generous headroom for a
// regional site like this one.
//
// Also refreshes once whenever the tab becomes visible again after
// being hidden/backgrounded, rather than continuing to poll on a
// timer while nobody's actually looking — most of a "many tabs open
// all day" scenario is backgrounded tabs, so this meaningfully cuts
// real-world request volume versus a pure timer alone.
// ===================================================================
const DATA_REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

// The weather card, buoy cards, and Illinois beach list are all
// aria-live="polite" so a screen reader announces them once real data
// replaces the initial "Loading…" placeholder — appropriate on first
// load, but this same markup was also making every silent 15-minute
// background refresh (or tab-refocus refresh) interrupt a visitor
// with an announcement for numbers that usually haven't even changed.
// Muting these regions specifically around a background refresh (and
// restoring them once it's done) keeps the initial-load announcement
// intact while stopping that recurring interruption.
function setLiveRegionsMuted(muted) {
  const ids = ['weatherContentSlmo', 'weatherContentLocal', 'ilBeachList'];
  const els = ids.map((id) => document.getElementById(id)).filter(Boolean);
  document.querySelectorAll('.buoy-card-data').forEach((el) => els.push(el));
  els.forEach((el) => {
    if (muted) {
      el.dataset.liveRestore = el.getAttribute('aria-live') || '';
      el.setAttribute('aria-live', 'off');
    } else if (el.dataset.liveRestore !== undefined) {
      el.setAttribute('aria-live', el.dataset.liveRestore || 'polite');
      delete el.dataset.liveRestore;
    }
  });
}

async function refreshLiveData() {
  setLiveRegionsMuted(true);
  try {
    await Promise.all([
      initIlBeachguard(),
      initBuoyCards(),
      initWeather(),
    ]);
  } finally {
    setLiveRegionsMuted(false);
  }

  // Re-apply any active search now that the Illinois list has been
  // rebuilt — without this, a search typed in right before the timer
  // fires would silently clear (every beach reappearing) even though
  // the search box still shows what the visitor typed.
  if (typeof window.reapplyBeachSearch === 'function') {
    window.reapplyBeachSearch();
  }
}

setInterval(refreshLiveData, DATA_REFRESH_INTERVAL_MS);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    refreshLiveData();
  }
});

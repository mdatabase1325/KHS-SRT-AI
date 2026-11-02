// KHS SRT.Ai Pro Application Logic
// State Management
const state = {
  activeTab: 'tts',
  voices: [],
  locales: [],
  selectedLocale: 'en-US',
  selectedVoice: 'en-US-JennyNeural',
  speed: 1.0,
  pitch: 0,
  volume: 1.0,
  format: '96k',
  currentAudioUrl: null,
  currentAudioBlob: null,
  currentText: '',
  isPlaying: false,
  isGenerating: false,
  favorites: new Set(),
  vocalFx: 'none',
  bgm: {
    type: 'none',
    volume: 0.2,
    autoDucking: true,
    customUrl: null
  },
  // Multi-Speaker Dialogue State
  speakers: [
    { id: 'spk_1', name: 'Alex (Host)', voice: 'en-US-JennyNeural', color: 'indigo' },
    { id: 'spk_2', name: 'Jordan (Guest)', voice: 'en-US-GuyNeural', color: 'pink' }
  ],
  dialogueLines: [
    { id: '1', speakerId: 'spk_1', text: 'Welcome back to the KHS SRT.Ai studio podcast! Today we are exploring the future of AI voices.' },
    { id: '2', speakerId: 'spk_2', text: 'Thanks for having me, Alex! It is astonishing how lifelike and expressive neural voice models have become.' },
    { id: '3', speakerId: 'spk_1', text: 'Absolutely. Content creators can now generate entire podcast episodes and audiobooks seamlessly.' }
  ],
  // Subtitle Studio State
  srtCues: [],
  srtDubbedAudioUrl: null,
  // Voice Library Filter State
  previewAudioPlayingVoice: null,
  libraryFilter: {
    gender: 'all',
    lang: 'all',
    search: '',
    onlyFavorites: false
  }
};

// Preset Scripts
const PRESETS = {
  youtube: `Welcome back to the channel! In today's video, we are diving deep into the future of Artificial Intelligence and how voice technology is transforming content creation. If you enjoy this video, make sure to hit that like button and subscribe for more weekly tech insights. Let's get right into it!`,
  commercial: `Introducing KHS SRT.Ai, the fastest and most realistic AI voice generator on the web. Convert your scripts, articles, and video subtitles into lifelike speech in over 70 languages. Try it free today and give your projects the voice they deserve.`,
  story: `Deep within the enchanted whispering forest, where the moon painted silver ripples upon the ancient lake, a little owl named Barnaby set out on his very first nighttime adventure. The stars twinkled warmly above, guiding his gentle wings through the quiet breeze.`,
  news: `Good evening. This is the top international broadcast. Global markets experienced significant momentum today as leading tech organizations announced breakthrough generative audio developments. Financial analysts predict an expansive growth trajectory across creative industries.`,
  tutorial: `To get started with KHS SRT.Ai, simply paste your script into the main text box. Next, pick your desired language and voice actor from our library of over 300 natural voices. Adjust the speed and pitch to your liking, then click Generate Voiceover.`,
  quote: `The best way to predict the future is to create it. Every great accomplishment was once considered impossible until someone dared to take the very first step.`
};

// DOM References
const audioEngine = document.getElementById('audioEngine');
const previewAudioEngine = document.getElementById('previewAudioEngine');
const bgmAudioEngine = document.getElementById('bgmAudioEngine');
const ttsText = document.getElementById('ttsText');
const localeSelect = document.getElementById('localeSelect');
const voiceSelect = document.getElementById('voiceSelect');
const speedSlider = document.getElementById('speedSlider');
const speedValue = document.getElementById('speedValue');
const pitchSlider = document.getElementById('pitchSlider');
const pitchValue = document.getElementById('pitchValue');
const generateBtn = document.getElementById('generateBtn');
const generateBtnText = document.getElementById('generateBtnText');
const playPauseBtn = document.getElementById('playPauseBtn');
const playPauseIcon = document.getElementById('playPauseIcon');
const timelineScrubber = document.getElementById('timelineScrubber');
const currentTimeEl = document.getElementById('currentTime');
const totalDurationEl = document.getElementById('totalDuration');
const waveformCanvas = document.getElementById('waveformCanvas');
const waveformPlaceholder = document.getElementById('waveformPlaceholder');
const toastContainer = document.getElementById('toastContainer');

// Web Audio API Context & Nodes for Waveform & Vocal FX
let audioCtx = null;
let analyser = null;
let sourceNode = null;
let fxFilterNode = null;
let fxGainNode = null;
let convolverNode = null;
let animationFrameId = null;

// IndexedDB Helper
const DB_NAME = 'KHSSrtAiDB';
const DB_VERSION = 1;
const STORE_NAME = 'history';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbSaveHistory(item) {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(item);
  } catch (err) {
    console.warn('IndexedDB save failed:', err);
  }
}

async function dbGetAllHistory() {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, 'readonly');
    return new Promise((resolve) => {
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result.sort((a, b) => b.timestampMs - a.timestampMs));
      req.onerror = () => resolve([]);
    });
  } catch (err) {
    return [];
  }
}

async function dbDeleteItem(id) {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
  } catch (err) {
    console.warn('IndexedDB delete error:', err);
  }
}

async function dbClearAll() {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
  } catch (err) {
    console.warn('IndexedDB clear error:', err);
  }
}

// Initialize on Load
window.addEventListener('DOMContentLoaded', async () => {
  loadFavoritesFromStorage();
  await fetchVoices();
  setupAudioEvents();
  setupCanvasWaveform();
  setupKeyboardShortcuts();
  renderDialogueStudio();
  updateTextStats();
  updateHistoryBadge();

  if (!ttsText.value) {
    ttsText.value = PRESETS.youtube;
    updateTextStats();
  }
});

// Load Favorites from LocalStorage
function loadFavoritesFromStorage() {
  try {
    const saved = localStorage.getItem('khs_srtai_favorites') || localStorage.getItem('voicetool_favorites');
    if (saved) {
      state.favorites = new Set(JSON.parse(saved));
      document.getElementById('favCountBadge').textContent = state.favorites.size;
    }
  } catch (e) {
    state.favorites = new Set();
  }
}

function saveFavoritesToStorage() {
  try {
    localStorage.setItem('khs_srtai_favorites', JSON.stringify([...state.favorites]));
    document.getElementById('favCountBadge').textContent = state.favorites.size;
  } catch (e) {}
}

function toggleCurrentVoiceFavorite() {
  if (state.favorites.has(state.selectedVoice)) {
    state.favorites.delete(state.selectedVoice);
    showToast('Removed from favorites', 'info');
  } else {
    state.favorites.add(state.selectedVoice);
    showToast('Saved to favorite voices ⭐', 'success');
  }
  saveFavoritesToStorage();
  updateFavStarIcon();
  if (state.activeTab === 'library') renderVoiceLibrary();
}

function updateFavStarIcon() {
  const icon = document.getElementById('favStarIcon');
  if (!icon) return;
  if (state.favorites.has(state.selectedVoice)) {
    icon.classList.add('text-amber-400', 'fill-amber-400');
  } else {
    icon.classList.remove('text-amber-400', 'fill-amber-400');
  }
}

// Navigation Tabs
function switchTab(tabId) {
  state.activeTab = tabId;
  const tabs = ['tts', 'dialogue', 'srt', 'library', 'history'];
  tabs.forEach(t => {
    const view = document.getElementById(`view-${t}`);
    const btn = document.getElementById(`tab-btn-${t}`);
    const mBtn = document.getElementById(`tab-m-${t}`);

    if (view) {
      if (t === tabId) {
        view.classList.remove('hidden');
      } else {
        view.classList.add('hidden');
      }
    }

    // Desktop Tab Buttons
    if (btn) {
      if (t === tabId) {
        btn.classList.add('active');
        btn.classList.remove('text-slate-400');
      } else {
        btn.classList.remove('active');
        btn.classList.add('text-slate-400');
      }
    }

    // Mobile Bottom App Bar Buttons
    if (mBtn) {
      if (t === tabId) {
        mBtn.className = 'tab-m-item flex flex-col items-center gap-1 py-1 px-3 rounded-xl text-indigo-400 font-semibold bg-indigo-500/10 transition active:scale-95';
      } else {
        mBtn.className = 'tab-m-item flex flex-col items-center gap-1 py-1 px-3 rounded-xl text-slate-400 hover:text-slate-200 transition active:scale-95';
      }
    }
  });

  if (tabId === 'library') {
    renderVoiceLibrary();
  } else if (tabId === 'history') {
    renderHistory();
  } else if (tabId === 'dialogue') {
    renderDialogueStudio();
  }
  lucide.createIcons();
}

// Fetch Voices
async function fetchVoices() {
  try {
    const res = await fetch('/api/voices');
    if (!res.ok) throw new Error('Failed to load voice catalog');
    const data = await res.json();
    state.voices = data.voices || [];
    state.locales = data.locales || [];

    document.getElementById('libVoiceTotalCount').textContent = state.voices.length;
    document.getElementById('headerVoiceCountBadge').textContent = `${state.voices.length}`;

    populateLocaleDropdown();
    populateVoiceDropdown();
    populateSrtVoiceDropdown();
    updateFavStarIcon();
  } catch (err) {
    console.error('Error fetching voices:', err);
    showToast('Failed to load voice directory', 'error');
  }
}

function populateLocaleDropdown() {
  localeSelect.innerHTML = '';
  state.locales.forEach(loc => {
    const opt = document.createElement('option');
    opt.value = loc.locale;
    opt.textContent = `${loc.flag} ${loc.name} (${loc.count})`;
    if (loc.locale === state.selectedLocale) opt.selected = true;
    localeSelect.appendChild(opt);
  });
  updateSelectedLocaleFlag();
}

function populateVoiceDropdown() {
  const matchingVoices = state.voices.filter(v => v.locale === state.selectedLocale);
  voiceSelect.innerHTML = '';

  if (matchingVoices.length === 0) {
    const opt = document.createElement('option');
    opt.textContent = 'No voices found';
    voiceSelect.appendChild(opt);
    return;
  }

  matchingVoices.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.shortName;
    const isFav = state.favorites.has(v.shortName) ? '⭐ ' : '';
    opt.textContent = `${isFav}${v.name} (${v.gender})`;
    if (v.shortName === state.selectedVoice) opt.selected = true;
    voiceSelect.appendChild(opt);
  });

  if (!matchingVoices.some(v => v.shortName === state.selectedVoice)) {
    state.selectedVoice = matchingVoices[0].shortName;
    voiceSelect.value = state.selectedVoice;
  }

  updateSelectedVoiceCard();
}

function populateSrtVoiceDropdown() {
  const srtSelect = document.getElementById('srtVoiceSelect');
  if (!srtSelect) return;
  srtSelect.innerHTML = '';
  state.voices.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.shortName;
    opt.textContent = `${v.flag} ${v.name} - ${v.localeName} (${v.gender})`;
    if (v.shortName === state.selectedVoice) opt.selected = true;
    srtSelect.appendChild(opt);
  });
}

function updateSelectedLocaleFlag() {
  const currentLoc = state.locales.find(l => l.locale === state.selectedLocale);
  const flagEl = document.getElementById('selectedLocaleFlag');
  if (flagEl && currentLoc) flagEl.textContent = currentLoc.flag;
}

function updateSelectedVoiceCard() {
  const voice = state.voices.find(v => v.shortName === state.selectedVoice);
  if (!voice) return;

  const avatar = document.getElementById('voiceAvatar');
  const genderBadge = document.getElementById('voiceGenderBadge');
  const personality = document.getElementById('voicePersonality');

  if (avatar) avatar.textContent = voice.name.charAt(0);
  if (genderBadge) {
    genderBadge.textContent = voice.gender;
    genderBadge.className = voice.gender.toLowerCase() === 'female'
      ? 'text-[11px] px-2 py-0.5 rounded-full bg-pink-500/10 text-pink-400 font-medium border border-pink-500/20'
      : 'text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 font-medium border border-indigo-500/20';
  }
  if (personality) {
    personality.textContent = voice.personalities && voice.personalities.length > 0
      ? voice.personalities.join(', ')
      : `${voice.localeName} • Neural Voice`;
  }
  updateFavStarIcon();
}

function onLocaleChange(locale) {
  state.selectedLocale = locale;
  updateSelectedLocaleFlag();
  populateVoiceDropdown();
}

function onVoiceChange(voiceShortName) {
  state.selectedVoice = voiceShortName;
  updateSelectedVoiceCard();
}

// Sliders & Tuning
function updateSpeedDisplay(val) {
  state.speed = parseFloat(val);
  speedValue.textContent = `${state.speed.toFixed(2)}x`;
  updateTextStats();
}
function resetSpeed() {
  speedSlider.value = 1.0;
  updateSpeedDisplay(1.0);
}

function updatePitchDisplay(val) {
  state.pitch = parseInt(val, 10);
  pitchValue.textContent = `${state.pitch >= 0 ? '+' : ''}${state.pitch}Hz`;
}
function resetPitch() {
  pitchSlider.value = 0;
  updatePitchDisplay(0);
}

function setOutputFormat(fmt) {
  state.format = fmt;
  ['96k', '48k', 'wav'].forEach(f => {
    const btn = document.getElementById(`format-${f}`);
    if (!btn) return;
    if (f === fmt) {
      btn.className = 'px-2 py-0.5 rounded font-medium bg-indigo-600 text-white transition';
    } else {
      btn.className = 'px-2 py-0.5 rounded font-medium text-slate-400 hover:text-white transition';
    }
  });
  showToast(`Format set to ${fmt.toUpperCase()}`, 'info');
}

function applyPersonaPreset(type) {
  if (type === 'natural') {
    speedSlider.value = 1.0;
    pitchSlider.value = 0;
  } else if (type === 'story') {
    speedSlider.value = 0.90;
    pitchSlider.value = -4;
  } else if (type === 'deep') {
    speedSlider.value = 0.95;
    pitchSlider.value = -22;
  } else if (type === 'fast') {
    speedSlider.value = 1.25;
    pitchSlider.value = 4;
  }
  updateSpeedDisplay(speedSlider.value);
  updatePitchDisplay(pitchSlider.value);
  showToast(`Applied ${type} preset`, 'info');
}

// Text Editor Tools & Cleanup
function updateTextStats() {
  const text = ttsText.value || '';
  state.currentText = text;
  document.getElementById('charCount').textContent = `${text.length.toLocaleString()} / 25,000`;

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  document.getElementById('wordCount').textContent = words.toLocaleString();

  const effectiveWpm = 150 * state.speed;
  const seconds = Math.round((words / effectiveWpm) * 60);
  document.getElementById('estDuration').textContent = formatTime(seconds);
}

function clearText() {
  ttsText.value = '';
  updateTextStats();
  ttsText.focus();
}

async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    ttsText.value = text;
    updateTextStats();
    showToast('Pasted text from clipboard', 'info');
  } catch (err) {
    showToast('Paste directly into the text box', 'error');
  }
}

function loadPresetScript(key) {
  if (PRESETS[key]) {
    ttsText.value = PRESETS[key];
    updateTextStats();
    showToast(`Loaded ${key} sample script`, 'info');
  }
  document.getElementById('presetSelect').value = '';
}

function togglePauseMenu() {
  const el = document.getElementById('pauseDropdown');
  el.classList.toggle('hidden');
}

document.addEventListener('click', (e) => {
  const pauseDropdown = document.getElementById('pauseDropdown');
  if (pauseDropdown && !pauseDropdown.contains(e.target) && !e.target.closest('button[onclick="togglePauseMenu()"]')) {
    pauseDropdown.classList.add('hidden');
  }
});

function insertPause(duration) {
  insertAtCursor(` [pause ${duration}] `);
  togglePauseMenu();
}

function insertSpellTag() {
  insertAtCursor(` [spell]NASA[/spell] `);
  togglePauseMenu();
}

function insertAtCursor(textToInsert) {
  const start = ttsText.selectionStart;
  const end = ttsText.selectionEnd;
  const val = ttsText.value;
  ttsText.value = val.substring(0, start) + textToInsert + val.substring(end);
  ttsText.selectionStart = ttsText.selectionEnd = start + textToInsert.length;
  updateTextStats();
  ttsText.focus();
}

function cleanupText(type) {
  let val = ttsText.value;
  if (type === 'linebreaks') {
    val = val.replace(/\r?\n+/g, ' ');
  } else if (type === 'spaces') {
    val = val.replace(/[ \t]+/g, ' ').trim();
  } else if (type === 'quotes') {
    val = val.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
  } else if (type === 'uppercase') {
    val = val.toLowerCase().replace(/(^\s*\w|[.!?]\s*\w)/g, c => c.toUpperCase());
  }
  ttsText.value = val;
  updateTextStats();
  showToast(`Cleaned text: ${type}`, 'info');
}

function handleTextFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    ttsText.value = e.target.result;
    updateTextStats();
    showToast(`Loaded ${file.name}`, 'success');
  };
  reader.readAsText(file);
}

// Audition / Preview Voice
async function previewSelectedVoice(voiceId = null) {
  const targetVoice = voiceId || state.selectedVoice;
  const previewText = document.getElementById('previewBtnText');

  if (state.previewAudioPlayingVoice === targetVoice && !previewAudioEngine.paused) {
    previewAudioEngine.pause();
    state.previewAudioPlayingVoice = null;
    if (previewText) previewText.textContent = 'Sample';
    return;
  }

  try {
    if (previewText) previewText.textContent = 'Playing...';
    previewAudioEngine.src = `/api/preview?voice=${encodeURIComponent(targetVoice)}`;
    await previewAudioEngine.play();
    state.previewAudioPlayingVoice = targetVoice;

    previewAudioEngine.onended = () => {
      state.previewAudioPlayingVoice = null;
      if (previewText) previewText.textContent = 'Sample';
      const allSampleBtns = document.querySelectorAll('.lib-sample-btn');
      allSampleBtns.forEach(b => {
        b.innerHTML = '<i data-lucide="volume-2" class="w-3.5 h-3.5"></i> Play';
      });
      lucide.createIcons();
    };
  } catch (err) {
    console.error('Preview error:', err);
    showToast('Failed to play voice audition sample', 'error');
    if (previewText) previewText.textContent = 'Sample';
  }
}

// Generate Speech
async function generateSpeech() {
  const text = ttsText.value.trim();
  if (!text) {
    showToast('Please enter or paste some text first!', 'warning');
    ttsText.focus();
    return;
  }

  if (state.isGenerating) return;
  state.isGenerating = true;

  generateBtn.disabled = true;
  generateBtnText.textContent = 'Synthesizing Neural Speech...';
  const icon = document.getElementById('generateIcon');
  if (icon) icon.setAttribute('data-lucide', 'loader');
  lucide.createIcons();

  try {
    const startTime = Date.now();
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: text,
        voice: state.selectedVoice,
        rate: state.speed,
        pitch: state.pitch,
        volume: 100,
        format: state.format === 'wav' ? '96k' : state.format
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: 'Speech synthesis failed' }));
      throw new Error(errData.error || errData.details || 'Server error');
    }

    const audioBlob = await res.blob();
    const audioUrl = URL.createObjectURL(audioBlob);

    state.currentAudioBlob = audioBlob;
    state.currentAudioUrl = audioUrl;

    audioEngine.src = audioUrl;
    playPauseBtn.disabled = false;
    timelineScrubber.disabled = false;
    waveformPlaceholder.classList.add('hidden');

    const voiceMeta = state.voices.find(v => v.shortName === state.selectedVoice);
    const voiceDisplayName = voiceMeta ? voiceMeta.name : state.selectedVoice;
    document.getElementById('playerVoiceTitle').textContent = `Voiceover Ready (${voiceDisplayName})`;
    document.getElementById('playerSubtitle').textContent = `Synthesized in ${((Date.now() - startTime) / 1000).toFixed(1)}s • ${(audioBlob.size / 1024).toFixed(0)} KB MP3`;

    await playAudio();

    // Save to IndexedDB
    const histItem = {
      id: Date.now().toString(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      date: new Date().toLocaleDateString(),
      timestampMs: Date.now(),
      voiceName: voiceDisplayName,
      voiceShortName: state.selectedVoice,
      text: text.slice(0, 160) + (text.length > 160 ? '...' : ''),
      fullText: text,
      blob: audioBlob,
      sizeKb: (audioBlob.size / 1024).toFixed(0)
    };
    await dbSaveHistory(histItem);
    updateHistoryBadge();

    showToast('Speech generated successfully!', 'success');
  } catch (err) {
    console.error('Generation error:', err);
    showToast(`Generation failed: ${err.message}`, 'error');
  } finally {
    state.isGenerating = false;
    generateBtn.disabled = false;
    generateBtnText.textContent = 'Generate Voiceover';
    if (icon) icon.setAttribute('data-lucide', 'sparkles');
    lucide.createIcons();
  }
}

// Master Audio Player Controls
function setupAudioEvents() {
  audioEngine.addEventListener('timeupdate', () => {
    if (!audioEngine.duration) return;
    const current = audioEngine.currentTime;
    const duration = audioEngine.duration;
    currentTimeEl.textContent = formatTime(current);
    totalDurationEl.textContent = formatTime(duration);
    timelineScrubber.value = (current / duration) * 100;

    if (state.activeTab === 'srt' && state.srtCues.length > 0) {
      highlightActiveSrtCue(current);
    }
  });

  audioEngine.addEventListener('loadedmetadata', () => {
    totalDurationEl.textContent = formatTime(audioEngine.duration);
  });

  audioEngine.addEventListener('ended', () => {
    state.isPlaying = false;
    playPauseIcon.setAttribute('data-lucide', 'play');
    lucide.createIcons();
    // Stop BGM if playing
    if (state.bgm.type !== 'none' && !bgmAudioEngine.paused) {
      bgmAudioEngine.pause();
    }
  });

  audioEngine.addEventListener('play', () => {
    state.isPlaying = true;
    playPauseIcon.setAttribute('data-lucide', 'pause');
    lucide.createIcons();
    startWaveformAnimation();
    // Handle BGM playback & Auto-Ducking
    if (state.bgm.type !== 'none') {
      bgmAudioEngine.volume = state.bgm.autoDucking ? state.bgm.volume * 0.35 : state.bgm.volume;
      bgmAudioEngine.play().catch(() => {});
    }
  });

  audioEngine.addEventListener('pause', () => {
    state.isPlaying = false;
    playPauseIcon.setAttribute('data-lucide', 'play');
    lucide.createIcons();
    if (state.bgm.type !== 'none' && !bgmAudioEngine.paused) {
      bgmAudioEngine.volume = state.bgm.volume;
    }
  });
}

async function playAudio() {
  try {
    initAudioContext();
    if (audioCtx && audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
    await audioEngine.play();
  } catch (err) {
    console.warn('Auto-play blocked or error:', err);
  }
}

function togglePlayPause() {
  if (!state.currentAudioUrl) return;
  if (audioEngine.paused) {
    playAudio();
  } else {
    audioEngine.pause();
  }
}

function seekAudio(percent) {
  if (!audioEngine.duration) return;
  audioEngine.currentTime = (percent / 100) * audioEngine.duration;
}

function setPlaybackSpeed(rate) {
  audioEngine.playbackRate = rate;
  showToast(`Playback speed: ${rate}x`, 'info');
}

function changePlayerVolume(val) {
  audioEngine.volume = parseFloat(val);
  const icon = document.getElementById('volumeIcon');
  if (audioEngine.volume === 0) {
    icon.setAttribute('data-lucide', 'volume-x');
  } else if (audioEngine.volume < 0.5) {
    icon.setAttribute('data-lucide', 'volume-1');
  } else {
    icon.setAttribute('data-lucide', 'volume-2');
  }
  lucide.createIcons();
}

function toggleMute() {
  if (audioEngine.volume > 0) {
    audioEngine.volume = 0;
    document.getElementById('playerVolume').value = 0;
  } else {
    audioEngine.volume = 1;
    document.getElementById('playerVolume').value = 1;
  }
  changePlayerVolume(audioEngine.volume);
}

// Download Audio (MP3 or WAV)
async function downloadCurrentAudio(format = 'mp3') {
  if (!state.currentAudioBlob && !state.currentAudioUrl) {
    showToast('No audio generated yet.', 'warning');
    return;
  }

  const cleanVoice = state.selectedVoice.split('-').pop() || 'voice';
  const timestamp = new Date().toISOString().slice(0, 10);

  if (format === 'wav') {
    showToast('Converting to lossless WAV...', 'info');
    try {
      initAudioContext();
      const arrayBuf = await state.currentAudioBlob.arrayBuffer();
      const audioBuf = await audioCtx.decodeAudioData(arrayBuf);
      const wavBlob = audioBufferToWavBlob(audioBuf);
      const wavUrl = URL.createObjectURL(wavBlob);
      const filename = `khs-srt-ai-${cleanVoice}-${timestamp}.wav`;
      downloadBlobUrl(wavUrl, filename);
      showToast(`Downloaded ${filename}`, 'success');
    } catch (e) {
      showToast(`WAV export failed: ${e.message}`, 'error');
    }
  } else {
    const filename = `khs-srt-ai-${cleanVoice}-${timestamp}.mp3`;
    downloadBlobUrl(state.currentAudioUrl, filename);
    showToast(`Downloaded ${filename}`, 'success');
  }
}

function downloadBlobUrl(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ========================================================
// VOCAL FX & BGM PIPELINE
// ========================================================

function toggleFxDrawer() {
  const drawer = document.getElementById('fxDrawer');
  drawer.classList.toggle('hidden');
}

function initAudioContext() {
  if (!audioCtx) {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContextClass();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;

      sourceNode = audioCtx.createMediaElementSource(audioEngine);

      // Create FX Filter Node
      fxFilterNode = audioCtx.createBiquadFilter();
      fxFilterNode.type = 'allpass';

      // Create Convolver Node for Reverb
      convolverNode = audioCtx.createConvolver();
      createReverbImpulse(convolverNode, 2.0, 2.0);

      fxGainNode = audioCtx.createGain();
      fxGainNode.gain.value = 1.0;

      // Connect pipeline: source -> filter -> analyser -> destination
      sourceNode.connect(fxFilterNode);
      fxFilterNode.connect(analyser);
      analyser.connect(audioCtx.destination);
    } catch (e) {
      console.warn('Web Audio API initialized in fallback mode');
    }
  }
}

function createReverbImpulse(convolver, duration = 2.0, decay = 2.0) {
  if (!audioCtx) return;
  const sampleRate = audioCtx.sampleRate;
  const length = sampleRate * duration;
  const impulse = audioCtx.createBuffer(2, length, sampleRate);
  const left = impulse.getChannelData(0);
  const right = impulse.getChannelData(1);
  for (let i = 0; i < length; i++) {
    const n = i / length;
    left[i] = (Math.random() * 2 - 1) * Math.pow(1 - n, decay);
    right[i] = (Math.random() * 2 - 1) * Math.pow(1 - n, decay);
  }
  convolver.buffer = impulse;
}

function setVocalFx(type) {
  state.vocalFx = type;
  ['none', 'podcast', 'telephone', 'radio', 'reverb', 'megaphone'].forEach(t => {
    const btn = document.getElementById(`fx-${t}`);
    if (!btn) return;
    if (t === type) {
      btn.className = 'py-1.5 px-2 rounded-lg bg-indigo-600 text-white font-medium text-center';
    } else {
      btn.className = 'py-1.5 px-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 text-center';
    }
  });

  if (!audioCtx || !fxFilterNode) return;

  if (type === 'none') {
    fxFilterNode.type = 'allpass';
  } else if (type === 'telephone') {
    fxFilterNode.type = 'bandpass';
    fxFilterNode.frequency.value = 1800;
    fxFilterNode.Q.value = 2.5;
  } else if (type === 'radio') {
    fxFilterNode.type = 'bandpass';
    fxFilterNode.frequency.value = 2200;
    fxFilterNode.Q.value = 1.8;
  } else if (type === 'podcast') {
    fxFilterNode.type = 'lowshelf';
    fxFilterNode.frequency.value = 200;
    fxFilterNode.gain.value = 4.0;
  } else if (type === 'megaphone') {
    fxFilterNode.type = 'highpass';
    fxFilterNode.frequency.value = 900;
    fxFilterNode.Q.value = 3.0;
  } else if (type === 'reverb') {
    fxFilterNode.type = 'allpass';
  }

  showToast(`Vocal effect set: ${type}`, 'info');
}

// BGM Controls
function onBgmSelect(val) {
  state.bgm.type = val;
  if (val === 'custom') {
    document.getElementById('customBgmInput').click();
    return;
  }
  if (val === 'none') {
    bgmAudioEngine.pause();
    bgmAudioEngine.src = '';
    return;
  }
  // Generate procedural ambient audio loop
  const bgmBlob = generateProceduralBgm(val);
  bgmAudioEngine.src = URL.createObjectURL(bgmBlob);
  showToast(`Loaded ${val} ambient music`, 'info');
}

function changeBgmVolume(val) {
  state.bgm.volume = parseFloat(val);
  document.getElementById('bgmVolumeText').textContent = `${Math.round(state.bgm.volume * 100)}%`;
  bgmAudioEngine.volume = state.bgm.volume;
}

function handleCustomBgmUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  state.bgm.customUrl = url;
  bgmAudioEngine.src = url;
  showToast(`Loaded BGM: ${file.name}`, 'success');
}

// Procedural Ambient Music Generator (Produces soothing WAV chords)
function generateProceduralBgm(style) {
  const sampleRate = 22050;
  const seconds = 8;
  const totalSamples = sampleRate * seconds;
  const buffer = new Float32Array(totalSamples);

  const chords = style === 'lofi' 
    ? [220, 261.63, 329.63, 392.00] // Am7
    : [261.63, 329.63, 392.00, 493.88]; // Cmaj7

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;
    chords.forEach((freq, idx) => {
      const envelope = 0.5 * (1 + Math.sin(t * 0.8 + idx));
      sample += Math.sin(2 * Math.PI * freq * t) * 0.15 * envelope;
    });
    buffer[i] = sample;
  }

  // Convert Float32Array to 16-bit PCM WAV Blob
  return floatArrayToWavBlob(buffer, sampleRate);
}

function floatArrayToWavBlob(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  function writeString(offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }
  return new Blob([view], { type: 'audio/wav' });
}

// Waveform Canvas Visualizer
function setupCanvasWaveform() {
  const ctx = waveformCanvas.getContext('2d');
  waveformCanvas.width = waveformCanvas.offsetWidth * window.devicePixelRatio || 800;
  waveformCanvas.height = 80 * window.devicePixelRatio;
  ctx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);
  drawIdleWaveform(ctx, waveformCanvas.width, waveformCanvas.height);
}

function drawIdleWaveform(ctx, width, height) {
  const bars = 64;
  const barWidth = width / bars;
  ctx.fillStyle = 'rgba(99, 102, 241, 0.2)';
  for (let i = 0; i < bars; i++) {
    const barHeight = Math.sin((i / bars) * Math.PI) * 20 + 8;
    ctx.fillRect(i * barWidth, (height - barHeight) / 2, barWidth - 2, barHeight);
  }
}

function startWaveformAnimation() {
  if (!analyser) return;
  const ctx = waveformCanvas.getContext('2d');
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  function renderFrame() {
    if (!state.isPlaying) {
      cancelAnimationFrame(animationFrameId);
      return;
    }
    animationFrameId = requestAnimationFrame(renderFrame);

    analyser.getByteFrequencyData(dataArray);
    const width = waveformCanvas.width;
    const height = waveformCanvas.height;

    ctx.clearRect(0, 0, width, height);

    const bars = 48;
    const barWidth = width / bars;

    for (let i = 0; i < bars; i++) {
      const val = dataArray[i] || 0;
      const barHeight = Math.max(6, (val / 255) * height * 0.9);

      const grad = ctx.createLinearGradient(0, height - barHeight, 0, height);
      grad.addColorStop(0, '#ec4899');
      grad.addColorStop(0.5, '#818cf8');
      grad.addColorStop(1, '#4f46e5');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(i * barWidth + 1, (height - barHeight) / 2, barWidth - 3, barHeight, [3]);
      ctx.fill();
    }
  }
  renderFrame();
}

// ========================================================
// TAB 2: MULTI-SPEAKER / DIALOGUE STUDIO
// ========================================================

function renderDialogueStudio() {
  const speakersContainer = document.getElementById('speakersList');
  const linesContainer = document.getElementById('dialogueLinesContainer');
  if (!speakersContainer || !linesContainer) return;

  // Render Speakers
  speakersContainer.innerHTML = '';
  state.speakers.forEach((spk, idx) => {
    const div = document.createElement('div');
    div.className = 'glass-card p-3 flex items-center justify-between gap-2 text-xs';
    div.innerHTML = `
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-8 h-8 rounded-full bg-${spk.color}-600/30 text-${spk.color}-400 font-bold flex items-center justify-center shrink-0">
          ${spk.name.charAt(0)}
        </div>
        <div class="min-w-0">
          <input type="text" value="${escapeHtml(spk.name)}" onchange="updateSpeakerName('${spk.id}', this.value)" class="bg-transparent font-semibold text-white focus:outline-none w-28 truncate">
          <p class="text-[10px] text-slate-400 truncate">${spk.voice.split('-').pop()}</p>
        </div>
      </div>
      <select onchange="updateSpeakerVoice('${spk.id}', this.value)" class="bg-slate-900 border border-white/10 rounded px-2 py-1 text-slate-200 text-[11px] max-w-[130px]">
        ${state.voices.slice(0, 40).map(v => `<option value="${v.shortName}" ${v.shortName === spk.voice ? 'selected' : ''}>${v.name} (${v.locale.split('-')[0]})</option>`).join('')}
      </select>
    `;
    speakersContainer.appendChild(div);
  });

  // Render Dialogue Script Lines
  linesContainer.innerHTML = '';
  document.getElementById('dialogueCount').textContent = state.dialogueLines.length;

  state.dialogueLines.forEach((line, index) => {
    const spk = state.speakers.find(s => s.id === line.speakerId) || state.speakers[0];
    const div = document.createElement('div');
    div.className = 'glass-card p-3 flex items-center gap-3 text-xs';
    div.innerHTML = `
      <span class="font-mono text-slate-500 w-4">${index + 1}</span>
      <select onchange="updateLineSpeaker(${index}, this.value)" class="bg-slate-900 border border-white/10 rounded-lg px-2 py-1 text-xs font-semibold text-white cursor-pointer shrink-0">
        ${state.speakers.map(s => `<option value="${s.id}" ${s.id === line.speakerId ? 'selected' : ''}>${s.name}</option>`).join('')}
      </select>
      <input type="text" value="${escapeHtml(line.text)}" onchange="updateLineText(${index}, this.value)" class="flex-1 bg-slate-950/60 border border-white/10 rounded-lg px-3 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500">
      <button onclick="playSingleDialogueLine(${index})" class="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white" title="Preview Line">
        <i data-lucide="volume-2" class="w-3.5 h-3.5"></i>
      </button>
      <button onclick="deleteDialogueLine(${index})" class="p-1.5 text-slate-500 hover:text-rose-400" title="Delete Line">
        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
      </button>
    `;
    linesContainer.appendChild(div);
  });

  lucide.createIcons();
}

function updateSpeakerName(id, newName) {
  const spk = state.speakers.find(s => s.id === id);
  if (spk) spk.name = newName;
  renderDialogueStudio();
}

function updateSpeakerVoice(id, newVoice) {
  const spk = state.speakers.find(s => s.id === id);
  if (spk) spk.voice = newVoice;
  renderDialogueStudio();
}

function addSpeakerPrompt() {
  const name = prompt('Enter Speaker Name (e.g. Narrator, Alice):');
  if (!name) return;
  const id = `spk_${Date.now()}`;
  const randomVoice = state.voices[Math.floor(Math.random() * 20)].shortName;
  state.speakers.push({ id, name, voice: randomVoice, color: 'indigo' });
  renderDialogueStudio();
  showToast(`Added speaker "${name}"`, 'success');
}

function addDialogueLine() {
  const lastSpeaker = state.dialogueLines.length > 0 
    ? state.dialogueLines[state.dialogueLines.length - 1].speakerId 
    : state.speakers[0].id;
  // Alternate speaker
  const nextSpeaker = state.speakers.find(s => s.id !== lastSpeaker) || state.speakers[0];
  state.dialogueLines.push({
    id: Date.now().toString(),
    speakerId: nextSpeaker.id,
    text: ''
  });
  renderDialogueStudio();
}

function updateLineSpeaker(index, speakerId) {
  if (state.dialogueLines[index]) {
    state.dialogueLines[index].speakerId = speakerId;
  }
}

function updateLineText(index, text) {
  if (state.dialogueLines[index]) {
    state.dialogueLines[index].text = text;
  }
}

function deleteDialogueLine(index) {
  state.dialogueLines.splice(index, 1);
  renderDialogueStudio();
}

function loadSampleDialogue() {
  state.speakers = [
    { id: 'spk_1', name: 'Alex (Host)', voice: 'en-US-JennyNeural', color: 'indigo' },
    { id: 'spk_2', name: 'Jordan (Guest)', voice: 'en-US-GuyNeural', color: 'pink' }
  ];
  state.dialogueLines = [
    { id: '1', speakerId: 'spk_1', text: 'Welcome back everyone. Today we are joined by Jordan, an AI audio researcher.' },
    { id: '2', speakerId: 'spk_2', text: 'Thank you Alex! It is wonderful to be here and showcase multi-voice speech synthesis.' },
    { id: '3', speakerId: 'spk_1', text: 'Could you explain why having multiple voices in one script makes content so compelling?' },
    { id: '4', speakerId: 'spk_2', text: 'Certainly. Conversational pacing and contrasting voice tones keep listeners engaged for long podcasts and stories.' }
  ];
  renderDialogueStudio();
  showToast('Loaded sample podcast dialogue', 'info');
}

function clearDialogue() {
  state.dialogueLines = [];
  renderDialogueStudio();
}

async function playSingleDialogueLine(index) {
  const line = state.dialogueLines[index];
  if (!line || !line.text.trim()) return;
  const spk = state.speakers.find(s => s.id === line.speakerId) || state.speakers[0];

  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: line.text,
        voice: spk.voice,
        rate: 1.0,
        pitch: 0
      })
    });
    const blob = await res.blob();
    previewAudioEngine.src = URL.createObjectURL(blob);
    previewAudioEngine.play();
  } catch (e) {
    showToast('Failed to preview dialogue line', 'error');
  }
}

async function synthesizeDialogue() {
  const validLines = state.dialogueLines.filter(l => l.text.trim());
  if (validLines.length === 0) {
    showToast('Please add dialogue lines first!', 'warning');
    return;
  }

  const btn = document.getElementById('synthesizeDialogueBtn');
  btn.disabled = true;
  btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Generating Conversation...`;
  lucide.createIcons();

  try {
    const pauseMs = parseInt(document.getElementById('dialogueTurnPause').value, 10) || 400;
    const payload = validLines.map(l => {
      const spk = state.speakers.find(s => s.id === l.speakerId) || state.speakers[0];
      return {
        id: l.id,
        speaker: spk.name,
        voice: spk.voice,
        text: l.text,
        rate: 1.0,
        pitch: 0,
        pauseAfterMs: pauseMs
      };
    });

    const res = await fetch('/api/dialogue-synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines: payload, mergeAudio: true })
    });

    if (!res.ok) throw new Error('Failed to synthesize conversation');
    const data = await res.json();

    if (!data.mergedAudioBase64) throw new Error('No audio returned');

    // Convert base64 to Blob & URL
    const byteCharacters = atob(data.mergedAudioBase64.split(',')[1]);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const audioBlob = new Blob([byteArray], { type: 'audio/mpeg' });
    const audioUrl = URL.createObjectURL(audioBlob);

    state.currentAudioBlob = audioBlob;
    state.currentAudioUrl = audioUrl;

    audioEngine.src = audioUrl;
    playPauseBtn.disabled = false;
    timelineScrubber.disabled = false;
    waveformPlaceholder.classList.add('hidden');
    document.getElementById('playerVoiceTitle').textContent = `Full Podcast Conversation (${data.count} Lines)`;
    document.getElementById('playerSubtitle').textContent = `Multi-Speaker Dialogue • ${(audioBlob.size / 1024).toFixed(0)} KB MP3`;

    await playAudio();
    showToast('Synthesized full conversation successfully!', 'success');
  } catch (err) {
    console.error('Dialogue error:', err);
    showToast(`Dialogue synthesis error: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="sparkles" class="w-4 h-4"></i> Generate Full Conversation`;
    lucide.createIcons();
  }
}

// ========================================================
// TAB 3: SUBTITLE TO SPEECH (SRT & VTT)
// ========================================================

const SAMPLE_SRT = `1
00:00:01,000 --> 00:00:04,200
Welcome to KHS SRT.Ai, the most advanced AI voice generator.

2
00:00:05,000 --> 00:00:08,800
You can convert any subtitle file into perfectly timed dubbing tracks.

3
00:00:09,500 --> 00:00:13,200
Choose from over three hundred lifelike neural voices across seventy languages.

4
00:00:14,000 --> 00:00:17,500
Enjoy instant previews, customizable speed, and master audio export.`;

function loadSampleSrt() {
  parseAndLoadSrt(SAMPLE_SRT);
  showToast('Loaded sample SRT subtitle', 'info');
}

function clearSrt() {
  state.srtCues = [];
  document.getElementById('srtCueCount').textContent = '0';
  document.getElementById('srtTableBody').innerHTML = `
    <tr>
      <td colspan="6" class="py-8 text-center text-slate-500">
        No subtitle file loaded. Drop an .srt file above or click "Load Sample SRT".
      </td>
    </tr>
  `;
  document.getElementById('downloadFullSrtAudioBtn').disabled = true;
  document.getElementById('downloadZipBtn').disabled = true;
}

function handleSrtFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    parseAndLoadSrt(e.target.result);
    showToast(`Loaded "${file.name}"`, 'success');
  };
  reader.readAsText(file);
}

// Drag & drop handlers
const srtDropzone = document.getElementById('srtDropzone');
if (srtDropzone) {
  srtDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    srtDropzone.classList.add('border-indigo-500');
  });
  srtDropzone.addEventListener('dragleave', () => {
    srtDropzone.classList.remove('border-indigo-500');
  });
  srtDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    srtDropzone.classList.remove('border-indigo-500');
    if (e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const reader = new FileReader();
      reader.onload = (ev) => {
        parseAndLoadSrt(ev.target.result);
        showToast(`Loaded "${file.name}"`, 'success');
      };
      reader.readAsText(file);
    }
  });
}

function srtTimeToSeconds(srtTime) {
  const parts = srtTime.trim().replace('.', ',').split(':');
  if (parts.length < 3) return 0;
  const hours = parseFloat(parts[0]);
  const mins = parseFloat(parts[1]);
  const secParts = parts[2].split(',');
  const secs = parseFloat(secParts[0]);
  const ms = parseFloat(secParts[1] || '0');
  return hours * 3600 + mins * 60 + secs + ms / 1000;
}

function secondsToSrtTime(totalSecs) {
  const s = Math.max(0, totalSecs);
  const hours = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 1000);
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

function parseAndLoadSrt(content) {
  // Supports both SRT and WebVTT
  const cleaned = content.replace(/^WEBVTT[^\r\n]*\r?\n/i, '');
  const regex = /(?:(\d+)\s*\r?\n)?(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*\r?\n([\s\S]*?)(?=\r?\n\r?\n|\r?\n*$)/g;
  const cues = [];
  let match;
  let autoId = 1;

  while ((match = regex.exec(cleaned)) !== null) {
    const id = match[1] ? match[1].trim() : (autoId++).toString();
    const startTime = match[2].trim().replace('.', ',');
    const endTime = match[3].trim().replace('.', ',');
    const text = match[4].trim().replace(/\r?\n/g, ' ');

    cues.push({
      id,
      startTime,
      endTime,
      startSeconds: srtTimeToSeconds(startTime),
      endSeconds: srtTimeToSeconds(endTime),
      text,
      audioBase64: null
    });
  }

  state.srtCues = cues;
  document.getElementById('srtCueCount').textContent = cues.length;
  renderSrtTable();
}

function renderSrtTable() {
  const tbody = document.getElementById('srtTableBody');
  if (!tbody) return;

  if (state.srtCues.length === 0) {
    clearSrt();
    return;
  }

  tbody.innerHTML = '';
  state.srtCues.forEach((cue, index) => {
    const tr = document.createElement('tr');
    tr.id = `srt-row-${cue.id}`;
    tr.className = 'hover:bg-slate-900/50 transition border-b border-white/5';
    tr.innerHTML = `
      <td class="py-3 px-4 text-center font-mono text-slate-500">${cue.id}</td>
      <td class="py-3 px-4 font-mono text-indigo-400">${cue.startTime}</td>
      <td class="py-3 px-4 font-mono text-pink-400">${cue.endTime}</td>
      <td class="py-3 px-4">
        <input type="text" value="${escapeHtml(cue.text)}" onchange="updateCueText(${index}, this.value)" class="w-full bg-slate-900/80 border border-white/10 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none focus:border-indigo-500">
      </td>
      <td class="py-3 px-4 text-center" id="cue-audio-${cue.id}">
        <span class="text-[11px] text-slate-500 font-mono">Pending</span>
      </td>
      <td class="py-3 px-4 text-center">
        <button onclick="deleteCue(${index})" class="text-slate-500 hover:text-rose-400 transition" title="Delete Cue">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  lucide.createIcons();
}

function updateCueText(index, newText) {
  if (state.srtCues[index]) state.srtCues[index].text = newText;
}

function deleteCue(index) {
  state.srtCues.splice(index, 1);
  document.getElementById('srtCueCount').textContent = state.srtCues.length;
  renderSrtTable();
}

function shiftSrtTime(deltaSeconds) {
  if (state.srtCues.length === 0) return;
  state.srtCues.forEach(c => {
    c.startSeconds = Math.max(0, c.startSeconds + deltaSeconds);
    c.endSeconds = Math.max(0.1, c.endSeconds + deltaSeconds);
    c.startTime = secondsToSrtTime(c.startSeconds);
    c.endTime = secondsToSrtTime(c.endSeconds);
  });
  renderSrtTable();
  showToast(`Shifted timeline by ${deltaSeconds > 0 ? '+' : ''}${deltaSeconds}s`, 'info');
}

function exportModifiedSrt() {
  if (state.srtCues.length === 0) {
    showToast('No cues to export', 'warning');
    return;
  }
  let output = '';
  state.srtCues.forEach((c, idx) => {
    output += `${idx + 1}\n${c.startTime} --> ${c.endTime}\n${c.text}\n\n`;
  });
  const blob = new Blob([output], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  downloadBlobUrl(url, `khs-srt-ai-subtitles-${Date.now()}.srt`);
  showToast('Exported modified .SRT file', 'success');
}

// Synthesize All SRT Lines
async function synthesizeSrt() {
  if (state.srtCues.length === 0) {
    showToast('Please load an SRT file first!', 'warning');
    return;
  }

  const srtSelect = document.getElementById('srtVoiceSelect');
  const voice = srtSelect ? srtSelect.value : state.selectedVoice;
  const btn = document.getElementById('synthesizeSrtBtn');

  btn.disabled = true;
  btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Synthesizing...`;
  lucide.createIcons();

  try {
    const res = await fetch('/api/srt-synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cues: state.srtCues.map(c => ({ id: c.id, startTime: c.startTime, endTime: c.endTime, text: c.text })),
        voice: voice,
        rate: state.speed,
        pitch: state.pitch
      })
    });

    if (!res.ok) throw new Error('Synthesis failed on server');
    const data = await res.json();

    data.cues.forEach(resCue => {
      const match = state.srtCues.find(c => c.id === resCue.id);
      if (match) {
        match.audioBase64 = resCue.audioBase64;
        const cell = document.getElementById(`cue-audio-${match.id}`);
        if (cell && match.audioBase64) {
          cell.innerHTML = `
            <button onclick="playCueAudio('${match.id}')" class="px-2 py-1 rounded bg-indigo-600/30 hover:bg-indigo-600/60 text-indigo-300 font-medium flex items-center gap-1 mx-auto text-[11px] transition">
              <i data-lucide="play" class="w-3 h-3"></i> Play
            </button>
          `;
        }
      }
    });

    document.getElementById('downloadFullSrtAudioBtn').disabled = false;
    document.getElementById('downloadZipBtn').disabled = false;
    showToast(`Synthesized ${data.count} subtitle lines successfully!`, 'success');
  } catch (err) {
    console.error('SRT synthesis error:', err);
    showToast(`SRT synthesis failed: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="play-circle" class="w-4 h-4"></i> Synthesize All Lines`;
    lucide.createIcons();
  }
}

function playCueAudio(cueId) {
  const cue = state.srtCues.find(c => c.id === cueId);
  if (!cue || !cue.audioBase64) return;
  previewAudioEngine.src = cue.audioBase64;
  previewAudioEngine.play();
}

function highlightActiveSrtCue(currentTimeSeconds) {
  state.srtCues.forEach(c => {
    const row = document.getElementById(`srt-row-${c.id}`);
    if (!row) return;
    if (currentTimeSeconds >= c.startSeconds && currentTimeSeconds <= c.endSeconds) {
      row.classList.add('bg-indigo-950/40', 'border-indigo-500/40');
    } else {
      row.classList.remove('bg-indigo-950/40', 'border-indigo-500/40');
    }
  });
}

// Download All Cues as ZIP
async function downloadSrtZip() {
  const cuesWithAudio = state.srtCues.filter(c => c.audioBase64);
  if (cuesWithAudio.length === 0) {
    showToast('No audio clips to archive.', 'warning');
    return;
  }

  showToast('Creating ZIP archive of all lines...', 'info');
  try {
    const zip = new JSZip();
    const folder = zip.folder('khs_srt_ai_subtitles');

    cuesWithAudio.forEach((cue, index) => {
      const base64Data = cue.audioBase64.split(',')[1];
      const filename = `cue_${(index + 1).toString().padStart(3, '0')}.mp3`;
      folder.file(filename, base64Data, { base64: true });
    });

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    downloadBlobUrl(url, `khs-srt-ai-audio-${Date.now()}.zip`);
    showToast('Downloaded subtitle audio ZIP!', 'success');
  } catch (err) {
    showToast(`Failed to create ZIP: ${err.message}`, 'error');
  }
}

// Download Full SRT Dubbing Master Audio
async function downloadFullSrtDub() {
  const cuesWithAudio = state.srtCues.filter(c => c.audioBase64);
  if (cuesWithAudio.length === 0) {
    showToast('Click "Synthesize All Lines" first.', 'warning');
    return;
  }

  showToast('Rendering continuous master dubbed audio track...', 'info');

  try {
    const maxSeconds = Math.max(...state.srtCues.map(c => c.endSeconds)) + 2.0;
    const sampleRate = 24000;
    const offlineCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, Math.ceil(sampleRate * maxSeconds), sampleRate);

    for (const cue of cuesWithAudio) {
      const base64Data = cue.audioBase64.split(',')[1];
      const binaryStr = window.atob(base64Data);
      const len = binaryStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      const audioBuf = await offlineCtx.decodeAudioData(bytes.buffer);
      const source = offlineCtx.createBufferSource();
      source.buffer = audioBuf;
      source.connect(offlineCtx.destination);
      source.start(cue.startSeconds);
    }

    const renderedBuffer = await offlineCtx.startRendering();
    const wavBlob = audioBufferToWavBlob(renderedBuffer);
    const wavUrl = URL.createObjectURL(wavBlob);

    downloadBlobUrl(wavUrl, `khs-srt-ai-dubbed-master-${Date.now()}.wav`);

    state.currentAudioUrl = wavUrl;
    state.currentAudioBlob = wavBlob;
    audioEngine.src = wavUrl;
    playPauseBtn.disabled = false;
    timelineScrubber.disabled = false;
    waveformPlaceholder.classList.add('hidden');
    document.getElementById('playerVoiceTitle').textContent = 'Dubbed Master Audio Track';
    document.getElementById('playerSubtitle').textContent = `${formatTime(maxSeconds)} Synchronized Voiceover • WAV`;

    showToast('Dubbed master track downloaded!', 'success');
  } catch (err) {
    console.error('Master track error:', err);
    showToast(`Master audio error: ${err.message}`, 'error');
  }
}

// Convert AudioBuffer to WAV Blob
function audioBufferToWavBlob(buffer) {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const out = new DataView(new ArrayBuffer(length));
  const channels = [];
  let sample;
  let offset = 0;
  let pos = 0;

  function setUint16(data) { out.setUint16(pos, data, true); pos += 2; }
  function setUint32(data) { out.setUint32(pos, data, true); pos += 4; }

  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8);
  setUint32(0x45564157); // "WAVE"
  setUint32(0x20746d66); // "fmt "
  setUint32(16);
  setUint16(1); // PCM
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan);
  setUint16(numOfChan * 2);
  setUint16(16);
  setUint32(0x61746164); // "data"
  setUint32(length - pos - 4);

  for (let i = 0; i < buffer.numberOfChannels; i++) channels.push(buffer.getChannelData(i));

  while (offset < buffer.length) {
    for (let i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      out.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([out], { type: 'audio/wav' });
}

// ========================================================
// TAB 4: VOICE LIBRARY SHOWCASE
// ========================================================

function renderVoiceLibrary() {
  const container = document.getElementById('voicesGrid');
  if (!container) return;

  const { gender, lang, search, onlyFavorites } = state.libraryFilter;
  let list = state.voices;

  if (onlyFavorites) {
    list = list.filter(v => state.favorites.has(v.shortName));
  }
  if (gender !== 'all') {
    list = list.filter(v => v.gender.toLowerCase() === gender.toLowerCase());
  }
  if (lang !== 'all') {
    list = list.filter(v => v.locale.toLowerCase() === lang.toLowerCase());
  }
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(v =>
      v.name.toLowerCase().includes(q) ||
      v.localeName.toLowerCase().includes(q) ||
      v.shortName.toLowerCase().includes(q)
    );
  }

  container.innerHTML = '';

  if (list.length === 0) {
    container.innerHTML = `
      <div class="col-span-full py-12 text-center text-slate-500 text-sm">
        <i data-lucide="search-x" class="w-8 h-8 mx-auto mb-2 opacity-50"></i>
        <p>No voices matching criteria. Try searching another language or clear filters.</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  list.forEach(v => {
    const isFemale = v.gender.toLowerCase() === 'female';
    const card = document.createElement('div');
    const isSelected = v.shortName === state.selectedVoice;
    const isStarred = state.favorites.has(v.shortName);

    card.className = `glass-card p-4 flex flex-col justify-between space-y-3 cursor-pointer transition ${isSelected ? 'border-indigo-500 bg-indigo-950/20 shadow-md shadow-indigo-500/20' : ''}`;
    
    card.innerHTML = `
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-full ${isFemale ? 'bg-pink-600/20 text-pink-400 border-pink-500/30' : 'bg-indigo-600/20 text-indigo-400 border-indigo-500/30'} border flex items-center justify-center font-bold text-xs">
              ${v.name.charAt(0)}
            </div>
            <div>
              <div class="flex items-center gap-1.5">
                <h4 class="text-sm font-semibold text-white">${v.name}</h4>
                <button onclick="toggleVoiceLibraryStar('${v.shortName}')" title="Favorite Voice" class="text-slate-500 hover:text-amber-400">
                  <i data-lucide="star" class="w-3.5 h-3.5 ${isStarred ? 'text-amber-400 fill-amber-400' : ''}"></i>
                </button>
              </div>
              <p class="text-[11px] text-slate-400 flex items-center gap-1">
                <span>${v.flag}</span>
                <span class="truncate max-w-[130px]">${v.localeName}</span>
              </p>
            </div>
          </div>
          <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full ${isFemale ? 'bg-pink-500/10 text-pink-400 border border-pink-500/20' : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'}">
            ${v.gender}
          </span>
        </div>

        <div class="flex flex-wrap gap-1 text-[10px] text-slate-400">
          ${v.personalities && v.personalities.length > 0 
            ? v.personalities.map(p => `<span class="bg-slate-900 px-1.5 py-0.5 rounded border border-white/5">${p}</span>`).join('')
            : `<span class="bg-slate-900 px-1.5 py-0.5 rounded border border-white/5">Neural</span>`
          }
        </div>
      </div>

      <div class="flex items-center gap-2 pt-2 border-t border-white/5">
        <button onclick="previewVoiceInLibrary('${v.shortName}', this)" class="lib-sample-btn flex-1 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-white/10 text-xs font-medium flex items-center justify-center gap-1.5 transition">
          <i data-lucide="volume-2" class="w-3.5 h-3.5 text-indigo-400"></i>
          <span>Sample</span>
        </button>
        <button onclick="selectVoiceFromLibrary('${v.shortName}', '${v.locale}')" class="py-1.5 px-3 rounded-lg ${isSelected ? 'bg-indigo-600 text-white' : 'bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white'} text-xs font-semibold flex items-center gap-1 transition">
          <span>${isSelected ? 'Selected' : 'Use'}</span>
        </button>
      </div>
    `;

    container.appendChild(card);
  });

  lucide.createIcons();
}

function toggleVoiceLibraryStar(shortName) {
  if (state.favorites.has(shortName)) {
    state.favorites.delete(shortName);
  } else {
    state.favorites.add(shortName);
  }
  saveFavoritesToStorage();
  updateFavStarIcon();
  renderVoiceLibrary();
}

function filterFavoritesToggle() {
  state.libraryFilter.onlyFavorites = !state.libraryFilter.onlyFavorites;
  const btn = document.getElementById('filter-favorites');
  if (state.libraryFilter.onlyFavorites) {
    btn.classList.add('bg-amber-500/20', 'border-amber-500/40');
  } else {
    btn.classList.remove('bg-amber-500/20', 'border-amber-500/40');
  }
  renderVoiceLibrary();
}

function filterVoiceLibrary() {
  const searchInput = document.getElementById('librarySearchInput');
  state.libraryFilter.search = searchInput ? searchInput.value.trim() : '';
  renderVoiceLibrary();
}

function filterByGender(gender) {
  state.libraryFilter.gender = gender;
  ['all', 'female', 'male'].forEach(g => {
    const btn = document.getElementById(`gender-${g}`);
    if (g === gender.toLowerCase()) {
      btn.className = 'px-3 py-1 rounded-md font-medium bg-indigo-600 text-white transition';
    } else {
      btn.className = 'px-3 py-1 rounded-md font-medium text-slate-400 hover:text-white transition';
    }
  });
  renderVoiceLibrary();
}

function quickSelectLibLang(lang) {
  state.libraryFilter.lang = lang;
  renderVoiceLibrary();
}

async function previewVoiceInLibrary(shortName, btnElement) {
  if (state.previewAudioPlayingVoice === shortName && !previewAudioEngine.paused) {
    previewAudioEngine.pause();
    state.previewAudioPlayingVoice = null;
    btnElement.innerHTML = `<i data-lucide="volume-2" class="w-3.5 h-3.5"></i> Sample`;
    lucide.createIcons();
    return;
  }

  btnElement.innerHTML = `<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i> Playing`;
  lucide.createIcons();

  await previewSelectedVoice(shortName);

  previewAudioEngine.onended = () => {
    state.previewAudioPlayingVoice = null;
    btnElement.innerHTML = `<i data-lucide="volume-2" class="w-3.5 h-3.5"></i> Sample`;
    lucide.createIcons();
  };
}

function selectVoiceFromLibrary(shortName, locale) {
  state.selectedLocale = locale;
  state.selectedVoice = shortName;
  localeSelect.value = locale;
  populateVoiceDropdown();
  updateSelectedLocaleFlag();
  updateSelectedVoiceCard();

  showToast(`Selected voice: ${shortName.split('-').pop()}`, 'success');
  switchTab('tts');
}

// ========================================================
// TAB 5: HISTORY (INDEXEDDB PERSISTENCE)
// ========================================================

async function updateHistoryBadge() {
  const items = await dbGetAllHistory();
  const badge = document.getElementById('historyCountBadge');
  const mBadge = document.getElementById('historyMobileBadge');
  if (items.length > 0) {
    if (badge) {
      badge.textContent = items.length;
      badge.classList.remove('hidden');
    }
    if (mBadge) {
      mBadge.textContent = items.length;
      mBadge.classList.remove('hidden');
    }
  } else {
    if (badge) badge.classList.add('hidden');
    if (mBadge) mBadge.classList.add('hidden');
  }
}

async function renderHistory(filterQuery = '') {
  const container = document.getElementById('historyList');
  if (!container) return;

  let items = await dbGetAllHistory();
  if (filterQuery) {
    const q = filterQuery.toLowerCase();
    items = items.filter(i => i.text.toLowerCase().includes(q) || i.voiceName.toLowerCase().includes(q));
  }

  if (items.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 text-slate-500 text-sm">
        <i data-lucide="archive" class="w-8 h-8 mx-auto mb-2 opacity-50"></i>
        <p>No audio generations found.</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  container.innerHTML = '';
  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'glass-card p-4 space-y-3';
    card.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2">
        <div class="flex items-center gap-2">
          <div class="w-6 h-6 rounded-full bg-indigo-600/30 text-indigo-400 font-bold text-xs flex items-center justify-center">
            ${item.voiceName.charAt(0)}
          </div>
          <span class="text-xs font-semibold text-white">${item.voiceName}</span>
          <span class="text-[11px] text-slate-500 font-mono">• ${item.date} ${item.timestamp} (${item.sizeKb} KB)</span>
        </div>
        <div class="flex items-center gap-3">
          <button onclick="playHistoryAudio('${item.id}')" class="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1">
            <i data-lucide="play" class="w-3.5 h-3.5"></i> Play
          </button>
          <button onclick="loadHistoryItemInEditor('${item.id}')" class="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
            <i data-lucide="edit-3" class="w-3.5 h-3.5"></i> Load
          </button>
          <button onclick="downloadHistoryItem('${item.id}')" class="text-xs text-slate-400 hover:text-white flex items-center gap-1">
            <i data-lucide="download" class="w-3.5 h-3.5"></i>
          </button>
          <button onclick="removeHistoryItem('${item.id}')" class="text-slate-500 hover:text-rose-400">
            <i data-lucide="trash" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>
      <p class="text-xs text-slate-300 italic line-clamp-2">"${escapeHtml(item.text)}"</p>
    `;
    container.appendChild(card);
  });

  lucide.createIcons();
}

function filterHistoryList(q) {
  renderHistory(q);
}

async function playHistoryAudio(id) {
  const items = await dbGetAllHistory();
  const item = items.find(i => i.id === id);
  if (!item || !item.blob) return;
  previewAudioEngine.src = URL.createObjectURL(item.blob);
  previewAudioEngine.play();
}

async function loadHistoryItemInEditor(id) {
  const items = await dbGetAllHistory();
  const item = items.find(i => i.id === id);
  if (!item) return;

  ttsText.value = item.fullText || item.text;
  updateTextStats();

  const matchingVoice = state.voices.find(v => v.shortName === item.voiceShortName);
  if (matchingVoice) {
    selectVoiceFromLibrary(matchingVoice.shortName, matchingVoice.locale);
  } else {
    switchTab('tts');
  }

  showToast('Loaded script into editor', 'info');
}

async function downloadHistoryItem(id) {
  const items = await dbGetAllHistory();
  const item = items.find(i => i.id === id);
  if (!item || !item.blob) return;
  const url = URL.createObjectURL(item.blob);
  downloadBlobUrl(url, `khs-srt-ai-saved-${item.voiceName}-${item.id}.mp3`);
}

async function removeHistoryItem(id) {
  await dbDeleteItem(id);
  renderHistory();
  updateHistoryBadge();
  showToast('Item deleted', 'info');
}

async function clearAllHistory() {
  if (!confirm('Are you sure you want to clear your entire audio history?')) return;
  await dbClearAll();
  renderHistory();
  updateHistoryBadge();
  showToast('Audio archive cleared', 'info');
}

// Keyboard Shortcuts
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (state.activeTab === 'tts') generateSpeech();
      else if (state.activeTab === 'dialogue') synthesizeDialogue();
      else if (state.activeTab === 'srt') synthesizeSrt();
    } else if (e.code === 'Space' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'INPUT') {
      e.preventDefault();
      togglePlayPause();
    } else if (e.key === 'Escape') {
      if (!previewAudioEngine.paused) {
        previewAudioEngine.pause();
        state.previewAudioPlayingVoice = null;
      }
      document.getElementById('shortcutsModal').classList.add('hidden');
    }
  });
}

function toggleShortcutsModal() {
  const modal = document.getElementById('shortcutsModal');
  modal.classList.toggle('hidden');
}

// Helpers
function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = 'toast';

  let iconName = 'info';
  let iconColor = 'text-indigo-400';
  if (type === 'success') {
    iconName = 'check-circle-2';
    iconColor = 'text-emerald-400';
  } else if (type === 'error') {
    iconName = 'alert-triangle';
    iconColor = 'text-rose-400';
  } else if (type === 'warning') {
    iconName = 'alert-circle';
    iconColor = 'text-amber-400';
  }

  toast.innerHTML = `
    <i data-lucide="${iconName}" class="w-4 h-4 ${iconColor} shrink-0"></i>
    <span>${message}</span>
  `;

  toastContainer.appendChild(toast);
  lucide.createIcons();

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

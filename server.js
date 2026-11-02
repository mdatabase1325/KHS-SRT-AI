const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Cache for preview audio buffers (voiceShortName -> Buffer)
const previewCache = new Map();

// Helper to convert locale (e.g. en-US, vi-VN) into flag emoji
function getFlagEmoji(locale) {
  if (!locale) return '🌐';
  const parts = locale.split('-');
  if (parts.length < 2) return '🌐';
  const cc = parts[1].toUpperCase();
  if (cc.length !== 2) return '🌐';
  try {
    return String.fromCodePoint(...[...cc].map(c => 127397 + c.charCodeAt(0)));
  } catch (e) {
    return '🌐';
  }
}

// Clean simple name from ShortName e.g. "en-US-JennyNeural" -> "Jenny"
function getCleanName(shortName) {
  if (!shortName) return 'Voice';
  const parts = shortName.split('-');
  const last = parts[parts.length - 1] || '';
  return last.replace(/Neural$/i, '');
}

// Load and enrich voices catalog
let voicesCatalog = [];
let localesMap = [];

function loadVoices() {
  const voicesFilePath = path.join(__dirname, 'voices.json');
  if (fs.existsSync(voicesFilePath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(voicesFilePath, 'utf8'));
      voicesCatalog = raw.map(v => {
        const flag = getFlagEmoji(v.Locale);
        const cleanName = getCleanName(v.ShortName);
        const personalities = (v.VoiceTag && v.VoiceTag.VoicePersonalities) || [];
        const categories = (v.VoiceTag && v.VoiceTag.ContentCategories) || [];
        return {
          id: v.ShortName,
          name: cleanName,
          fullName: v.FriendlyName || v.Name,
          shortName: v.ShortName,
          gender: v.Gender || 'Unknown',
          locale: v.Locale,
          localeName: v.LocaleName,
          flag: flag,
          personalities: personalities,
          categories: categories,
          isPopular: [
            'km-KH-PisethNeural', 'km-KH-SreymomNeural',
            'en-US-JennyNeural', 'en-US-GuyNeural', 'en-US-AriaNeural', 'en-US-ChristopherNeural', 'en-US-EricNeural',
            'en-GB-SoniaNeural', 'en-GB-RyanNeural', 'es-ES-AlvaroNeural', 'fr-FR-DeniseNeural', 'ja-JP-NanamiNeural',
            'zh-CN-XiaoxiaoNeural', 'vi-VN-HoaiMyNeural', 'de-DE-KatjaNeural', 'it-IT-IsabellaNeural', 'pt-BR-FranciscaNeural'
          ].includes(v.ShortName)
        };
      });

      // Build unique locales list with counts and flags
      const map = new Map();
      voicesCatalog.forEach(v => {
        if (!map.has(v.locale)) {
          map.set(v.locale, {
            locale: v.locale,
            name: v.localeName,
            flag: v.flag,
            count: 0
          });
        }
        map.get(v.locale).count++;
      });
      localesMap = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
      console.log(`Loaded ${voicesCatalog.length} voices across ${localesMap.length} locales.`);
    } catch (err) {
      console.error('Error parsing voices.json:', err);
    }
  } else {
    console.warn('voices.json not found on startup.');
  }
}

loadVoices();

// Format helper for rate (+20%, -10%, etc.)
function formatRate(speed) {
  if (typeof speed === 'string' && (speed.endsWith('%') || speed.startsWith('+') || speed.startsWith('-'))) {
    return speed;
  }
  const num = parseFloat(speed) || 1.0;
  const pct = Math.round((num - 1.0) * 100);
  return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

// Format helper for pitch (+10Hz, -5Hz, etc.)
function formatPitch(pitch) {
  if (typeof pitch === 'string' && (pitch.endsWith('Hz') || pitch.endsWith('%'))) {
    return pitch;
  }
  const num = parseInt(pitch, 10) || 0;
  return num >= 0 ? `+${num}Hz` : `${num}Hz`;
}

// Format helper for volume
function formatVolume(volume) {
  if (typeof volume === 'string' && (volume.endsWith('%') || volume.startsWith('+') || volume.startsWith('-'))) {
    return volume;
  }
  const num = parseInt(volume, 10) || 100;
  return `${num}`;
}

// Preprocess text tags: [spell]ABC[/spell] -> A B C, [pause 1s] handled
function preprocessText(raw) {
  if (!raw) return '';
  let str = raw;
  // Convert [spell]XYZ[/spell] into space-separated characters
  str = str.replace(/\[spell\](.*?)\[\/spell\]/gi, (m, content) => {
    return content.split('').join(' ');
  });
  return str;
}

// Generate speech buffer for a given single text segment
async function generateSpeechBuffer(text, voice, options = {}) {
  const tts = new MsEdgeTTS();
  const format = options.format === '48k' 
    ? OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3 
    : OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3;

  await tts.setMetadata(voice, format);

  const cleanText = preprocessText(text);

  const prosodyOptions = {
    rate: formatRate(options.rate),
    pitch: formatPitch(options.pitch),
    volume: formatVolume(options.volume)
  };

  return new Promise((resolve, reject) => {
    try {
      const { audioStream } = tts.toStream(cleanText, prosodyOptions);
      const chunks = [];
      let timeoutId = setTimeout(() => {
        reject(new Error('Audio synthesis timed out.'));
      }, 40000);

      audioStream.on('data', chunk => chunks.push(chunk));
      audioStream.on('end', () => {
        clearTimeout(timeoutId);
        const fullBuffer = Buffer.concat(chunks);
        resolve(fullBuffer);
      });
      audioStream.on('error', err => {
        clearTimeout(timeoutId);
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
}

// Silent MP3 frame helper
const SILENT_MP3_FRAME = Buffer.from([
  0xff, 0xfb, 0x90, 0x64, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
]);

function createSilentMp3Buffer(durationMs) {
  const repeat = Math.max(1, Math.round((durationMs || 500) / 26));
  const frames = [];
  for (let i = 0; i < repeat; i++) {
    frames.push(SILENT_MP3_FRAME);
  }
  return Buffer.concat(frames);
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    voicesAvailable: voicesCatalog.length,
    localesAvailable: localesMap.length,
    timestamp: new Date().toISOString()
  });
});

// GET /api/voices
app.get('/api/voices', (req, res) => {
  const { lang, gender, search } = req.query;
  let results = voicesCatalog;

  if (lang && lang !== 'all') {
    results = results.filter(v => v.locale.toLowerCase() === lang.toLowerCase());
  }
  if (gender && gender !== 'all') {
    results = results.filter(v => v.gender.toLowerCase() === gender.toLowerCase());
  }
  if (search) {
    const q = search.toLowerCase().trim();
    results = results.filter(v =>
      v.name.toLowerCase().includes(q) ||
      v.fullName.toLowerCase().includes(q) ||
      v.localeName.toLowerCase().includes(q) ||
      v.shortName.toLowerCase().includes(q)
    );
  }

  res.json({
    total: results.length,
    locales: localesMap,
    voices: results
  });
});

// GET /api/preview?voice=en-US-JennyNeural
app.get('/api/preview', async (req, res) => {
  const voice = req.query.voice || 'en-US-JennyNeural';
  
  if (previewCache.has(voice)) {
    const buffer = previewCache.get(voice);
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': buffer.length,
      'Cache-Control': 'public, max-age=86400'
    });
    return res.send(buffer);
  }

  const voiceMeta = voicesCatalog.find(v => v.shortName === voice);
  const voiceName = voiceMeta ? voiceMeta.name : 'Voice';
  const previewText = `Hello! This is ${voiceName}, your AI voice on KHS SRT.Ai.`;

  try {
    const buffer = await generateSpeechBuffer(previewText, voice, {
      rate: 1.0,
      pitch: 0,
      format: '96k'
    });
    previewCache.set(voice, buffer);
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': buffer.length,
      'Cache-Control': 'public, max-age=86400'
    });
    res.send(buffer);
  } catch (err) {
    console.error(`Preview error for ${voice}:`, err.message);
    res.status(500).json({ error: 'Failed to generate preview', details: err.message });
  }
});

// POST /api/tts
app.post('/api/tts', async (req, res) => {
  try {
    const {
      text,
      voice = 'en-US-JennyNeural',
      rate = 1.0,
      pitch = 0,
      volume = 100,
      format = '96k',
      responseType = 'stream'
    } = req.body;

    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Text is required and cannot be empty.' });
    }

    if (text.length > 25000) {
      return res.status(400).json({ error: 'Text exceeds maximum limit of 25,000 characters.' });
    }

    const pauseRegex = /\[pause\s+(\d+(?:\.\d+)?)\s*(s|ms)\]/gi;
    let finalBuffer;

    if (pauseRegex.test(text)) {
      const parts = [];
      let lastIndex = 0;
      let match;
      pauseRegex.lastIndex = 0;

      while ((match = pauseRegex.exec(text)) !== null) {
        const segText = text.slice(lastIndex, match.index).trim();
        if (segText) {
          parts.push({ type: 'text', content: segText });
        }
        const val = parseFloat(match[1]);
        const unit = match[2].toLowerCase();
        const ms = unit === 's' ? Math.round(val * 1000) : Math.round(val);
        parts.push({ type: 'pause', ms: Math.min(ms, 10000) });
        lastIndex = pauseRegex.lastIndex;
      }
      const remainder = text.slice(lastIndex).trim();
      if (remainder) {
        parts.push({ type: 'text', content: remainder });
      }

      const buffers = [];
      for (const part of parts) {
        if (part.type === 'text') {
          const buf = await generateSpeechBuffer(part.content, voice, { rate, pitch, volume, format });
          buffers.push(buf);
        } else if (part.type === 'pause') {
          buffers.push(createSilentMp3Buffer(part.ms));
        }
      }
      finalBuffer = Buffer.concat(buffers);
    } else {
      finalBuffer = await generateSpeechBuffer(text.trim(), voice, { rate, pitch, volume, format });
    }

    if (responseType === 'json') {
      return res.json({
        success: true,
        voice: voice,
        audioBase64: `data:audio/mpeg;base64,${finalBuffer.toString('base64')}`,
        size: finalBuffer.length
      });
    }

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': finalBuffer.length,
      'Content-Disposition': 'inline; filename="khs-srt-ai-output.mp3"'
    });
    res.send(finalBuffer);
  } catch (err) {
    console.error('TTS synthesis error:', err);
    res.status(500).json({ error: 'Text to speech synthesis failed.', details: err.message });
  }
});

// POST /api/srt-synthesize
app.post('/api/srt-synthesize', async (req, res) => {
  try {
    const {
      cues,
      voice = 'en-US-JennyNeural',
      rate = 1.0,
      pitch = 0,
      volume = 100
    } = req.body;

    if (!Array.isArray(cues) || cues.length === 0) {
      return res.status(400).json({ error: 'Cues array is required.' });
    }

    const batch = cues.slice(0, 150);
    const results = [];

    for (const cue of batch) {
      if (!cue.text || !cue.text.trim()) {
        results.push({
          id: cue.id,
          startTime: cue.startTime,
          endTime: cue.endTime,
          text: cue.text,
          audioBase64: null,
          size: 0
        });
        continue;
      }

      try {
        const cueVoice = cue.voice || voice;
        const cueRate = cue.rate !== undefined ? cue.rate : rate;
        const cuePitch = cue.pitch !== undefined ? cue.pitch : pitch;

        const buffer = await generateSpeechBuffer(cue.text.trim(), cueVoice, {
          rate: cueRate,
          pitch: cuePitch,
          volume
        });

        results.push({
          id: cue.id,
          startTime: cue.startTime,
          endTime: cue.endTime,
          text: cue.text,
          audioBase64: `data:audio/mpeg;base64,${buffer.toString('base64')}`,
          size: buffer.length
        });
      } catch (err) {
        console.error(`Error synthesizing cue ${cue.id}:`, err.message);
        results.push({
          id: cue.id,
          startTime: cue.startTime,
          endTime: cue.endTime,
          text: cue.text,
          error: err.message
        });
      }
    }

    res.json({
      success: true,
      voice,
      count: results.length,
      cues: results
    });
  } catch (err) {
    console.error('SRT synthesis error:', err);
    res.status(500).json({ error: 'Failed to synthesize SRT audio', details: err.message });
  }
});

// POST /api/dialogue-synthesize (Multi-Speaker / Podcast Mode)
app.post('/api/dialogue-synthesize', async (req, res) => {
  try {
    const { lines, mergeAudio = true } = req.body;

    if (!Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ error: 'Dialogue lines array is required.' });
    }

    const results = [];
    const audioBuffers = [];

    for (const line of lines) {
      if (!line.text || !line.text.trim()) continue;

      const voice = line.voice || 'en-US-JennyNeural';
      const rate = line.rate !== undefined ? line.rate : 1.0;
      const pitch = line.pitch !== undefined ? line.pitch : 0;
      const pauseAfterMs = line.pauseAfterMs || 400;

      try {
        const buffer = await generateSpeechBuffer(line.text.trim(), voice, { rate, pitch });
        results.push({
          id: line.id,
          speaker: line.speaker || 'Speaker',
          voice: voice,
          text: line.text,
          audioBase64: `data:audio/mpeg;base64,${buffer.toString('base64')}`,
          size: buffer.length
        });

        if (mergeAudio) {
          audioBuffers.push(buffer);
          if (pauseAfterMs > 0) {
            audioBuffers.push(createSilentMp3Buffer(pauseAfterMs));
          }
        }
      } catch (lineErr) {
        console.error(`Error on dialogue line ${line.id}:`, lineErr.message);
        results.push({
          id: line.id,
          speaker: line.speaker,
          voice,
          text: line.text,
          error: lineErr.message
        });
      }
    }

    let mergedBase64 = null;
    if (mergeAudio && audioBuffers.length > 0) {
      const mergedBuf = Buffer.concat(audioBuffers);
      mergedBase64 = `data:audio/mpeg;base64,${mergedBuf.toString('base64')}`;
    }

    res.json({
      success: true,
      count: results.length,
      lines: results,
      mergedAudioBase64: mergedBase64
    });
  } catch (err) {
    console.error('Dialogue synthesis error:', err);
    res.status(500).json({ error: 'Failed to synthesize dialogue', details: err.message });
  }
});

// Fallback to index.html for SPA routes
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`===============================================`);
  console.log(`🎙️ KHS SRT.Ai Server running on http://0.0.0.0:${PORT}`);
  console.log(`===============================================`);
});

// Keep process active
setInterval(() => {}, 1000 * 60 * 60);

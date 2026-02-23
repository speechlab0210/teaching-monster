const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { spawn } = require('child_process');
const OpenAI = require('openai');

let MsEdgeTTS;
try { MsEdgeTTS = require('msedge-tts').default; } catch(e) { console.warn('msedge-tts not available'); }

const app = express();
app.use(express.json());

const FFMPEG = (() => {
  try { return require('child_process').execSync('which ffmpeg 2>/dev/null || where ffmpeg 2>nul').toString().trim().split('\n')[0].trim(); } catch(e) {}
  try { return require('ffmpeg-static'); } catch(e) {}
  return 'ffmpeg';
})();
console.log('Using ffmpeg:', FFMPEG);

const OUTPUT_DIR = path.join(__dirname, 'output');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Request queue
let processing = false;
const queue = [];
function processQueue() {
  if (processing || queue.length === 0) return;
  processing = true;
  const { resolve, reject, args } = queue.shift();
  handleGenerate(...args).then(resolve).catch(reject).finally(() => {
    processing = false;
    processQueue();
  });
}

app.use('/files', express.static(OUTPUT_DIR));
app.get('/', (req, res) => res.json({ status: 'ok', service: 'teaching-monster-api', version: '3.0' }));

// ─── OpenAI Script Generation ───
const _k = process.env.OPENAI_API_KEY || Buffer.from('c2stcHJvai1oNTJPRjhzUTM1QWZnekxVOXRxa19NR1Jxd2pXeXRqcWRuTlRpTlM5b2RSZGpkUTBIekpLRml6MTZDYTZHY1NFaGtETkE1THhxVlQzQmxia0ZKN0gxY21mSlpnZ1FJSmluWmlWb2VXN01wMGljYTdoRXN2c0ZYMWZuVjB3VFhOUDZidnNmOXN5V1kxczNmcW5lTzBibE1SQURWTUE=', 'base64').toString();
const openai = new OpenAI({ apiKey: _k });

async function generateScriptAI(courseRequirement, studentPersona) {
  const systemPrompt = `You are a world-class university professor creating a teaching script. Generate structured, engaging educational content.

Output STRICT JSON (no markdown, no code fences):
{
  "course_title": "A concise course title",
  "sections": [
    {
      "title": "Section Title",
      "bullet_points": ["Key point 1", "Key point 2", "Key point 3"],
      "narration_text": "A 2-4 sentence narration for this section, spoken naturally like a professor lecturing."
    }
  ]
}

Rules:
- Generate 5-7 sections
- Each section has 3-4 bullet points
- Narration should be clear, engaging, and educational
- Adapt complexity to the student persona
- First section should be an introduction, last should be a summary
- Use English`;

  const userPrompt = `Course requirement: ${courseRequirement}\nStudent persona: ${studentPersona || 'A general college student'}`;

  const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.7,
    max_tokens: 2000,
  });

  const raw = resp.choices[0].message.content.trim();
  // Strip markdown fences if present
  const cleaned = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');
  return JSON.parse(cleaned);
}

// Fallback hardcoded script
function generateScriptFallback(topic) {
  return {
    course_title: topic,
    sections: [
      { title: 'Introduction', bullet_points: ['Overview of the topic', 'Why it matters', 'What you will learn'], narration_text: `Welcome! Today we will explore ${topic}. This is an important subject with many practical applications.` },
      { title: 'Core Concepts', bullet_points: ['Fundamental principles', 'Key terminology', 'Basic framework'], narration_text: `The foundation of ${topic} involves understanding its key principles and how different components work together.` },
      { title: 'How It Works', bullet_points: ['Step by step process', 'Underlying mechanisms', 'Key relationships'], narration_text: `${topic} operates through well-defined steps and processes. Each step builds upon the previous one.` },
      { title: 'Applications', bullet_points: ['Real-world uses', 'Industry applications', 'Research frontiers'], narration_text: `${topic} is applied in many real-world scenarios, from industry to research.` },
      { title: 'Summary', bullet_points: ['Key takeaways', 'Next steps', 'Further resources'], narration_text: `To wrap up, we covered the basics of ${topic}. Continue exploring to deepen your understanding!` }
    ]
  };
}

// ─── TTS ───
async function generateTTS(text, outputPath) {
  if (!MsEdgeTTS) throw new Error('TTS not available');
  const tts = new MsEdgeTTS();
  await tts.setMetadata('en-US-AriaNeural', MsEdgeTTS.OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const readable = tts.toStream(text);
  const ws = fs.createWriteStream(outputPath);
  return new Promise((resolve, reject) => {
    readable.pipe(ws);
    ws.on('finish', resolve);
    ws.on('error', reject);
    readable.on('error', reject);
  });
}

// ─── FFmpeg helpers ───
function getAudioDuration(filePath) {
  return new Promise((resolve) => {
    const ffprobe = FFMPEG.replace(/ffmpeg(\.exe)?$/, 'ffprobe$1');
    const proc = spawn(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath]);
    let out = '';
    proc.stdout.on('data', d => out += d);
    proc.on('close', () => resolve(parseFloat(out) || 8));
    proc.on('error', () => resolve(8));
  });
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    console.log('ffmpeg', args.slice(0, 5).join(' '), '...');
    const proc = spawn(FFMPEG, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-500)}`)));
    proc.on('error', reject);
  });
}

// ─── Visual Config ───
const SLIDE_BG = [
  '0x0B1729', '0x1B1040', '0x0A2942', '0x1A0A33', '0x0D2137', '0x120B30', '0x0B1729'
];
const ACCENT_COLORS = [
  '0x4FC3F7', '0xCE93D8', '0x4DB6AC', '0xFFB74D', '0x81C784', '0xF48FB1', '0x4FC3F7'
];
const TITLE_SLIDE_BG = '0x0D1B2A';
const SUMMARY_SLIDE_BG = '0x1A0A33';

function esc(text) {
  // Escape for ffmpeg drawtext - must handle : ' \ % and newlines
  return text
    .replace(/\\/g, '\\\\\\\\')
    .replace(/'/g, "'\\\\\\''")
    .replace(/:/g, '\\\\:')
    .replace(/%/g, '%%')
    .replace(/\n/g, '\\n');
}

function fmtTime(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = (s % 60).toFixed(3);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${sec.padStart(6,'0')}`;
}

// ─── Main Handler ───
async function handleGenerate(req) {
  const { request_id, course_requirement, student_persona } = req.body;
  const fileId = request_id || uuidv4();
  const tmpDir = path.join(OUTPUT_DIR, `tmp_${fileId}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  console.log(`[${new Date().toISOString()}] Processing: ${fileId}`);

  // Step 1: Generate script
  let script;
  try {
    if (!_k) throw new Error('No API key');
    script = await generateScriptAI(course_requirement, student_persona);
    console.log(`AI script: ${script.sections.length} sections`);
  } catch (e) {
    console.error('AI script failed, using fallback:', e.message);
    script = generateScriptFallback(course_requirement);
  }

  const { course_title, sections } = script;

  // Step 2: Generate TTS per section + title/summary narration
  const allParts = []; // { type, text, audioPath, duration, section? }

  // Title slide narration
  const titleNarration = `Welcome to ${course_title}. Let's begin.`;
  // Summary slide narration
  const summaryNarration = `That concludes our lesson on ${course_title}. Thank you for learning with us!`;

  const narrations = [
    { type: 'title', text: titleNarration },
    ...sections.map((s, i) => ({ type: 'section', text: s.narration_text, index: i })),
    { type: 'summary', text: summaryNarration }
  ];

  for (let i = 0; i < narrations.length; i++) {
    const n = narrations[i];
    const audioPath = path.join(tmpDir, `part_${i}.mp3`);
    let duration = 5;
    try {
      await generateTTS(n.text, audioPath);
      if (fs.existsSync(audioPath) && fs.statSync(audioPath).size > 100) {
        duration = await getAudioDuration(audioPath);
      }
    } catch (e) {
      console.error(`TTS failed for part ${i}:`, e.message);
      // Create silent audio
      await runFfmpeg(['-y', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', String(duration), '-c:a', 'libmp3lame', audioPath]);
    }
    // Add 0.3s padding
    duration = Math.max(duration, 2) + 0.3;
    allParts.push({ ...n, audioPath, duration });
  }

  console.log(`TTS done. Durations:`, allParts.map(p => p.duration.toFixed(1)));

  // Step 3: Concat all audio
  const concatListPath = path.join(tmpDir, 'concat.txt');
  const concatLines = allParts.map(p => `file '${p.audioPath.replace(/\\/g, '/')}'`);
  fs.writeFileSync(concatListPath, concatLines.join('\n'));
  const fullAudioPath = path.join(tmpDir, 'full_audio.mp3');
  await runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', concatListPath, '-c:a', 'libmp3lame', '-b:a', '64k', fullAudioPath]);
  const totalDuration = allParts.reduce((s, p) => s + p.duration, 0);

  // Step 4: Build video filter
  let filters = [];
  let t = 0;
  let vttLines = ['WEBVTT', ''];
  const totalSections = sections.length;

  for (let pi = 0; pi < allParts.length; pi++) {
    const part = allParts[pi];
    const start = t;
    const end = t + part.duration;

    if (part.type === 'title') {
      // Title slide: dark bg, course title centered, subtitle
      filters.push(`drawbox=x=0:y=0:w=iw:h=ih:color=${TITLE_SLIDE_BG}:t=fill:enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'`);
      // Decorative top line
      filters.push(`drawbox=x=340:y=200:w=600:h=3:color=0x4FC3F7:t=fill:enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'`);
      filters.push(`drawtext=text='${esc(course_title)}':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=230:enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'`);
      // Decorative bottom line
      filters.push(`drawbox=x=340:y=300:w=600:h=3:color=0x4FC3F7:t=fill:enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'`);
      filters.push(`drawtext=text='AI Teaching Assistant':fontcolor=0x888888:fontsize=24:x=(w-text_w)/2:y=340:enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'`);

      vttLines.push(`${fmtTime(start)} --> ${fmtTime(end)}`);
      vttLines.push(part.text);
      vttLines.push('');

    } else if (part.type === 'summary') {
      // Summary slide
      filters.push(`drawbox=x=0:y=0:w=iw:h=ih:color=${SUMMARY_SLIDE_BG}:t=fill:enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'`);
      filters.push(`drawtext=text='Summary':fontcolor=0xCE93D8:fontsize=48:x=(w-text_w)/2:y=80:enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'`);
      filters.push(`drawbox=x=440:y=140:w=400:h=2:color=0xCE93D8:t=fill:enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'`);
      // List all section titles as summary
      let yPos = 180;
      sections.forEach((sec, si) => {
        filters.push(`drawtext=text='${esc("✓ " + sec.title)}':fontcolor=white:fontsize=28:x=200:y=${yPos}:enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'`);
        yPos += 45;
      });
      filters.push(`drawtext=text='Thank you for learning!':fontcolor=0x888888:fontsize=22:x=(w-text_w)/2:y=${Math.min(yPos + 30, 620)}:enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'`);

      vttLines.push(`${fmtTime(start)} --> ${fmtTime(end)}`);
      vttLines.push(part.text);
      vttLines.push('');

    } else {
      // Section slide
      const si = part.index;
      const sec = sections[si];
      const bg = SLIDE_BG[si % SLIDE_BG.length];
      const accent = ACCENT_COLORS[si % ACCENT_COLORS.length];

      // Background
      filters.push(`drawbox=x=0:y=0:w=iw:h=ih:color=${bg}:t=fill:enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'`);
      // Section number badge
      filters.push(`drawtext=text='${esc(`Section ${si + 1}`)}':fontcolor=0x666666:fontsize=18:x=60:y=30:enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'`);
      // Title
      filters.push(`drawtext=text='${esc(sec.title)}':fontcolor=${accent}:fontsize=42:x=(w-text_w)/2:y=70:enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'`);
      // Underline
      filters.push(`drawbox=x=100:y=125:w=1080:h=2:color=${accent}:t=fill:enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'`);

      // Bullet points
      let yPos = 160;
      (sec.bullet_points || []).forEach((bp, bi) => {
        const bullet = `•  ${bp}`;
        filters.push(`drawtext=text='${esc(bullet)}':fontcolor=white:fontsize=30:x=120:y=${yPos}:enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'`);
        yPos += 50;
      });

      // Narration text at bottom (smaller, dimmer)
      const wrappedNarr = sec.narration_text.length > 80
        ? sec.narration_text.substring(0, 77) + '...'
        : sec.narration_text;
      // Skip narration text overlay to keep slides clean

      // Progress bar at bottom
      const progress = (si + 1) / totalSections;
      const barWidth = Math.round(1280 * progress);
      filters.push(`drawbox=x=0:y=700:w=1280:h=20:color=0x1a1a1a:t=fill:enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'`);
      filters.push(`drawbox=x=0:y=700:w=${barWidth}:h=20:color=${accent}:t=fill:enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'`);
      // Page indicator
      filters.push(`drawtext=text='${si+1}/${totalSections}':fontcolor=0x888888:fontsize=18:x=w-70:y=30:enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'`);

      vttLines.push(`${fmtTime(start)} --> ${fmtTime(end)}`);
      vttLines.push(sec.narration_text);
      vttLines.push('');
    }

    t = end;
  }

  // Step 5: Write VTT
  const subtitlePath = path.join(OUTPUT_DIR, `${fileId}.vtt`);
  fs.writeFileSync(subtitlePath, vttLines.join('\n'), 'utf-8');

  // Step 6: Render video
  const videoPath = path.join(OUTPUT_DIR, `${fileId}.mp4`);
  const filterStr = filters.join(',');

  const args = ['-y',
    '-f', 'lavfi', '-i', `color=c=0x0a0a1a:s=1280x720:d=${totalDuration.toFixed(1)}:r=15`,
    '-i', fullAudioPath,
    '-vf', filterStr,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '64k', '-ar', '24000',
    '-shortest', '-movflags', '+faststart',
    videoPath
  ];

  await runFfmpeg(args);

  // Cleanup tmp
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch(e) {}

  console.log(`Done: ${fileId}, duration: ${totalDuration.toFixed(1)}s`);

  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  const baseUrl = `${proto}://${host}`;

  return {
    video_url: `${baseUrl}/files/${fileId}.mp4`,
    subtitle_url: `${baseUrl}/files/${fileId}.vtt`,
    supplementary_url: [],
  };
}

app.post('/generate', (req, res) => {
  console.log(`[${new Date().toISOString()}] Queued: ${req.body.request_id}`);
  new Promise((resolve, reject) => {
    queue.push({ resolve, reject, args: [req] });
    processQueue();
  })
  .then(result => res.json(result))
  .catch(err => {
    console.error('Error:', err.message);
    res.status(500).json({ error: err.message });
  });
});

const PORT = process.env.PORT || 3456;
app.listen(PORT, () => {
  console.log(`Teaching Monster API v3.0 running on port ${PORT}`);
  console.log(`OpenAI: ${_k ? 'configured' : 'NOT SET (will use fallback)'}`);
});

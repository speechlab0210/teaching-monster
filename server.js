const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { promisify } = require('util');
const { spawn } = require('child_process');

let MsEdgeTTS;
try { MsEdgeTTS = require('msedge-tts').default; } catch(e) { console.warn('msedge-tts not available'); }

const app = express();
app.use(express.json());

const FFMPEG = (() => {
  try { return require('child_process').execSync('which ffmpeg 2>/dev/null || where ffmpeg 2>nul').toString().trim(); } catch(e) {}
  try { return require('ffmpeg-static'); } catch(e) {}
  return 'ffmpeg';
})();
console.log('Using ffmpeg:', FFMPEG);

const OUTPUT_DIR = path.join(__dirname, 'output');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Request queue to prevent OOM (process one at a time)
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

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'teaching-monster-api', version: '2.1' });
});

// Teaching script generator
function generateScript(topic, persona) {
  const p = (persona || '').toLowerCase();
  const isSimple = p.includes('high school') || p.includes('beginner') || p.includes('first year') || p.includes('no calculus');
  const t = topic.toLowerCase();

  let sections;
  if (t.includes('neural') || t.includes('network')) {
    sections = isSimple ? [
      { title: 'Introduction to Neural Networks', text: `Hello! Today we will learn about Neural Networks. A neural network is like a computer brain that learns patterns, similar to how our brains work.` },
      { title: 'How Neurons Work', text: `Just like our brain has neurons connected together, artificial neural networks have nodes arranged in layers. Information flows from input, through hidden layers, to output.` },
      { title: 'Learning Process', text: `Neural networks learn by seeing many examples. Show it thousands of pictures of cats and dogs, and it learns to tell them apart. This process is called training.` },
      { title: 'Why It Matters', text: `Neural networks power amazing technologies like voice assistants, image recognition, and language translation. They find patterns that humans might miss.` },
      { title: 'Summary', text: `To summarize, neural networks are computer systems inspired by the human brain. They learn from data and are used in many exciting applications. Keep exploring!` }
    ] : [
      { title: 'Introduction to Neural Networks', text: `Welcome! In this lesson, we explore Neural Networks, a fundamental building block of modern artificial intelligence and deep learning.` },
      { title: 'Architecture', text: `Neural networks consist of interconnected layers of nodes. Each connection has a weight. Data flows forward through the network, transformed by activation functions at each layer.` },
      { title: 'Training with Backpropagation', text: `Networks learn through backpropagation. The algorithm computes gradients of the loss function with respect to each weight, then adjusts weights to minimize prediction errors.` },
      { title: 'Applications', text: `Neural networks excel at pattern recognition: image classification, natural language processing, speech recognition, and recommendation systems are common applications.` },
      { title: 'Summary', text: `In summary, neural networks are powerful function approximators that learn from data. Understanding their architecture and training process is essential for modern AI.` }
    ];
  } else if (t.includes('course') || t.includes('介紹') || t.includes('introduction')) {
    sections = [
      { title: 'Welcome to AI and Machine Learning', text: `Hello and welcome! This course will introduce you to the exciting world of artificial intelligence and machine learning.` },
      { title: 'What is AI?', text: `Artificial Intelligence is the field of computer science focused on creating systems that can perform tasks that normally require human intelligence, such as understanding language and recognizing images.` },
      { title: 'What is Machine Learning?', text: `Machine Learning is a subset of AI where computers learn patterns from data instead of being explicitly programmed. It is the driving force behind many modern AI applications.` },
      { title: 'Course Overview', text: `In this course, we will cover supervised learning, unsupervised learning, neural networks, and practical applications. Each topic builds on the previous one.` },
      { title: 'Getting Started', text: `To succeed in this course, stay curious and practice with real data. The best way to learn AI is by doing. Let us begin this exciting journey together!` }
    ];
  } else if (t.includes('equation') || t.includes('方程') || t.includes('algebra')) {
    sections = [
      { title: 'Introduction to Linear Equations', text: `Hello! Today we will learn about linear equations, one of the most fundamental concepts in mathematics and a building block for more advanced topics.` },
      { title: 'What is a Linear Equation?', text: `A linear equation is an equation where the highest power of the variable is one. For example, 2x plus 3 equals 7. The goal is to find the value of x that makes the equation true.` },
      { title: 'Solving Step by Step', text: `To solve a linear equation, we isolate the variable on one side. We can add, subtract, multiply, or divide both sides by the same number to keep the equation balanced.` },
      { title: 'Real World Examples', text: `Linear equations appear everywhere: calculating costs, converting temperatures, predicting growth rates. Understanding them gives you a powerful problem-solving tool.` },
      { title: 'Summary', text: `Remember, linear equations have the form a x plus b equals c. Solve by isolating x step by step. Practice makes perfect!` }
    ];
  } else {
    sections = [
      { title: `Introduction to ${topic}`, text: `Welcome! Today we will explore ${topic}. This is an important subject with many practical applications.` },
      { title: 'Core Concepts', text: `The foundation of ${topic} involves understanding its key principles and how different components work together as a system.` },
      { title: 'How It Works', text: `${topic} operates through a series of well-defined steps and processes. Each step builds upon the previous one to achieve the desired outcome.` },
      { title: 'Applications', text: `${topic} is applied in many real-world scenarios, from industry to research. Understanding these applications helps connect theory to practice.` },
      { title: 'Summary', text: `To wrap up, we have covered the basics of ${topic}. Continue exploring and practicing to deepen your understanding. Thank you for learning!` }
    ];
  }
  return sections;
}

// Generate TTS audio (returns path to audio file)
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

// Get audio duration using ffprobe
async function getAudioDuration(filePath) {
  return new Promise((resolve) => {
    const ffprobe = FFMPEG.replace('ffmpeg', 'ffprobe');
    const proc = spawn(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath]);
    let out = '';
    proc.stdout.on('data', d => out += d);
    proc.on('close', () => resolve(parseFloat(out) || 10));
    proc.on('error', () => resolve(10));
  });
}

// Run ffmpeg
function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    console.log('ffmpeg args:', args.join(' '));
    const proc = spawn(FFMPEG, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-300)}`));
    });
    proc.on('error', reject);
  });
}

// Simple color for each section
const COLORS = ['0x1a1a2e', '0x16213e', '0x0f3460', '0x1a1a2e', '0x16213e'];
const TITLE_COLORS = ['0xe94560', '0x00adb5', '0x48c9b0', '0xf39c12', '0xe94560'];

async function handleGenerate(req) {
  const { request_id, course_requirement, student_persona } = req.body;
  const fileId = request_id || uuidv4();
  console.log(`[${new Date().toISOString()}] Processing: ${fileId} - ${course_requirement}`);

  const sections = generateScript(course_requirement, student_persona);
  const fullText = sections.map(s => s.text).join(' ');

  // Step 1: Generate TTS audio
  const audioPath = path.join(OUTPUT_DIR, `${fileId}_audio.mp3`);
  let hasAudio = false;
  let totalDuration = 50; // default

  try {
    await generateTTS(fullText, audioPath);
    if (fs.existsSync(audioPath) && fs.statSync(audioPath).size > 100) {
      totalDuration = await getAudioDuration(audioPath);
      hasAudio = true;
      console.log(`TTS done, duration: ${totalDuration}s`);
    }
  } catch (e) {
    console.error('TTS failed:', e.message);
  }

  // Step 2: Calculate timing per section
  const secDuration = totalDuration / sections.length;

  // Step 3: Generate video with slides + audio in ONE ffmpeg command
  const videoPath = path.join(OUTPUT_DIR, `${fileId}.mp4`);
  const subtitlePath = path.join(OUTPUT_DIR, `${fileId}.vtt`);

  // Build drawtext filter chain (one filter per section with enable timing)
  let filters = [];
  let vttLines = ['WEBVTT', ''];
  let t = 0;

  sections.forEach((sec, i) => {
    const start = t;
    const end = t + secDuration;
    const bg = COLORS[i % COLORS.length];
    const titleColor = TITLE_COLORS[i % TITLE_COLORS.length];

    // Escape text for ffmpeg drawtext
    const escTitle = sec.title.replace(/:/g, '\\:').replace(/'/g, "\\'").replace(/\\/g, '\\\\');
    const escText = sec.text.replace(/:/g, '\\:').replace(/'/g, "\\'").replace(/\\/g, '\\\\');
    // Wrap text at ~50 chars
    const wrapped = escText.replace(/(.{1,50})([ ,.]|$)/g, '$1\n').trim();

    // Title text
    filters.push(`drawtext=text='${escTitle}':fontcolor=${titleColor}:fontsize=42:x=(w-text_w)/2:y=80:enable='between(t,${start.toFixed(1)},${end.toFixed(1)})'`);
    // Body text  
    filters.push(`drawtext=text='${wrapped}':fontcolor=white:fontsize=28:x=80:y=200:line_spacing=12:enable='between(t,${start.toFixed(1)},${end.toFixed(1)})'`);
    // Slide number
    filters.push(`drawtext=text='${i+1}/${sections.length}':fontcolor=0x888888:fontsize=20:x=w-80:y=h-40:enable='between(t,${start.toFixed(1)},${end.toFixed(1)})'`);

    // VTT subtitle
    const fmtTime = (s) => {
      const m = Math.floor(s / 60);
      const sec2 = (s % 60).toFixed(3);
      return `00:${String(m).padStart(2,'0')}:${sec2.padStart(6,'0')}`;
    };
    vttLines.push(`${fmtTime(start)} --> ${fmtTime(end)}`);
    vttLines.push(sec.text);
    vttLines.push('');

    t = end;
  });

  fs.writeFileSync(subtitlePath, vttLines.join('\n'), 'utf-8');

  // Build ffmpeg command
  const filterStr = filters.join(',');
  const args = ['-y'];

  if (hasAudio) {
    // Use audio as input + color background
    args.push('-f', 'lavfi', '-i', `color=c=0x0a0a1a:s=1280x720:d=${totalDuration.toFixed(1)}:r=15`);
    args.push('-i', audioPath);
    args.push('-vf', filterStr);
    args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p');
    args.push('-c:a', 'aac', '-b:a', '64k', '-ar', '24000');
    args.push('-shortest', '-movflags', '+faststart');
  } else {
    // Silent fallback
    args.push('-f', 'lavfi', '-i', `color=c=0x0a0a1a:s=1280x720:d=${totalDuration.toFixed(1)}:r=15`);
    args.push('-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono');
    args.push('-t', String(totalDuration.toFixed(1)));
    args.push('-vf', filterStr);
    args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p');
    args.push('-c:a', 'aac', '-shortest');
  }
  args.push(videoPath);

  await runFfmpeg(args);

  // Cleanup audio temp file
  try { if (hasAudio) fs.unlinkSync(audioPath); } catch(e) {}

  console.log(`Done: ${fileId}`);
  
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  const baseUrl = `${proto}://${host}`;

  return {
    video_url: `${baseUrl}/files/${fileId}.mp4`,
    subtitle_url: `${baseUrl}/files/${fileId}.vtt`,
    supplementary_url: []
  };
}

app.post('/generate', (req, res) => {
  console.log(`[${new Date().toISOString()}] Queued: ${req.body.request_id}`);
  
  // Queue the request
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
  console.log(`Teaching Monster API v2.1 running on port ${PORT}`);
  console.log(`Output dir: ${OUTPUT_DIR}`);
});

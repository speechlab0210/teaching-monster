const express = require('express');
const { execSync, exec: execCb } = require('child_process');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { promisify } = require('util');
const execAsync = promisify(execCb);

const app = express();
app.use(express.json());

// Use system ffmpeg if available, otherwise ffmpeg-static
const FFMPEG = process.env.FFMPEG_PATH || (() => {
  try { return require('child_process').execSync('which ffmpeg 2>/dev/null || where ffmpeg 2>nul').toString().trim(); } catch(e) {}
  try { return require('ffmpeg-static'); } catch(e) {}
  return 'ffmpeg';
})();
const OUTPUT_DIR = path.join(__dirname, 'output');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Serve generated files
app.use('/files', express.static(OUTPUT_DIR));

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'teaching-monster-api' });
});

// Main generate endpoint
app.post('/generate', async (req, res) => {
  try {
    const { request_id, course_requirement, student_persona } = req.body;
    console.log(`[${new Date().toISOString()}] Received request: ${request_id}`);
    console.log(`  course_requirement: ${course_requirement}`);
    console.log(`  student_persona: ${student_persona}`);

    const fileId = request_id || uuidv4();
    const videoFile = `${fileId}.mp4`;
    const subtitleFile = `${fileId}.vtt`;
    const videoPath = path.join(OUTPUT_DIR, videoFile);
    const subtitlePath = path.join(OUTPUT_DIR, subtitleFile);

    // Build the script text
    const scriptText = `You asked me to teach: ${course_requirement}. ` +
      `Student profile: ${student_persona || 'Not specified'}. ` +
      `This is a test video to verify API connectivity.`;

    // Create subtitle file (VTT)
    const vttContent = `WEBVTT

00:00:00.000 --> 00:00:10.000
${scriptText}
`;
    fs.writeFileSync(subtitlePath, vttContent, 'utf-8');

    // Escape text for ffmpeg drawtext
    const escapedText = scriptText
      .replace(/\\/g, '\\\\\\\\')
      .replace(/'/g, "'\\''")
      .replace(/:/g, '\\:')
      .replace(/\n/g, '\\n');

    // Escape text for ffmpeg drawtext filter
    // ffmpeg drawtext needs: \ : ' to be escaped
    const escaped = scriptText
      .replace(/\\/g, '\\\\')
      .replace(/:/g, '\\:')
      .replace(/'/g, "\\'");

    // Generate video with ffmpeg: black background + white text + silence, 10 seconds
    const args = [
      '-y',
      '-f', 'lavfi', '-i', 'color=c=black:s=1280x720:d=10:r=24',
      '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
      '-t', '10',
      '-vf', `drawtext=text='${escaped}':fontcolor=white:fontsize=26:x=50:y=(h-text_h)/2:line_spacing=10`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-shortest',
      videoPath
    ];
    
    console.log('Running ffmpeg with args:', args.join(' '));
    await new Promise((resolve, reject) => {
      const proc = require('child_process').spawn(FFMPEG, args, { stdio: ['pipe', 'pipe', 'pipe'] });
      let stderr = '';
      proc.stderr.on('data', d => { stderr += d.toString(); });
      proc.on('close', code => {
        // ffmpeg often writes to stderr even on success, check if file exists
        if (fs.existsSync(videoPath) && fs.statSync(videoPath).size > 0) {
          resolve();
        } else {
          reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-500)}`));
        }
      });
      proc.on('error', reject);
    });
    console.log('Video generated successfully');

    // Build response with base URL (will be set by tunnel)
    const proto = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const baseUrl = `${proto}://${host}`;

    const response = {
      video_url: `${baseUrl}/files/${videoFile}`,
      subtitle_url: `${baseUrl}/files/${subtitleFile}`,
      supplementary_url: []
    };

    console.log('Response:', JSON.stringify(response, null, 2));
    res.json(response);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3456;
app.listen(PORT, () => {
  console.log(`Teaching Monster API running on port ${PORT}`);
});

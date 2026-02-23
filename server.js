const express = require('express');
const { execSync, exec: execCb } = require('child_process');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { promisify } = require('util');
const MsEdgeTTS = require('msedge-tts').default;
const execAsync = promisify(execCb);

const app = express();
app.use(express.json());

// Use system ffmpeg if available, otherwise ffmpeg-static
const FFMPEG = process.env.FFMPEG_PATH || (() => {
  try { 
    // Try to use system ffmpeg first
    const systemFfmpeg = require('child_process').execSync('which ffmpeg 2>/dev/null || where ffmpeg 2>nul').toString().trim(); 
    if (systemFfmpeg) return systemFfmpeg;
  } catch(e) {}
  try { 
    // Use ffmpeg-static as fallback
    const ffmpegStatic = require('ffmpeg-static');
    console.log('Using ffmpeg-static:', ffmpegStatic);
    return ffmpegStatic; 
  } catch(e) {}
  return 'ffmpeg';
})();
const OUTPUT_DIR = path.join(__dirname, 'output');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Serve generated files
app.use('/files', express.static(OUTPUT_DIR));

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'teaching-monster-api', version: '2.0' });
});

// Template-based script generator
function generateTeachingScript(courseRequirement, studentPersona) {
  // Determine complexity level based on student persona
  const isSimple = (studentPersona || '').toLowerCase().includes('high school') || 
                   (studentPersona || '').toLowerCase().includes('beginner') ||
                   (studentPersona || '').toLowerCase().includes('first year');
  
  const isAdvanced = (studentPersona || '').toLowerCase().includes('graduate') || 
                     (studentPersona || '').toLowerCase().includes('phd') ||
                     (studentPersona || '').toLowerCase().includes('advanced');

  // Clean up the course requirement
  const topic = courseRequirement.replace(/[^\w\s]/g, '').trim();
  
  const script = {
    title: `Learning ${topic}`,
    sections: []
  };

  // Introduction
  let intro = '';
  if (isSimple) {
    intro = `Hello! Today we're going to learn about ${topic}. Don't worry if it seems complicated at first - we'll break it down into simple pieces that are easy to understand.`;
  } else if (isAdvanced) {
    intro = `Welcome to this advanced discussion on ${topic}. We'll explore the theoretical foundations and practical applications in depth.`;
  } else {
    intro = `Welcome! In this lesson, we'll explore ${topic}. We'll cover the key concepts and see how they work together.`;
  }
  
  script.sections.push({
    type: 'intro',
    title: 'Introduction',
    content: intro,
    duration: 8
  });

  // Generate 3-4 key points based on common educational topics
  const keyPoints = generateKeyPoints(topic, isSimple, isAdvanced);
  keyPoints.forEach((point, index) => {
    script.sections.push({
      type: 'content',
      title: `Key Point ${index + 1}: ${point.title}`,
      content: point.content,
      duration: point.content.length > 200 ? 15 : 12
    });
  });

  // Summary
  let summary = '';
  if (isSimple) {
    summary = `Great job! We've covered the basics of ${topic}. Remember, learning takes practice, so don't hesitate to review these concepts again.`;
  } else if (isAdvanced) {
    summary = `To conclude, we've examined the complex aspects of ${topic} and their implications. Consider how these concepts apply to your research or professional work.`;
  } else {
    summary = `That wraps up our lesson on ${topic}. We've covered the essential concepts that will help you understand this subject better.`;
  }
  
  script.sections.push({
    type: 'summary',
    title: 'Summary',
    content: summary,
    duration: 6
  });

  return script;
}

// Generate key points based on topic (simple template system)
function generateKeyPoints(topic, isSimple, isAdvanced) {
  const topicLower = topic.toLowerCase();
  
  // Neural Networks
  if (topicLower.includes('neural') || topicLower.includes('network')) {
    if (isSimple) {
      return [
        {
          title: 'What is a Neural Network?',
          content: 'A neural network is like a computer brain that learns patterns. Just like how our brain has neurons that connect to each other, artificial neural networks have nodes that pass information around.'
        },
        {
          title: 'How They Learn',
          content: 'Neural networks learn by looking at lots of examples. For instance, if you show it thousands of pictures of cats and dogs, it learns to tell them apart.'
        },
        {
          title: 'Why They\'re Useful',
          content: 'Neural networks are great at finding patterns in data that would be hard for humans to spot. They\'re used in things like voice recognition and image classification.'
        }
      ];
    } else if (isAdvanced) {
      return [
        {
          title: 'Architecture and Mathematical Foundations',
          content: 'Neural networks are composed of interconnected nodes arranged in layers, with each connection having an associated weight. The forward pass computes activations using matrix operations and nonlinear activation functions.'
        },
        {
          title: 'Backpropagation Algorithm',
          content: 'Training involves computing gradients via backpropagation, which applies the chain rule to calculate how changes in weights affect the loss function. This enables gradient descent optimization.'
        },
        {
          title: 'Regularization and Optimization',
          content: 'Modern neural networks employ various regularization techniques like dropout, batch normalization, and weight decay to prevent overfitting and improve generalization performance.'
        }
      ];
    } else {
      return [
        {
          title: 'Network Structure',
          content: 'Neural networks consist of layers of interconnected nodes. Information flows from input through hidden layers to output, with each connection having a weight that determines influence.'
        },
        {
          title: 'Training Process',
          content: 'Networks learn by adjusting weights based on training data. They use backpropagation to calculate errors and update weights to minimize prediction mistakes.'
        },
        {
          title: 'Applications',
          content: 'Neural networks excel at pattern recognition tasks like image classification, natural language processing, and recommendation systems.'
        }
      ];
    }
  }
  
  // Machine Learning
  if (topicLower.includes('machine learning') || topicLower.includes('ml')) {
    if (isSimple) {
      return [
        {
          title: 'What is Machine Learning?',
          content: 'Machine learning is teaching computers to learn from data instead of programming them with specific instructions. It\'s like showing a child many examples until they understand the pattern.'
        },
        {
          title: 'Types of Learning',
          content: 'There are three main types: supervised learning uses examples with right answers, unsupervised learning finds hidden patterns, and reinforcement learning learns through trial and error.'
        },
        {
          title: 'Everyday Examples',
          content: 'Machine learning is everywhere! It powers Netflix recommendations, spam email detection, voice assistants like Siri, and even helps doctors diagnose diseases.'
        }
      ];
    } else {
      return [
        {
          title: 'Algorithmic Approaches',
          content: 'Machine learning encompasses supervised, unsupervised, and reinforcement learning paradigms, each with distinct algorithms like decision trees, clustering methods, and policy gradient approaches.'
        },
        {
          title: 'Model Evaluation',
          content: 'Proper evaluation involves train-validation-test splits, cross-validation, and metrics appropriate to the problem type, such as accuracy, precision, recall, or mean squared error.'
        },
        {
          title: 'Feature Engineering',
          content: 'Success often depends on feature selection and engineering, including dimensionality reduction, normalization, and domain-specific transformations.'
        }
      ];
    }
  }
  
  // Generic fallback for any topic
  return [
    {
      title: 'Understanding the Basics',
      content: `The foundation of ${topic} involves understanding its core principles and how they work together to form a complete system.`
    },
    {
      title: 'Key Components',
      content: `${topic} has several important components that each play a specific role in achieving the overall objectives and functionality.`
    },
    {
      title: 'Practical Applications',
      content: `${topic} is used in many real-world scenarios where its principles can solve problems and create value in various domains.`
    }
  ];
}

// Generate TTS audio
async function generateAudio(text, outputPath) {
  try {
    const tts = new MsEdgeTTS();
    await tts.setMetadata('en-US-AriaNeural', MsEdgeTTS.OUTPUT_FORMAT.WEBM_24KHZ_16BIT_MONO_OPUS);
    
    const readable = tts.toStream(text);
    const writeStream = fs.createWriteStream(outputPath);
    
    return new Promise((resolve, reject) => {
      readable.pipe(writeStream);
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
      readable.on('error', reject);
    });
  } catch (error) {
    console.error('TTS error:', error);
    throw error;
  }
}

// Generate slide image with ffmpeg
async function generateSlide(title, content, outputPath, slideIndex, totalSlides) {
  // Create solid background colors (simpler than gradients for compatibility)
  const colors = [
    'darkblue',   // dark blue
    'navy',       // navy blue
    'darkslateblue', // purple-blue
    'midnightblue',  // midnight blue
  ];
  
  const color = colors[slideIndex % colors.length];
  
  // Truncate and clean text for better compatibility
  const cleanTitle = title.substring(0, 80).replace(/['"\\:,()\[\]]/g, '');
  const cleanContent = content.substring(0, 200).replace(/['"\\:,()\[\]]/g, '');

  // Simple approach: create title slide first
  const titleArgs = [
    '-y',
    '-f', 'lavfi', '-i', `color=c=${color}:s=1280x720:d=1`,
    '-vf', `drawtext=text='${cleanTitle}':fontcolor=white:fontsize=32:x=(w-text_w)/2:y=150`,
    '-frames:v', '1',
    outputPath
  ];

  try {
    await new Promise((resolve, reject) => {
      const proc = require('child_process').spawn(FFMPEG, titleArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
      let stderr = '';
      proc.stderr.on('data', d => { stderr += d.toString(); });
      proc.on('close', code => {
        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
          resolve();
        } else {
          reject(new Error(`title slide failed (${code}): ${stderr.slice(-200)}`));
        }
      });
      proc.on('error', reject);
    });

    // Add content text if it exists and is different from title
    if (cleanContent && cleanContent !== cleanTitle) {
      const tempPath = outputPath.replace('.png', '_temp.png');
      const contentArgs = [
        '-y',
        '-i', outputPath,
        '-vf', `drawtext=text='${cleanContent}':fontcolor=lightgray:fontsize=20:x=100:y=300`,
        tempPath
      ];

      await new Promise((resolve, reject) => {
        const proc = require('child_process').spawn(FFMPEG, contentArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
        let stderr = '';
        proc.stderr.on('data', d => { stderr += d.toString(); });
        proc.on('close', code => {
          if (fs.existsSync(tempPath) && fs.statSync(tempPath).size > 0) {
            fs.renameSync(tempPath, outputPath);
            resolve();
          } else {
            console.warn('Content overlay failed, using title-only slide');
            resolve();
          }
        });
        proc.on('error', () => {
          console.warn('Content overlay failed, using title-only slide');
          resolve();
        });
      });
    }
  } catch (error) {
    // Fallback: create a very simple slide
    console.warn('Slide generation failed, creating fallback slide:', error.message);
    const fallbackArgs = [
      '-y',
      '-f', 'lavfi', '-i', `color=c=${color}:s=1280x720:d=1`,
      '-frames:v', '1',
      outputPath
    ];
    
    await new Promise((resolve, reject) => {
      const proc = require('child_process').spawn(FFMPEG, fallbackArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
      proc.on('close', code => code === 0 ? resolve() : reject(new Error(`fallback failed: ${code}`)));
      proc.on('error', reject);
    });
  }
}

// Generate VTT subtitles with proper timing
function generateVTT(script, outputPath) {
  let vttContent = 'WEBVTT\n\n';
  let currentTime = 0;
  
  script.sections.forEach((section, index) => {
    const startTime = formatTime(currentTime);
    const endTime = formatTime(currentTime + section.duration);
    
    vttContent += `${startTime} --> ${endTime}\n`;
    vttContent += `${section.content}\n\n`;
    
    currentTime += section.duration;
  });
  
  fs.writeFileSync(outputPath, vttContent, 'utf-8');
  return currentTime; // total duration
}

// Format time for VTT (HH:MM:SS.mmm)
function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toFixed(3).padStart(6, '0')}`;
}

// Get audio duration using ffprobe
async function getAudioDuration(audioPath) {
  try {
    const result = await execAsync(`${FFMPEG.replace('ffmpeg', 'ffprobe')} -i "${audioPath}" -show_entries format=duration -v quiet -of csv="p=0"`);
    return parseFloat(result.stdout.trim());
  } catch (error) {
    console.error('Error getting audio duration:', error);
    return 30; // fallback
  }
}

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
    const audioFile = `${fileId}.webm`;
    
    const videoPath = path.join(OUTPUT_DIR, videoFile);
    const subtitlePath = path.join(OUTPUT_DIR, subtitleFile);
    const audioPath = path.join(OUTPUT_DIR, audioFile);

    // Generate teaching script
    console.log('Generating teaching script...');
    const script = generateTeachingScript(course_requirement, student_persona);
    
    // Create full text for TTS
    const fullText = script.sections.map(s => s.content).join(' ');
    
    // Generate VTT subtitles
    console.log('Generating subtitles...');
    const totalDuration = generateVTT(script, subtitlePath);
    
    // Generate TTS audio
    console.log('Generating TTS audio...');
    let hasAudio = true;
    try {
      await generateAudio(fullText, audioPath);
      console.log('TTS audio generated successfully');
    } catch (error) {
      console.error('TTS failed, will use silent audio:', error);
      hasAudio = false;
    }
    
    // Get actual audio duration or use calculated duration
    let audioDuration = totalDuration;
    if (hasAudio && fs.existsSync(audioPath)) {
      try {
        audioDuration = await getAudioDuration(audioPath);
        console.log(`Audio duration: ${audioDuration} seconds`);
      } catch (error) {
        console.error('Could not get audio duration, using calculated:', totalDuration);
      }
    }
    
    // Generate slide images
    console.log('Generating slides...');
    const slideFiles = [];
    for (let i = 0; i < script.sections.length; i++) {
      const section = script.sections[i];
      const slidePath = path.join(OUTPUT_DIR, `${fileId}_slide_${i}.png`);
      
      try {
        await generateSlide(section.title, section.content, slidePath, i, script.sections.length);
        slideFiles.push(slidePath);
        console.log(`Generated slide ${i + 1}/${script.sections.length}`);
      } catch (error) {
        console.error(`Error generating slide ${i}:`, error);
        // Create a simple fallback slide
        const simpleArgs = [
          '-y', '-f', 'lavfi', '-i', 'color=c=darkblue:s=1280x720:d=1',
          '-vf', `drawtext=text='${section.title.replace(/'/g, "\\'")}':fontcolor=white:fontsize=24:x=(w-text_w)/2:y=(h-text_h)/2`,
          '-frames:v', '1', slidePath
        ];
        await new Promise((resolve, reject) => {
          const proc = require('child_process').spawn(FFMPEG, simpleArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
          proc.on('close', code => code === 0 ? resolve() : reject(new Error(`fallback slide failed: ${code}`)));
          proc.on('error', reject);
        });
        slideFiles.push(slidePath);
      }
    }
    
    // Create video from slides with timing
    console.log('Creating video...');
    const slideDurations = script.sections.map(s => s.duration);
    const totalCalcDuration = slideDurations.reduce((a, b) => a + b, 0);
    
    // Adjust slide durations to match audio if needed
    const durationScale = audioDuration / totalCalcDuration;
    const adjustedDurations = slideDurations.map(d => d * durationScale);
    
    // Create video input list for ffmpeg
    const inputList = slideFiles.map((file, i) => `file '${path.resolve(file)}'`).join('\n');
    const listPath = path.join(OUTPUT_DIR, `${fileId}_list.txt`);
    fs.writeFileSync(listPath, inputList);
    
    // Build ffmpeg command for video creation
    let videoArgs = ['-y'];
    
    // Add slides with durations
    slideFiles.forEach((slideFile, i) => {
      videoArgs.push('-loop', '1', '-t', adjustedDurations[i].toString(), '-i', slideFile);
    });
    
    // Add audio if available
    if (hasAudio && fs.existsSync(audioPath)) {
      videoArgs.push('-i', audioPath);
    } else {
      // Generate silent audio
      videoArgs.push('-f', 'lavfi', '-i', `anullsrc=r=44100:cl=stereo:d=${audioDuration}`);
    }
    
    // Set up complex filter for concatenating video
    let filterComplex = slideFiles.map((_, i) => `[${i}:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24[v${i}]`).join(';');
    filterComplex += `;${slideFiles.map((_, i) => `[v${i}]`).join('')}concat=n=${slideFiles.length}:v=1:a=0[outv]`;
    
    videoArgs.push('-filter_complex', filterComplex);
    videoArgs.push('-map', '[outv]');
    videoArgs.push('-map', `${slideFiles.length}:a`); // audio stream
    videoArgs.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p');
    videoArgs.push('-c:a', 'aac', '-ar', '44100');
    videoArgs.push('-shortest');
    videoArgs.push(videoPath);
    
    console.log('Running ffmpeg for video creation...');
    await new Promise((resolve, reject) => {
      const proc = require('child_process').spawn(FFMPEG, videoArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
      let stderr = '';
      proc.stderr.on('data', d => { stderr += d.toString(); });
      proc.on('close', code => {
        if (fs.existsSync(videoPath) && fs.statSync(videoPath).size > 0) {
          console.log('Video created successfully');
          resolve();
        } else {
          reject(new Error(`video creation failed (${code}): ${stderr.slice(-500)}`));
        }
      });
      proc.on('error', reject);
    });
    
    // Cleanup temporary files
    slideFiles.forEach(file => {
      try { fs.unlinkSync(file); } catch(e) {}
    });
    try { fs.unlinkSync(listPath); } catch(e) {}
    try { fs.unlinkSync(audioPath); } catch(e) {}

    // Build response with base URL
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
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

const PORT = process.env.PORT || 3456;
app.listen(PORT, () => {
  console.log(`Teaching Monster API v2.0 running on port ${PORT}`);
});
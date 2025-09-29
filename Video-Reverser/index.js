import express from 'express';
import multer from 'multer';
import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';

// Set FFmpeg and FFprobe paths
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

const app = express();
const port = 3000;

// Derive __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Directories
const uploadsDir = path.join(__dirname, 'uploads');
const reversedVideosDir = path.join(__dirname, 'reversed_videos');
[uploadsDir, reversedVideosDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

// Set up multer with increased file size limits
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const name = path.basename(file.originalname, ext);
        cb(null, `${name}-original-${Date.now()}${ext}`);
    }
});
const upload = multer({ 
    storage,
    limits: {
        fileSize: 500 * 1024 * 1024, // 500MB limit
        fieldSize: 500 * 1024 * 1024 // 500MB field size limit
    }
});

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '500mb' })); // For fetch POSTs with application/json
app.use(express.text({ type: 'text/plain', limit: '500mb' })); // For navigator.sendBeacon
app.use(express.urlencoded({ extended: true, limit: '500mb' })); // For form data
app.use('/uploads', express.static(uploadsDir));
app.use('/reversed_videos', express.static(reversedVideosDir));

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/upload', (req, res) => {
    upload.single('video')(req, res, (err) => {
        if (err) {
            console.error('Upload error:', err);
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({ 
                    success: false, 
                    message: 'File too large. Maximum size is 500MB.' 
                });
            }
            return res.status(400).json({ 
                success: false, 
                message: 'Upload error: ' + err.message 
            });
        }
        
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No video file uploaded.' });
        }

    const inputPath = req.file.path;
        const originalVideoUrl = `/uploads/${path.basename(inputPath)}`;
        const outputFileName = `reversed-${Date.now()}.mp4`;
        const outputPath = path.join(reversedVideosDir, outputFileName);

        // Set a longer timeout for large file processing
        req.setTimeout(30 * 60 * 1000); // 30 minutes
        res.setTimeout(30 * 60 * 1000); // 30 minutes

        ffmpeg(inputPath)
            .videoFilters('reverse')
            .audioFilters('areverse')
            .on('start', cmd => console.log('FFmpeg command:', cmd))
            .on('progress', progress => {
                console.log('Processing: ' + progress.percent + '% done');
            })
            .on('end', () => {
                console.log('Video reversing finished.');
                res.json({
                    success: true,
                    message: 'Video reversed successfully!',
                    originalVideoUrl,
                    reversedVideoUrl: `/reversed_videos/${outputFileName}`
                });
            })
            .on('error', err => {
                console.error('Error during processing:', err.message);
                fs.unlink(inputPath, err => {
                    if (err) console.error('Error deleting input file:', err);
                });
                res.status(500).json({ success: false, message: 'Error processing video: ' + err.message });
            })
            .save(outputPath);
    });
});

// --- Cleanup Endpoint ---
app.post('/cleanup-video', (req, res) => {
    let body = {};
    try {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch (err) {
        console.warn('Invalid cleanup request body:', err);
        return res.status(400).send('Invalid request body');
    }

    const { originalVideoUrl, reversedVideoUrl } = body || {};

    if (originalVideoUrl) {
        const filePath = path.join(uploadsDir, path.basename(originalVideoUrl));
        fs.unlink(filePath, err => {
            if (err) console.error(`Error deleting original file ${filePath}:`, err);
            else console.log(`Deleted original file: ${filePath}`);
        });
    }

    if (reversedVideoUrl) {
        const filePath = path.join(reversedVideosDir, path.basename(reversedVideoUrl));
        fs.unlink(filePath, err => {
            if (err) console.error(`Error deleting reversed file ${filePath}:`, err);
            else console.log(`Deleted reversed file: ${filePath}`);
        });
    }

    res.status(200).send('Cleanup request received.');
});

// --- Scheduled Cleanup ---
const CLEANUP_INTERVAL = 60 * 60 * 1000;  // 1 hour cleanup interval
const FILE_AGE_THRESHOLD = 24 * 60 * 60 * 1000; // 24 hours

function cleanupOldFiles(dir, thresholdMs) {
    const now = Date.now();
    fs.readdir(dir, (err, files) => {
        if (err) return console.error(`Error reading ${dir}:`, err);
        files.forEach(file => {
            const filePath = path.join(dir, file);
            fs.stat(filePath, (err, stats) => {
                if (!err && stats.isFile() && now - stats.mtimeMs > thresholdMs) {
                    fs.unlink(filePath, err => {
                        if (err) console.error(`Error deleting ${filePath}:`, err);
                        else console.log(`Deleted old file: ${filePath}`);
                    });
                }
            });
        });
    });
}
setInterval(() => {
    cleanupOldFiles(uploadsDir, FILE_AGE_THRESHOLD);
    cleanupOldFiles(reversedVideosDir, FILE_AGE_THRESHOLD);
}, CLEANUP_INTERVAL);
cleanupOldFiles(uploadsDir, FILE_AGE_THRESHOLD);
cleanupOldFiles(reversedVideosDir, FILE_AGE_THRESHOLD);

// --- New: Cleanup all files function ---
function cleanupAllFiles() {
    const deleteAllFilesInDir = (dirPath) => {
        fs.readdir(dirPath, (err, files) => {
            if (err) return console.error(`Error reading ${dirPath}:`, err);
            files.forEach(file => {
                const filePath = path.join(dirPath, file);
                fs.unlink(filePath, err => {
                    if (err) console.error(`Failed to delete ${filePath}:`, err);
                    else console.log(`Deleted file: ${filePath}`);
                });
            });
        });
    };

    deleteAllFilesInDir(uploadsDir);
    deleteAllFilesInDir(reversedVideosDir);
}

// --- Start Server ---
app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);

    // Run cleanup on startup
    console.log('Performing startup cleanup...');
    cleanupAllFiles();

    // Run cleanup every 10 minutes
    setInterval(() => {
        console.log('Performing scheduled cleanup (every 10 minutes)...');
        cleanupAllFiles();
    }, 10 * 60 * 1000);
});

// --- Optional manual cleanup endpoint ---
app.post('/cleanup-all', (req, res) => {
    cleanupAllFiles();
    res.status(200).json({ success: true, message: 'All files deleted from uploads and reversed_videos.' });
});

// --- Error Handling ---
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public', 'error.html'));
});
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).sendFile(path.join(__dirname, 'public', 'error.html'));
});

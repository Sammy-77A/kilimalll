const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const {
  R2_ACCOUNT_ID,
  R2_BUCKET = 'kilimalll',
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
} = process.env;

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.error('❌ Missing required R2 environment variables in .env file!');
  console.error('Please ensure R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY are set.');
  process.exit(1);
}

const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
};

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

function getFiles(dirPath, arrayOfFiles = []) {
  if (!fs.existsSync(dirPath)) return arrayOfFiles;
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

async function uploadFile(filePath, publicDir) {
  const relativePath = path.relative(publicDir, filePath).replace(/\\/g, '/');
  const fileStream = fs.createReadStream(filePath);
  const contentType = getContentType(filePath);

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: relativePath,
    Body: fileStream,
    ContentType: contentType,
  });

  try {
    await s3Client.send(command);
    console.log(`✅ Uploaded: ${relativePath} (${contentType})`);
  } catch (err) {
    console.error(`❌ Failed to upload ${relativePath}:`, err.message);
  }
}

async function main() {
  const publicDir = path.join(__dirname, '..', 'public');
  const targetDirs = ['images', 'fonts', 'listing'];

  console.log(`🚀 Starting Cloudflare R2 upload to bucket "${R2_BUCKET}"...`);
  
  for (const dir of targetDirs) {
    const fullDirPath = path.join(publicDir, dir);
    const files = getFiles(fullDirPath);
    console.log(`📦 Found ${files.length} files in public/${dir}`);
    for (const file of files) {
      await uploadFile(file, publicDir);
    }
  }

  console.log('✨ Cloudflare R2 upload completed!');
}

main().catch(console.error);

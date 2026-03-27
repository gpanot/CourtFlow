#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');

// Generate a self-signed certificate
const { execSync } = require('child_process');

function generateCert() {
  try {
    // Create certs directory if it doesn't exist
    if (!fs.existsSync('./certs')) {
      fs.mkdirSync('./certs');
    }

    // Generate certificate using OpenSSL (built-in on macOS)
    if (process.platform === 'darwin') {
      execSync(`
        openssl req -x509 -newkey rsa:4096 -keyout certs/key.pem -out certs/cert.pem -days 365 -nodes \
          -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost" \
          -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
      `, { stdio: 'inherit' });
    } else {
      // For other platforms, try to use openssl if available
      execSync(`
        openssl req -x509 -newkey rsa:4096 -keyout certs/key.pem -out certs/cert.pem -days 365 -nodes \
          -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost" \
          -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
      `, { stdio: 'inherit' });
    }
    
    console.log('✅ HTTPS certificate generated successfully');
  } catch (error) {
    console.error('❌ Failed to generate certificate:', error.message);
    process.exit(1);
  }
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--generate-cert')) {
    generateCert();
    return;
  }

  // Check if certificate exists
  if (!fs.existsSync('./certs/cert.pem') || !fs.existsSync('./certs/key.pem')) {
    console.log('🔐 Generating HTTPS certificate...');
    generateCert();
  }

  console.log('🚀 Starting CourtFlow with HTTPS...');
  console.log('📋 Open https://localhost:3000 in your browser');
  console.log('⚠️  Accept the security warning (this is normal for localhost HTTPS)');
  
  // Start the Next.js dev server with HTTPS
  const nextDev = spawn('npm', ['run', 'dev'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'development',
      HTTPS: 'true',
      SSL_CRT_FILE: path.resolve('./certs/cert.pem'),
      SSL_KEY_FILE: path.resolve('./certs/key.pem')
    }
  });

  nextDev.on('close', (code) => {
    console.log(`Next.js dev server exited with code ${code}`);
  });
}

if (require.main === module) {
  main();
}

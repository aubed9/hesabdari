#!/usr/bin/env bash
set -e

echo "🚀 [Deploy] Deploying ARAYESHI Retail ERP..."
git pull origin main
npm install --omit=dev
npm run migrate

if command -v pm2 &> /dev/null; then
    pm2 restart ecosystem.config.js --update-env || pm2 start ecosystem.config.js
else
    echo "PM2 not detected. Start with: npm start"
fi

echo "✅ [Deploy] Deployment completed successfully on port 4200!"

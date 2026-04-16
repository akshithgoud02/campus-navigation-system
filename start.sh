#!/bin/bash
echo ""
echo " ============================================"
echo "  CampusNav — MySQL Edition"
echo " ============================================"
echo ""
cd "$(dirname "$0")/backend"
echo " [1] Installing dependencies..."
npm install
echo " [2] Setting up MySQL database..."
npm run setup
echo " [3] Starting server at http://localhost:3000"
npm start

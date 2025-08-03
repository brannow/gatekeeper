#!/bin/bash

# GitHub Release Downloader for Gatekeeper PWA
# Usage: ./github-download.sh <tag>
# Example: ./github-download.sh 1.0.0

set -e

# Configuration
REPO="brannow/gatekeeper"
ASSET_NAME="gatekeeper-pwa-release.tar.gz"

# Load environment variables from .env file
if [ -f .env ]; then
    echo "📄 Loading .env file..."
    export $(grep -v '^#' .env | xargs)
else
    echo "⚠️  Warning: .env file not found. Create one with GITHUB_TOKEN=your_token"
fi

# Check if tag is provided
if [ $# -eq 0 ]; then
    echo "Usage: $0 <tag>"
    echo "Example: $0 1.0.0"
    echo ""
    echo "Required: Create .env file with:"
    echo "  GITHUB_TOKEN=your_github_token_here"
    exit 1
fi

TAG="$1"

# Check for GitHub token
if [ -z "$GITHUB_TOKEN" ]; then
    echo "❌ Error: GITHUB_TOKEN not found"
    echo "💡 Create .env file with: GITHUB_TOKEN=your_token_here"
    echo "🔐 Get token at: https://github.com/settings/tokens"
    exit 1
fi

DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${TAG}/${ASSET_NAME}"

echo "🔍 Downloading Gatekeeper PWA release ${TAG}..."
echo "📦 Source: ${DOWNLOAD_URL}"

# Download the release with authentication
if command -v curl >/dev/null 2>&1; then
    curl -L -H "Authorization: token ${GITHUB_TOKEN}" -o "${ASSET_NAME}" "${DOWNLOAD_URL}"
elif command -v wget >/dev/null 2>&1; then
    wget --header="Authorization: token ${GITHUB_TOKEN}" -O "${ASSET_NAME}" "${DOWNLOAD_URL}"
else
    echo "❌ Error: Neither curl nor wget found. Please install one of them."
    exit 1
fi

# Verify download
if [ ! -f "${ASSET_NAME}" ]; then
    echo "❌ Error: Download failed. File not found: ${ASSET_NAME}"
    exit 1
fi

echo "✅ Download completed: ${ASSET_NAME}"

# Extract and replace files
echo "📂 Extracting release files..."
tar -xzf "${ASSET_NAME}"

# Cleanup
rm "${ASSET_NAME}"

echo "🚀 Gatekeeper PWA ${TAG} extracted successfully!"
echo ""
echo "📋 Files extracted:"
echo "   - dist/ (PWA application)"
echo "   - nginx.conf (Nginx configuration)"
echo "   - docker-compose.yaml (Production setup)"
echo ""
echo "💡 To start the application:"
echo "   docker compose up -d"
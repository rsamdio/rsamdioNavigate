#!/usr/bin/env node

/**
 * NAVIGATE Search Engine Push Engine - IndexNow Protocol
 * Discovers canonical routes and Edge catalog guides, then submits them to
 * participating search engines (Microsoft Bing, Yandex, Seznam.cz, Naver, Yep).
 *
 * Usage:
 *   node scripts/submit-indexnow.js                 # Submit all canonical URLs
 *   node scripts/submit-indexnow.js --dry-run       # Preview discovered URLs without sending
 *   node scripts/submit-indexnow.js --url=<url>     # Submit a single URL
 *   node scripts/submit-indexnow.js --build         # Netlify CI build hook (production-only, non-blocking)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const INDEXNOW_API_ENDPOINT = 'https://api.indexnow.org/indexnow';
const HOST = 'navigate.rsamdio.org';
const KEY = 'e4b54e7e62a343df89961d1ea009e530';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const EDGE_CATALOG_URL = 'https://nav.rsamdio.org/demos/catalog.json';

// Parse CLI Flags
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isBuild = args.includes('--build');
const singleUrlArg = args.find((a) => a.startsWith('--url='));
const singleUrl = singleUrlArg ? singleUrlArg.split('=')[1].trim() : null;

async function discoverUrls() {
  const urls = new Set();

  // 1. Read static routes from sitemap.xml
  const sitemapCandidates = [
    path.join(rootDir, 'packages/client/public/sitemap.xml'),
    path.join(rootDir, 'packages/client/dist/sitemap.xml')
  ];

  for (const sitemapPath of sitemapCandidates) {
    if (fs.existsSync(sitemapPath)) {
      try {
        const content = fs.readFileSync(sitemapPath, 'utf8');
        const locRegex = /<loc>\s*(https?:\/\/[^\s<]+)\s*<\/loc>/g;
        let match;
        while ((match = locRegex.exec(content)) !== null) {
          urls.add(match[1].trim());
        }
        break;
      } catch (err) {
        console.warn(`Could not read sitemap at ${sitemapPath}:`, err.message);
      }
    }
  }

  // Ensure core static routes exist as fallbacks
  urls.add(`https://${HOST}/`);
  urls.add(`https://${HOST}/privacy`);
  urls.add(`https://${HOST}/terms`);

  // 2. Discover live walkthroughs from Cloudflare R2 Edge Catalog
  try {
    const res = await fetch(EDGE_CATALOG_URL, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const catalog = await res.json();
      if (Array.isArray(catalog)) {
        for (const item of catalog) {
          const slugOrId = item.slug || item.id;
          if (slugOrId) {
            urls.add(`https://${HOST}/view/${slugOrId}`);
          }
        }
      }
    }
  } catch {
    // Edge catalog might be empty or network offline during local testing
  }

  return Array.from(urls).sort();
}

async function main() {
  console.log('🚀 IndexNow Push Protocol for NAVIGATE\n');

  // Guard for CI / Netlify builds: only submit on production context
  if (isBuild) {
    const context = process.env.CONTEXT;
    if (context && context !== 'production') {
      console.log(`ℹ️  Skipping IndexNow submission: Netlify build context is "${context}" (not production).\n`);
      process.exit(0);
    }
  }

  // Verify verification key file exists in public directory
  const keyFilePath = path.join(rootDir, `packages/client/public/${KEY}.txt`);
  if (!fs.existsSync(keyFilePath)) {
    console.error(`❌ Verification key file missing at: ${keyFilePath}`);
    if (!isBuild) process.exit(1);
    process.exit(0);
  }

  // Determine URL list
  let urlList = [];
  if (singleUrl) {
    const fullUrl = singleUrl.startsWith('http') ? singleUrl : `https://${HOST}${singleUrl.startsWith('/') ? '' : '/'}${singleUrl}`;
    urlList = [fullUrl];
    console.log(`📌 Single URL Mode: ${fullUrl}`);
  } else {
    urlList = await discoverUrls();
    console.log(`📋 Discovered ${urlList.length} canonical URL(s) to submit.`);
  }

  const payload = {
    host: HOST,
    key: KEY,
    keyLocation: KEY_LOCATION,
    urlList
  };

  if (isDryRun) {
    console.log('\n🔍 [DRY RUN] Would submit the following payload to IndexNow:');
    console.log(JSON.stringify(payload, null, 2));
    console.log('\n✅ Dry-run complete. No HTTP requests were dispatched.');
    process.exit(0);
  }

  console.log(`📡 Dispatching ${urlList.length} URL(s) to ${INDEXNOW_API_ENDPOINT}...`);

  try {
    const res = await fetch(INDEXNOW_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000)
    });

    if (res.status === 200 || res.status === 202) {
      console.log(`\n🎉 Success! IndexNow returned HTTP ${res.status} (${res.status === 200 ? 'OK' : 'Accepted'}).`);
      console.log('Search engines (Bing, Yandex, Seznam.cz, Naver, Yep) have been notified of your updated URLs.\n');
    } else {
      const responseText = await res.text().catch(() => '');
      console.warn(`\n⚠️  IndexNow returned HTTP ${res.status}: ${responseText}`);
      if (res.status === 422) {
        console.warn('Note: 422 indicates URLs may not match host or key verification is still propagating.');
      }
    }
  } catch (err) {
    console.warn(`\n⚠️  Network dispatch to IndexNow API failed: ${err.message}`);
    if (isBuild) {
      // Never fail CI deployment due to external API timeout
      console.log('ℹ️  Continuing Netlify deployment without blocking.');
      process.exit(0);
    }
    process.exit(1);
  }
}

main();

/**
 * KUX TTS — Kyutai TTS 1.6B Playwright Automation
 * 
 * This script automates the Kyutai TTS website to generate audio from text.
 * It handles:
 *  - Navigating to the Kyutai TTS 1.6B section
 *  - Checking "Show all voices" checkbox
 *  - Selecting the specified voice
 *  - Pasting text into the input
 *  - Clicking Play and waiting for audio generation
 *  - Downloading the generated audio file
 * 
 * Input: automation/tts-input.json
 * Output: downloads/*.wav
 */

import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TTS_URL = 'https://kyutai.org/tts';
const MAX_RETRIES = 2;
const GENERATION_TIMEOUT_SEC = 120;

// ─── Read Input ───
function readInput() {
    const inputFile = path.join(__dirname, 'tts-input.json');
    if (!fs.existsSync(inputFile)) {
        console.error('❌ automation/tts-input.json not found!');
        process.exit(1);
    }
    return JSON.parse(fs.readFileSync(inputFile, 'utf-8'));
}

// ─── Split text into chunks ───
function splitText(text, maxChars = 500) {
    const chunks = [];
    // Split by sentences first, then regroup into chunks of ~maxChars
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    let current = '';
    
    for (const sentence of sentences) {
        const trimmed = sentence.trim();
        if (!trimmed) continue;
        
        if ((current + ' ' + trimmed).trim().length > maxChars && current.length > 0) {
            chunks.push(current.trim());
            current = trimmed;
        } else {
            current = (current + ' ' + trimmed).trim();
        }
    }
    
    if (current.trim()) {
        chunks.push(current.trim());
    }
    
    // If no sentences found or text has no punctuation, split by character count
    if (chunks.length === 0) {
        for (let i = 0; i < text.length; i += maxChars) {
            chunks.push(text.substring(i, i + maxChars).trim());
        }
    }
    
    return chunks;
}

// ─── Find the Kyutai TTS 1.6B section elements ───
async function findTTS16BSection(page) {
    // The page has 2 TTS sections: Pocket TTS (first) and TTS 1.6B (second)
    // We need the SECOND section's elements
    
    // Scroll down to find the TTS 1.6B section
    await page.evaluate(() => {
        const headers = document.querySelectorAll('h2, h3, h4');
        for (const h of headers) {
            if (h.textContent.includes('1.6B')) {
                h.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return true;
            }
        }
        // Fallback: scroll to bottom half of page
        window.scrollTo(0, document.body.scrollHeight / 2);
        return false;
    });
    
    await page.waitForTimeout(1500);
    
    // The page has multiple textarea elements and select elements
    // The TTS 1.6B section is the second one on the page
    const textareas = await page.$$('textarea[placeholder="Enter text..."]');
    const selects = await page.$$('select');
    const checkboxes = await page.$$('input[type="checkbox"]');
    
    console.log(`   📍 Found ${textareas.length} textareas, ${selects.length} selects, ${checkboxes.length} checkboxes`);
    
    // TTS 1.6B is the second section, so use index 1 (0-based)
    // But we need to make sure we have at least 2 of each
    const sectionIdx = textareas.length >= 2 ? 1 : 0;
    
    return {
        textarea: textareas[sectionIdx] || textareas[0],
        voiceSelect: selects[sectionIdx] || selects[0],
        checkbox: checkboxes[sectionIdx] || checkboxes[0],
        sectionIdx,
    };
}

// ─── Main Automation ───
(async () => {
    const input = readInput();
    const { text, voice = 'Show host (US, m)', chunkSize = 500, proxy } = input;
    
    if (!text) {
        console.error('❌ No text provided in tts-input.json');
        process.exit(1);
    }
    
    // Split text into chunks
    const parts = splitText(text, chunkSize);
    console.log(`✅ Text split into ${parts.length} part(s) of ~${chunkSize} chars each\n`);
    parts.forEach((p, i) => console.log(`   Part ${i + 1}: "${p.substring(0, 60)}..." (${p.length} chars)`));
    console.log('');
    
    // Setup downloads directory
    const downloadsDir = path.join(__dirname, '..', 'downloads');
    if (!fs.existsSync(downloadsDir)) {
        fs.mkdirSync(downloadsDir, { recursive: true });
    }
    
    // Launch browser
    const launchOpts = {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage',
        ]
    };
    
    // Add proxy if configured
    if (proxy) {
        launchOpts.proxy = { server: proxy };
        console.log(`🌐 Using proxy: ${proxy}`);
    }
    
    const browser = await chromium.launch(launchOpts);
    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        acceptDownloads: true,
    });
    
    // Anti-detection
    await context.addInitScript("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})");
    
    const page = await context.newPage();
    let successCount = 0;
    let failCount = 0;
    
    try {
        // Step 1: Navigate to Kyutai TTS
        console.log('🌐 Navigating to Kyutai TTS...');
        await page.goto(TTS_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(3000);
        
        // Accept cookie consent if present
        try {
            const consentBtn = page.locator('button:has-text("Accept"), button:has-text("OK"), button:has-text("Agree")');
            if (await consentBtn.count() > 0) {
                await consentBtn.first().click();
                await page.waitForTimeout(1000);
                console.log('   ✅ Cookie consent accepted');
            }
        } catch { }
        
        // Step 2: Find the TTS 1.6B section
        console.log('📍 Finding Kyutai TTS 1.6B section...');
        const section = await findTTS16BSection(page);
        
        // Step 3: Check "Show all voices" checkbox (CRITICAL!)
        console.log('☑️  Clicking "Show all voices" checkbox...');
        if (section.checkbox) {
            const isChecked = await section.checkbox.isChecked();
            if (!isChecked) {
                await section.checkbox.click();
                await page.waitForTimeout(1000);
                console.log('   ✅ "Show all voices" checkbox checked!');
            } else {
                console.log('   ✅ "Show all voices" already checked');
            }
        } else {
            console.log('   ⚠️  Could not find checkbox, continuing...');
        }
        
        // Step 4: Select voice
        if (section.voiceSelect && voice) {
            console.log(`🎤 Selecting voice: "${voice}"`);
            try {
                await section.voiceSelect.selectOption({ label: voice });
                console.log(`   ✅ Voice "${voice}" selected`);
            } catch {
                console.log(`   ⚠️  Voice "${voice}" not found, using default`);
            }
        }
        
        // Step 5: Process each part
        for (let i = 0; i < parts.length; i++) {
            const partText = parts[i];
            const partNum = i + 1;
            
            console.log(`\n🎬 [Part ${partNum}/${parts.length}] Processing (${partText.length} chars)`);
            console.log(`   Text: "${partText.substring(0, 80)}..."`);
            
            let success = false;
            
            for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                if (attempt > 0) {
                    console.log(`   🔄 Retry #${attempt}...`);
                    // Refresh page and re-setup for retry
                    await page.goto(TTS_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
                    await page.waitForTimeout(3000);
                    const retrySection = await findTTS16BSection(page);
                    Object.assign(section, retrySection);
                    
                    // Re-check checkbox
                    if (section.checkbox) {
                        const isChecked = await section.checkbox.isChecked();
                        if (!isChecked) {
                            await section.checkbox.click();
                            await page.waitForTimeout(1000);
                        }
                    }
                    
                    // Re-select voice
                    if (section.voiceSelect && voice) {
                        try {
                            await section.voiceSelect.selectOption({ label: voice });
                        } catch { }
                    }
                }
                
                try {
                    // Clear and type text
                    await section.textarea.click();
                    await page.keyboard.press('Control+A');
                    await page.keyboard.press('Backspace');
                    await page.waitForTimeout(300);
                    await section.textarea.fill(partText);
                    console.log('   ✅ Text pasted');
                    
                    // Find and click Play button (the SECOND one for TTS 1.6B)
                    const playButtons = await page.$$('button:has-text("Play")');
                    const playBtn = playButtons[section.sectionIdx] || playButtons[0];
                    
                    if (!playBtn) {
                        console.log('   ❌ Play button not found!');
                        continue;
                    }
                    
                    // Setup download listener BEFORE clicking play
                    const downloadPromise = page.waitForEvent('download', {
                        timeout: GENERATION_TIMEOUT_SEC * 1000,
                    }).catch(() => null);
                    
                    await playBtn.click();
                    console.log('   ▶️  Play clicked! Waiting for audio generation...');
                    
                    // Wait for the status to change to "Streaming" or "Connected"
                    const startTime = Date.now();
                    let audioGenerated = false;
                    
                    // Poll for audio completion
                    while (Date.now() - startTime < GENERATION_TIMEOUT_SEC * 1000) {
                        // Check if download button became active (green)
                        const downloadBtns = await page.$$('button');
                        let downloadBtn = null;
                        
                        for (const btn of downloadBtns) {
                            const html = await btn.innerHTML().catch(() => '');
                            // Download button has an SVG icon and is near the Play button
                            if (html.includes('svg') && html.includes('path')) {
                                const box = await btn.boundingBox();
                                if (box) {
                                    // Check if this button is in the TTS 1.6B section area
                                    const playBox = await playBtn.boundingBox();
                                    if (playBox && Math.abs(box.y - playBox.y) < 50) {
                                        downloadBtn = btn;
                                    }
                                }
                            }
                        }
                        
                        // Check page text for status indicators
                        const pageText = await page.textContent('body');
                        if (pageText.includes('Not connected') && Date.now() - startTime > 10000) {
                            // Still not connected after 10s, might need retry
                            console.log('   ⚠️  Still "Not connected" after 10s');
                        }
                        
                        // Check for streaming/connected status near the TTS 1.6B section
                        const statusTexts = await page.$$eval('*', (elements) => {
                            return elements
                                .filter(el => el.textContent && (el.textContent.includes('Streaming') || el.textContent.includes('Connected')))
                                .map(el => el.textContent.trim().substring(0, 50));
                        });
                        
                        if (statusTexts.some(t => t.includes('Streaming'))) {
                            if (!audioGenerated) {
                                console.log('   🔊 Audio is streaming...');
                                audioGenerated = true;
                            }
                        }
                        
                        // Once streaming was detected and stopped, it means audio is done
                        if (audioGenerated) {
                            const stillStreaming = statusTexts.some(t => t.includes('Streaming'));
                            if (!stillStreaming) {
                                console.log('   ✅ Audio generation complete!');
                                break;
                            }
                        }
                        
                        await page.waitForTimeout(2000);
                    }
                    
                    // Now click the download button
                    console.log('   📥 Clicking download button...');
                    
                    // Find download buttons — they are right next to Play buttons
                    // The download button is usually the button right after Play with an SVG icon
                    const allBtns = await page.$$('button');
                    let downloadBtn = null;
                    let foundPlay = false;
                    
                    for (const btn of allBtns) {
                        const text = await btn.textContent().catch(() => '');
                        if (text.includes('Play')) {
                            const box = await btn.boundingBox();
                            const playBox = await playBtn.boundingBox();
                            if (box && playBox && Math.abs(box.y - playBox.y) < 10) {
                                foundPlay = true;
                                continue;
                            }
                        }
                        if (foundPlay) {
                            // This should be the download button (right after Play)
                            downloadBtn = btn;
                            break;
                        }
                    }
                    
                    if (downloadBtn) {
                        const dl = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
                        await downloadBtn.click();
                        const download = await dl;
                        
                        if (download) {
                            const filePath = path.join(downloadsDir, `part_${partNum}.wav`);
                            await download.saveAs(filePath);
                            
                            const stats = fs.statSync(filePath);
                            const sizeKB = (stats.size / 1024).toFixed(1);
                            console.log(`   💾 Saved: part_${partNum}.wav (${sizeKB} KB)`);
                            success = true;
                            break;
                        } else {
                            console.log('   ⚠️  Download didn\'t trigger, retrying...');
                        }
                    } else {
                        console.log('   ⚠️  Download button not found');
                    }
                    
                } catch (err) {
                    console.log(`   ❌ Error: ${err.message}`);
                }
            }
            
            if (success) {
                successCount++;
            } else {
                failCount++;
                console.log(`   ❌ Part ${partNum} FAILED after ${MAX_RETRIES + 1} attempts`);
            }
        }
        
    } catch (err) {
        console.error(`\n💥 Fatal error: ${err.message}`);
    } finally {
        await browser.close();
    }
    
    // Summary
    console.log(`\n${'═'.repeat(50)}`);
    console.log(`🎉 TTS Automation Complete!`);
    console.log(`   ✅ Success: ${successCount}/${parts.length}`);
    console.log(`   ❌ Failed: ${failCount}/${parts.length}`);
    console.log(`${'═'.repeat(50)}`);
    
    // List saved files
    const savedFiles = fs.readdirSync(downloadsDir).filter(f => f.endsWith('.wav'));
    if (savedFiles.length > 0) {
        console.log('\n📁 Generated Audio Files:');
        savedFiles.forEach(f => {
            const stats = fs.statSync(path.join(downloadsDir, f));
            console.log(`   ${f} — ${(stats.size / 1024).toFixed(1)} KB`);
        });
    }
    
    // Write result JSON for the web app to read
    const resultFile = path.join(__dirname, 'tts-result.json');
    fs.writeFileSync(resultFile, JSON.stringify({
        totalParts: parts.length,
        success: successCount,
        failed: failCount,
        files: savedFiles,
        timestamp: new Date().toISOString(),
    }, null, 2));
    
    process.exit(failCount > 0 ? 1 : 0);
})();

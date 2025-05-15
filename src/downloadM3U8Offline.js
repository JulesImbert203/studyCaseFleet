
async function loadMediaList() {
    try {
        const mediaRequests = await browser.runtime.sendMessage({ action: 'getMediaRequests' });

        const m3u8Filenames = [];

        for (const url in mediaRequests) {
            const mediaURL = new URL(url);
            if (mediaURL.pathname.toLowerCase().endsWith('.m3u8')) {
                // Récupère le nom du fichier (avec la fonction getFileName si tu l'as, sinon extrait depuis URL)
                const fileName = getFileName ? getFileName(url) : mediaURL.pathname.split('/').pop();
                m3u8Filenames.push(fileName);
            }
        }

        return m3u8Filenames;
    } catch (error) {
        console.error('Error retrieving media requests:', error);
        return [];
    }
}




function getFileName(url) {
    try {
        let parsedUrl = new URL(url);

        // Extract path from URL
        let pathname = parsedUrl.pathname; // e.g. /path/to/file.mp4
        let fileName = pathname.substring(pathname.lastIndexOf('/') + 1);

        // Remove query string from file name
        fileName = fileName.split('?')[0];

        //Limit to 20 characters, but still show the extension
        const ext = fileName.substring(fileName.lastIndexOf('.'));
        const base = fileName.substring(0, 20 - ext.length - 1); // -1 pour '…'
        fileName = base + '…' + ext;

        return fileName;
    } catch (error) {
        console.error("Invalid URL", error);
        throw new Error('Invalid URL:', error);
    }
}

const QUALITY_PREFERENCE = "highest"; // ou "lowest", ou "medium"

async function selectStreamVariant(playlistLines, baseUrl) {
    const variants = [];

    for (let i = 0; i < playlistLines.length; i++) {
        if (playlistLines[i].startsWith("#EXT-X-STREAM-INF")) {
            const bwMatch = playlistLines[i].match(/BANDWIDTH=(\d+)/);
            const resMatch = playlistLines[i].match(/RESOLUTION=(\d+x\d+)/);
            const bandwidth = bwMatch ? parseInt(bwMatch[1]) : 0;
            const resolution = resMatch ? resMatch[1] : "unknown";
            const uri = playlistLines[i + 1];
            variants.push({
                bandwidth,
                resolution,
                uri: uri.startsWith("http") ? uri : baseUrl + uri
            });
        }
    }
    console.log("Available stream variants:", variants);

    if (variants.length === 1) {
        console.log("Only one variant available, selecting it by default.");
        return variants[0];
    }
    let selectedVariant;

    if (QUALITY_PREFERENCE === "highest") {
        selectedVariant = variants.reduce((a, b) => (a.bandwidth > b.bandwidth ? a : b));
    } else if (QUALITY_PREFERENCE === "lowest") {
        selectedVariant = variants.reduce((a, b) => (a.bandwidth < b.bandwidth ? a : b));
    } else if (QUALITY_PREFERENCE === "medium") {
        const sorted = variants.slice().sort((a, b) => a.bandwidth - b.bandwidth);
        selectedVariant = sorted[Math.floor(sorted.length / 2)];
    } else {
        console.warn("Unknown QUALITY_PREFERENCE, defaulting to highest.");
        selectedVariant = variants.reduce((a, b) => (a.bandwidth > b.bandwidth ? a : b));
    }

    console.log("Selected variant:", selectedVariant);

    return selectedVariant;
}


/**
 * Downloads and converts an M3U8 stream to an MP4 file for offline use.
 * Uses either browser.downloads API or fetch depending on the download method.
 */
async function downloadM3U8Offline(m3u8Url, headers, downloadMethod, loadingBar, request) {
    const getText = async (url) => {
        const res = await fetch(url, {
            headers: Object.fromEntries(headers.map(h => [h.name, h.value])),
            referrer: headers.find(h => h.name.toLowerCase() === "referer")?.value ?? document.referrer,
            method: 'GET'
        });
        return res.text();
    };

    const m3u8Text = await getText(m3u8Url);
    const isMasterPlaylist = m3u8Text.includes("#EXT-X-STREAM-INF");

    let videoUrl = m3u8Url;
    let audioUrl = null;

    if (isMasterPlaylist) {
        const lines = m3u8Text.split("\n");
        const base = m3u8Url.substring(0, m3u8Url.lastIndexOf("/") + 1);

        const selectedVariant = await selectStreamVariant(lines, base);
        videoUrl = selectedVariant.uri;

        const audioLine = lines.find(l => l.startsWith("#EXT-X-MEDIA:") && l.includes('TYPE=AUDIO'));
        if (audioLine) {
            const uriMatch = audioLine.match(/URI="([^"]+)"/);
            if (uriMatch) {
                const audioUri = uriMatch[1];
                audioUrl = audioUri.startsWith("http") ? audioUri : base + audioUri;
            }
        }
    }
    if (audioUrl) {
        // Display message informing the user about the separate audio stream
        console.log('Separate audio stream detected. Downloading video and audio separately (There will be 2 downloads).');
    }

    async function downloadSegments(playlistUrl, isAudio = false) {
        let totalSegments = 0;
        let downloadedSegments = 0;
        const playlistText = await getText(playlistUrl);
        const base = playlistUrl.substring(0, playlistUrl.lastIndexOf("/") + 1);

        const lines = playlistText.split("\n");

        let keyUri = null;
        let ivHex = null;
        let keyBuffer = null;

        // Find key line
        for (const line of lines) {
            if (line.startsWith("#EXT-X-KEY")) {
                const uriMatch = line.match(/URI="([^"]+)"/);
                const ivMatch = line.match(/IV=0x([0-9a-fA-F]+)/);
                if (uriMatch) keyUri = uriMatch[1];
                if (ivMatch) ivHex = ivMatch[1];
                break;
            }
        }

        // Fetch key if present
        if (keyUri) {
            const fullKeyUri = new URL(keyUri, playlistUrl).href;
            const keyRes = await fetch(fullKeyUri, {
                headers: Object.fromEntries(headers.map(h => [h.name, h.value])),
                referrer: request.requestHeaders.find(h => h.name.toLowerCase() === "referer")?.value,
                method: request.method
            });
            keyBuffer = await keyRes.arrayBuffer();
        }

        const tsUrls = lines
            .filter(line => line && !line.startsWith("#"))
            .map(line => new URL(line, playlistUrl).href);

        totalSegments += tsUrls.length;

        const segmentBuffers = [];

        for (let i = 0; i < tsUrls.length; i++) {
            const res = await fetch(tsUrls[i], {
                headers: Object.fromEntries(headers.map(h => [h.name, h.value])),
                referrer: request.requestHeaders.find(h => h.name.toLowerCase() === "referer")?.value,
                method: request.method
            });

            let data = new Uint8Array(await res.arrayBuffer());

            if (keyBuffer) {
                const iv = ivHex
                    ? Uint8Array.from(ivHex.match(/.{1,2}/g).map(b => parseInt(b, 16)))
                    : (() => {
                        const iv = new Uint8Array(16);
                        const view = new DataView(iv.buffer);
                        view.setUint32(12, i); // segment index as IV
                        return iv;
                    })();

                data = await decryptSegment(data, keyBuffer, iv);
            }

            segmentBuffers.push(data);

            downloadedSegments++;
            loadingBar.removeAttribute('indeterminate');
            loadingBar.setAttribute("value", downloadedSegments / totalSegments);
        }

        const finalTsBlob = new Blob(segmentBuffers, { type: "video/MP2T" });
        return finalTsBlob;
    }
    async function decryptSegment(encryptedBuffer, keyBuffer, iv) {
        const cryptoKey = await crypto.subtle.importKey(
            "raw",
            keyBuffer,
            { name: "AES-CBC" },
            false,
            ["decrypt"]
        );

        const decryptedBuffer = await crypto.subtle.decrypt(
            {
                name: "AES-CBC",
                iv
            },
            cryptoKey,
            encryptedBuffer
        );

        return new Uint8Array(decryptedBuffer);
    }

    const videoBlob = await downloadSegments(videoUrl, false);

    const baseFileName = getFileName(m3u8Url);
    if (audioUrl) {
        loadingBar.setAttribute('aria-label', 'Downloading audio stream...');
        console.log('Downloading audio stream...');
        const audioBlob = await downloadSegments(audioUrl, true);

        // Save both blobs separately
        const videoBlobUrl = URL.createObjectURL(videoBlob);
        const audioBlobUrl = URL.createObjectURL(audioBlob);

        const videoAnchor = document.createElement("a");
        videoAnchor.href = videoBlobUrl;
        videoAnchor.download = `${baseFileName}_video.ts`;
        document.body.appendChild(videoAnchor);
        videoAnchor.click();
        document.body.removeChild(videoAnchor);

        const audioAnchor = document.createElement("a");
        audioAnchor.href = audioBlobUrl;
        audioAnchor.download = `${baseFileName}_audio.ts`;
        document.body.appendChild(audioAnchor);
        audioAnchor.click();
        document.body.removeChild(audioAnchor);
        
        console.log(`Both video and audio streams have been downloaded. You can merge them both with <a href='https://ffmpeg.org/'>ffmpeg</a> using the following command :<br/><code>ffmpeg -i ${baseFileName}_video.ts -i ${baseFileName}_audio.ts -c copy final_video.mp4`,"Downloaded separated audio and video streams");
        URL.revokeObjectURL(videoBlobUrl);
        URL.revokeObjectURL(audioBlobUrl); // Clean up the blob URLs
        return;
    } else {
        const videoBlobUrl = URL.createObjectURL(videoBlob);
        const videoAnchor = document.createElement("a");
        videoAnchor.href = videoBlobUrl;
        videoAnchor.download = `${baseFileName}.ts`;
        document.body.appendChild(videoAnchor);
        videoAnchor.click();
        document.body.removeChild(videoAnchor);
        URL.revokeObjectURL(videoBlobUrl)
    }
}


async function downloadFile(url, sizeSelect, mediaDiv) {
    console.log('Downloading media file:', url);
    try {
        const requests = await browser.runtime.sendMessage({ action: 'getMediaRequests', url: url });
        const forbiddenHeaders = [
            "Accept-Charset", "Accept-Encoding", "Access-Control-Request-Headers", "Access-Control-Request-Method",
            "Connection", "Content-Length", "Cookie", "Date", "DNT", "Expect", "Host", "Keep-Alive", "Origin",
            "Permissions-Policy", "Referer", "TE", "Trailer", "Transfer-Encoding", "Upgrade", "Via"
        ];
        const selectedValue = sizeSelect.value;
        const menuItems = Array.from(sizeSelect.querySelectorAll('mdui-menu-item'));
        const selectedSizeIndex = menuItems.findIndex(item => item.value === selectedValue);

        const headers = requests[url][selectedSizeIndex].requestHeaders.filter(header =>
            !forbiddenHeaders.includes(header.name) &&
            !header.name.startsWith('Sec-') &&
            !header.name.startsWith('Proxy-')
        );

        const downloadMethod = localStorage.getItem('download-method');
        const streamDownload = localStorage.getItem('stream-download');
        const loadingBar = document.createElement('mdui-linear-progress');
        mediaDiv.querySelector("#download-button").loading=true
        mediaDiv.querySelector("#download-button").disabled=true
        loadingBar.style.width = '100%';
        loadingBar.setAttribute('indeterminate', 'true');
        mediaDiv.appendChild(loadingBar);

        if (streamDownload === 'offline' &&
            (getFileName(url).endsWith('.m3u8') ||
                requests[url][selectedSizeIndex].responseHeaders.find(header => header.name.toLowerCase() === 'content-type').value.startsWith('application/') // Check if the response is a stream
            )) {
            console.log('M3U8 stream detected, converting to offline format...');
            await downloadM3U8Offline(url, headers, downloadMethod, loadingBar, requests[url][selectedSizeIndex]);
            mediaDiv.removeChild(loadingBar);
            mediaDiv.querySelector("#download-button").loading=false
            mediaDiv.querySelector("#download-button").disabled=false
            return;
        }

        if (downloadMethod === 'browser') {
            const fileName = getFileName(url) || 'media';

            browser.downloads.download({
                url,
                filename: fileName,
                headers: headers,
                method: requests[url][selectedSizeIndex].method
            }).then((downloadId) => {
                console.log('Media file downloaded:', downloadId);
                mediaDiv.removeChild(loadingBar);
                mediaDiv.querySelector("#download-button").loading=false
                mediaDiv.querySelector("#download-button").disabled=false
            }).catch((error) => {
                mediaDiv.removeChild(loadingBar);
                mediaDiv.querySelector("#download-button").loading=false
                mediaDiv.querySelector("#download-button").disabled=false
                throw new Error('Error downloading media file with browser download method:', error);

            });

        } else {
            const headersObject = {};
            headers.forEach(header => {
                headersObject[header.name] = header.value;
            });

            const response = await fetch(url, {
                method: requests[url][selectedSizeIndex].method,
                headers: headersObject,
                referrer: requests[url][selectedSizeIndex].requestHeaders.find(h => h.name.toLowerCase() === "referer")?.value
            });

            if (!response.ok) {
                throw new Error(`Error downloading media file with fetch: ${response.status}`);
            }

            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = blobUrl;
            a.download = getFileName(url) || 'media';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            console.log('Media file downloaded:', blobUrl);
            mediaDiv.removeChild(loadingBar);
            mediaDiv.querySelector("#download-button").loading=false
            mediaDiv.querySelector("#download-button").disabled=false
            URL.revokeObjectURL(blobUrl); // Clean up the blob URL
        }
    } catch (error) {
        console.error('Error downloading media file:', error);
        showDialog('Error downloading media file. Here\'s what went wrong: ' + error);
        mediaDiv.removeChild(loadingBar);
        mediaDiv.querySelector("#download-button").loading=false
        mediaDiv.querySelector("#download-button").disabled=false
    }
}

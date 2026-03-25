// Universal Video Player - Supports YouTube, Vimeo, Archive.org, Cloudinary, Bunny.net, Direct URLs
(function () {
  const archiveExistenceCache = new Map();

  function buildMessageCard({ title, message, href, linkText }) {
    const safeTitle = title || 'Unavailable';
    const safeMessage = message || '';

    return `
      <div style="
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        box-sizing: border-box;
      ">
        <div style="max-width: 640px; text-align: center;">
          <h3 style="margin: 0 0 12px; color: #111827; font-size: 1.25rem;">${safeTitle}</h3>
          <div style="margin: 0; color: #6b7280; line-height: 1.6; white-space: pre-line;">${safeMessage}</div>
          ${href ? `
            <div style="margin-top: 16px;">
              <a
                href="${href}"
                target="_blank"
                rel="noopener"
                style="
                  display: inline-block;
                  background: #4f46e5;
                  color: #ffffff;
                  padding: 10px 16px;
                  border-radius: 8px;
                  text-decoration: none;
                  font-weight: 600;
                "
              >
                ${linkText || 'Open link'}
              </a>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  function safeParseUrl(url) {
    try {
      return new URL(url, window.location.origin);
    } catch (_) {
      return null;
    }
  }

  function getFileExtension(url) {
    const parsed = safeParseUrl(url);
    const pathname = parsed ? parsed.pathname : (url || '');
    const last = pathname.split('/').pop() || '';
    const clean = last.split('?')[0].split('#')[0];
    const match = clean.match(/\.([a-z0-9]+)$/i);
    return match ? match[1].toLowerCase() : '';
  }

  function guessMimeTypeFromUrl(url) {
    const ext = getFileExtension(url);
    switch (ext) {
      case 'mp4':
      case 'm4v':
        return 'video/mp4';
      case 'webm':
        return 'video/webm';
      case 'ogg':
      case 'ogv':
        return 'video/ogg';
      case 'mov':
        return 'video/quicktime';
      case 'mkv':
        return 'video/x-matroska';
      case 'avi':
        return 'video/x-msvideo';
      case 'm3u8':
        return 'application/x-mpegURL';
      case 'mpd':
        return 'application/dash+xml';
      case 'vtt':
        return 'text/vtt';
      default:
        return '';
    }
  }

  async function checkArchiveItemExists(itemId) {
    const trimmed = (itemId || '').trim();
    if (!trimmed) return false;

    if (archiveExistenceCache.has(trimmed)) {
      return archiveExistenceCache.get(trimmed);
    }

    const promise = (async () => {
      try {
        const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(trimmed)}`);
        if (!res.ok) return false;
        const data = await res.json().catch(() => ({}));
        if (data && (data.error || data.err)) return false;
        return true;
      } catch (_) {
        return true;
      }
    })();

    archiveExistenceCache.set(trimmed, promise);
    return promise;
  }

  function normalizeTrack(track) {
    if (!track || typeof track !== 'object') return null;
    if (!track.src) return null;

    return {
      kind: track.kind || 'subtitles',
      src: track.src,
      srclang: track.srclang || track.lang || 'en',
      label: track.label || track.srclang || track.lang || 'Subtitles',
      default: !!track.default
    };
  }

  // Creates a thumbnail overlay with play button for iframe-based videos
  function createThumbnailOverlay(container, posterUrl, onPlay) {
    if (!posterUrl) return null;

    const overlay = document.createElement('div');
    overlay.className = 'video-thumbnail-overlay';
    overlay.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: #000 url('${posterUrl}') center/cover no-repeat;
      cursor: pointer;
      z-index: 10;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 12px;
    `;

    const playBtn = document.createElement('div');
    playBtn.className = 'video-play-btn';
    playBtn.style.cssText = `
      width: 80px;
      height: 80px;
      background: rgba(0, 0, 0, 0.7);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s, background 0.2s;
    `;
    playBtn.innerHTML = `
      <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
        <path d="M8 5v14l11-7z"/>
      </svg>
    `;

    overlay.appendChild(playBtn);

    overlay.addEventListener('mouseenter', () => {
      playBtn.style.transform = 'scale(1.1)';
      playBtn.style.background = 'rgba(102, 126, 234, 0.9)';
    });

    overlay.addEventListener('mouseleave', () => {
      playBtn.style.transform = 'scale(1)';
      playBtn.style.background = 'rgba(0, 0, 0, 0.7)';
    });

    overlay.addEventListener('click', () => {
      overlay.style.display = 'none';
      if (typeof onPlay === 'function') onPlay();
    });

    return overlay;
  }

  window.UniversalVideoPlayer = {
    detect: function (url) {
      const raw = (url || '').toString().trim();
      if (!raw) return { type: 'none' };

      const lowered = raw.toLowerCase();

      // Bunny Stream (iframe embed or play URL)
      if (lowered.includes('iframe.mediadelivery.net/embed/')) {
        const match = raw.match(/iframe\.mediadelivery\.net\/embed\/([^\/\?]+)\/([^\/\?]+)/i);
        const libraryId = match ? match[1] : null;
        const videoId = match ? match[2] : null;
        return {
          type: 'bunny-embed',
          url: raw,
          libraryId,
          videoId,
          embedUrl: libraryId && videoId ? `https://iframe.mediadelivery.net/embed/${libraryId}/${videoId}` : raw
        };
      }

      if (lowered.includes('video.bunnycdn.com/play/')) {
        const match = raw.match(/video\.bunnycdn\.com\/play\/([^\/\?]+)\/([^\/\?]+)/i);
        const libraryId = match ? match[1] : null;
        const videoId = match ? match[2] : null;
        const embedUrl = libraryId && videoId ? `https://iframe.mediadelivery.net/embed/${libraryId}/${videoId}` : null;
        return {
          type: 'bunny-embed',
          url: raw,
          libraryId,
          videoId,
          embedUrl: embedUrl || raw
        };
      }

      // YouTube
      if (lowered.includes('youtube.com') || lowered.includes('youtu.be')) {
        const videoId = this.extractYouTubeId(raw);
        return { type: 'youtube', id: videoId, url: raw };
      }

      // Vimeo
      if (lowered.includes('vimeo.com')) {
        const videoId = this.extractVimeoId(raw);
        return { type: 'vimeo', id: videoId, url: raw };
      }

      // Archive.org (embed/details pages only)
      if (lowered.includes('archive.org') || lowered.includes('s3.us.archive.org')) {
        const itemId = this.extractArchiveId(raw);
        return { type: 'archive', url: raw, itemId, embedUrl: itemId ? `https://archive.org/embed/${itemId}` : null };
      }

      // Direct video URLs
      if (lowered.match(/\.(mp4|webm|ogg|ogv|mov|avi|mkv|m3u8|mpd)(\?|$)/i)) {
        return { type: 'direct', url: raw };
      }

      // Cloudinary (may be mp4/webm/m3u8)
      if (lowered.includes('cloudinary.com')) {
        return { type: 'cloudinary', url: raw };
      }

      // Bunny CDN pull zones (mp4 etc)
      if (lowered.includes('bunny.net') || lowered.includes('b-cdn.net') || lowered.includes('bunnycdn.com')) {
        return { type: 'bunny', url: raw };
      }

      // Default
      return { type: 'direct', url: raw };
    },

    extractYouTubeId: function (url) {
      const patterns = [
        /youtube\.com\/watch\?v=([^&]+)/i,
        /youtube\.com\/embed\/([^?&/]+)/i,
        /youtube\.com\/shorts\/([^?&/]+)/i,
        /youtube\.com\/live\/([^?&/]+)/i,
        /youtu\.be\/([^?&/]+)/i
      ];
      for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
      }
      return null;
    },

    extractVimeoId: function (url) {
      const patterns = [
        /vimeo\.com\/(\d+)/i,
        /player\.vimeo\.com\/video\/(\d+)/i,
        /vimeo\.com\/manage\/videos\/(\d+)/i
      ];
      for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
      }
      return null;
    },

    extractArchiveId: function (url) {
      const patterns = [
        /archive\.org\/download\/([^/]+)/i,
        /archive\.org\/stream\/([^/]+)/i,
        /archive\.org\/details\/([^/]+)/i,
        /archive\.org\/embed\/([^/]+)/i,
        /s3\.us\.archive\.org\/([^/]+)/i
      ];

      for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
      }

      const fallbackMatch = url.match(/archive\.org\/(?:[^/]+\/)?([^/?#]+)/i);
      return fallbackMatch ? fallbackMatch[1] : null;
    },

    render: function (containerId, videoUrl, metadata) {
      const container = document.getElementById(containerId);
      if (!container) return;

      const detected = this.detect(videoUrl);
      const video = Object.assign({}, detected);

      if (metadata) {
        Object.assign(video, metadata);
      }

      const token = Math.random().toString(36).slice(2);
      container.dataset.universalPlayerToken = token;

      // Ensure container has relative positioning for overlay
      container.style.position = 'relative';

      const safeSetHTML = (html) => {
        if (container.dataset.universalPlayerToken !== token) return;
        container.innerHTML = html;
      };

      const safeSetElement = (el) => {
        if (container.dataset.universalPlayerToken !== token) return;
        container.innerHTML = '';
        container.appendChild(el);
      };

      // Helper to add thumbnail overlay for iframe-based videos
      const addThumbnailOverlay = (iframeHtml, autoplayIframeHtml) => {
        // --- ADDED AUTOPLAY CHECK ---
        // If autoplay is requested and we have an autoplay version, skip the overlay
        if (video.autoplay && autoplayIframeHtml) {
          safeSetHTML(autoplayIframeHtml);
          return;
        }

        const posterUrl = video.poster || video.thumbnailUrl || video.thumbnail_url;
        if (posterUrl) {
          // Initially show just the overlay (no iframe yet for faster load)
          const overlay = createThumbnailOverlay(container, posterUrl, () => {
            // On play click, replace with autoplay iframe
            if (autoplayIframeHtml) {
              safeSetHTML(autoplayIframeHtml);
            } else {
              safeSetHTML(iframeHtml);
            }
          });
          if (overlay) {
            container.innerHTML = '';
            container.appendChild(overlay);
            return;
          }
        }
        // Fallback: no poster, just show the iframe
        safeSetHTML(iframeHtml);
      };

      switch (video.type) {
        case 'youtube': {
          if (!video.id) {
            safeSetHTML(
              buildMessageCard({
                title: 'Video unavailable',
                message: 'We could not determine the YouTube video ID for this link.',
                href: video.url,
                linkText: 'Open on YouTube'
              })
            );
            break;
          }

          const params = new URLSearchParams({
            rel: '0',
            modestbranding: '1'
          });

          const autoplayParams = new URLSearchParams({
            rel: '0',
            modestbranding: '1',
            autoplay: '1'
          });

          const iframeHtml = `<iframe
              width="100%"
              height="100%"
              src="https://www.youtube.com/embed/${encodeURIComponent(video.id)}?${params.toString()}"
              frameborder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowfullscreen
              referrerpolicy="strict-origin-when-cross-origin"
            ></iframe>`;

          const autoplayIframeHtml = `<iframe
              width="100%"
              height="100%"
              src="https://www.youtube.com/embed/${encodeURIComponent(video.id)}?${autoplayParams.toString()}"
              frameborder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowfullscreen
              referrerpolicy="strict-origin-when-cross-origin"
            ></iframe>`;

          addThumbnailOverlay(iframeHtml, autoplayIframeHtml);
          break;
        }

        case 'vimeo': {
          if (!video.id) {
            safeSetHTML(
              buildMessageCard({
                title: 'Video unavailable',
                message: 'We could not determine the Vimeo video ID for this link.',
                href: video.url,
                linkText: 'Open on Vimeo'
              })
            );
            break;
          }

          const vimeoIframeHtml = `<iframe
              src="https://player.vimeo.com/video/${encodeURIComponent(video.id)}"
              width="100%"
              height="100%"
              frameborder="0"
              allow="autoplay; fullscreen; picture-in-picture"
              allowfullscreen
            ></iframe>`;

          const vimeoAutoplayIframeHtml = `<iframe
              src="https://player.vimeo.com/video/${encodeURIComponent(video.id)}?autoplay=1"
              width="100%"
              height="100%"
              frameborder="0"
              allow="autoplay; fullscreen; picture-in-picture"
              allowfullscreen
            ></iframe>`;

          addThumbnailOverlay(vimeoIframeHtml, vimeoAutoplayIframeHtml);
          break;
        }

        case 'bunny-embed': {
          const embedUrl = (video.embedUrl || '').trim() || video.url;

          const bunnyIframeHtml = `<iframe
              src="${embedUrl}"
              width="100%"
              height="100%"
              frameborder="0"
              allow="autoplay; fullscreen; picture-in-picture"
              allowfullscreen
            ></iframe>`;

          const bunnyAutoplayIframeHtml = `<iframe
              src="${embedUrl}?autoplay=true"
              width="100%"
              height="100%"
              frameborder="0"
              allow="autoplay; fullscreen; picture-in-picture"
              allowfullscreen
            ></iframe>`;

          addThumbnailOverlay(bunnyIframeHtml, bunnyAutoplayIframeHtml);
          break;
        }

        case 'archive': {
          const itemId = (video.itemId || this.extractArchiveId(video.url) || '').trim();
          if (!itemId) {
            safeSetHTML(
              buildMessageCard({
                title: 'Video unavailable',
                message: 'We could not determine the Archive.org item ID for this video.',
                href: video.url,
                linkText: 'Open on Archive.org'
              })
            );
            break;
          }

          // Try to use direct video URL if available
          const isDirectUrl = video.url && (
            video.url.includes('/download/') ||
            video.url.includes('s3.us.archive.org') ||
            video.url.match(/\.(mp4|webm|ogg|mov)(\?|$)/i)
          );

          if (isDirectUrl) {
            // Use HTML5 video player for direct URLs
            const videoEl = document.createElement('video');
            videoEl.controls = true;
            /*
             * Use 'metadata' preload for all direct videos to avoid downloading
             * large files on initial render. MDN notes that setting preload to
             * 'metadata' or 'none' defers the download until needed【187715498598355†L270-L279】.
             */
            videoEl.preload = 'metadata';
            videoEl.playsInline = true;
            videoEl.setAttribute('playsinline', '');
            videoEl.setAttribute('webkit-playsinline', '');
            videoEl.style.cssText = 'width: 100%; height: 100%; min-height: 200px; background: #000; border-radius: 12px;';

            // Disable download button unless explicitly allowed
            if (video.allowDownload) {
              videoEl.controlsList = 'noplaybackrate'; // Allow download
              videoEl.oncontextmenu = null; // Allow context menu
            } else {
              videoEl.controlsList = 'nodownload';
              videoEl.oncontextmenu = (e) => { e.preventDefault(); return false; };
            }

            videoEl.disablePictureInPicture = true;

            // Add poster for direct Archive.org videos if NOT autoplaying
            const posterUrl = video.poster || video.thumbnailUrl || video.thumbnail_url;
            if (posterUrl && !video.autoplay) {
              videoEl.poster = posterUrl;
            }

            // CHECK AUTOPLAY FOR DIRECT ARCHIVE
            if (video.autoplay) {
              videoEl.autoplay = true;
              // Important: Some browsers block autoplay if not muted, but since this is user-initiated (click), it should work.
              // We don't force mute unless it fails.
            }

            const source = document.createElement('source');
            source.src = video.url;
            source.type = guessMimeTypeFromUrl(video.url) || 'video/mp4';

            videoEl.appendChild(source);

            videoEl.onerror = () => {
              const detailsUrl = `https://archive.org/details/${encodeURIComponent(itemId)}`;
              safeSetHTML(
                buildMessageCard({
                  title: 'Video processing',
                  message: 'This video is still being processed by Archive.org. Please try again in a few minutes.',
                  href: detailsUrl,
                  linkText: 'View on Archive.org'
                })
              );
            };

            safeSetElement(videoEl);

            // FIXED: Explicitly call play() for Archive direct links to ensure it starts
            if (video.autoplay) {
              videoEl.play().catch(e => console.warn('Autoplay blocked:', e));
            }
            break;
          }

          // Use embed for non-direct URLs with thumbnail overlay
          const detailsUrl = `https://archive.org/details/${encodeURIComponent(itemId)}`;
          const embedUrl = `https://archive.org/embed/${encodeURIComponent(itemId)}`;

          const archiveIframeHtml = `<iframe
              src="${embedUrl}?autostart=false"
              width="100%"
              height="100%"
              frameborder="0"
              allow="fullscreen"
              style="border-radius: 12px;"
            >
              <p>Your browser does not support iframes.
              <a href="${detailsUrl}" target="_blank" rel="noopener">View on Archive.org</a></p>
            </iframe>`;

          // UPDATED: Added autoplay=1 and autostart=1 plus allow attributes
          const archiveAutoplayIframeHtml = `<iframe
              src="${embedUrl}?autoplay=1&autostart=1"
              width="100%"
              height="100%"
              frameborder="0"
              allow="fullscreen; autoplay"
              style="border-radius: 12px;"
            >
              <p>Your browser does not support iframes.
              <a href="${detailsUrl}" target="_blank" rel="noopener">View on Archive.org</a></p>
            </iframe>`;

          addThumbnailOverlay(archiveIframeHtml, archiveAutoplayIframeHtml);
          break;
        }

        case 'cloudinary':
        case 'bunny':
        case 'direct': {
          const sources = [];

          if (Array.isArray(video.sources) && video.sources.length > 0) {
            for (const s of video.sources) {
              if (!s || !s.src) continue;
              sources.push({
                src: s.src,
                type: s.type || guessMimeTypeFromUrl(s.src)
              });
            }
          } else if (video.url) {
            sources.push({
              src: video.url,
              type: video.typeHint || guessMimeTypeFromUrl(video.url)
            });
          }

          if (sources.length === 0) {
            safeSetHTML(
              buildMessageCard({
                title: 'Video unavailable',
                message: 'No playable video sources were found.',
                href: video.url,
                linkText: 'Open video link'
              })
            );
            break;
          }

          const poster = video.poster || video.thumbnailUrl || video.thumbnail_url;

            // Function to create and show the video element
          const showVideoPlayer = (autoplay) => {
            const videoEl = document.createElement('video');
            videoEl.controls = true;
            /*
             * Always defer large video downloads until needed. MDN recommends
             * setting preload to 'metadata' or 'none' for videos that might not
             * be watched immediately【187715498598355†L270-L279】. Here we use 'metadata'
             * to load only metadata and avoid fetching the entire file during initial render.
             */
            videoEl.preload = 'metadata';
            videoEl.playsInline = true;
            videoEl.setAttribute('playsinline', '');
            videoEl.setAttribute('webkit-playsinline', '');
            videoEl.style.width = '100%';
            videoEl.style.height = '100%';
            videoEl.style.minHeight = '200px';
            videoEl.style.borderRadius = '12px';
            videoEl.style.background = '#000';

            // Disable download button unless explicitly allowed
            if (video.allowDownload) {
              videoEl.controlsList = 'noplaybackrate'; // Allow download
              videoEl.oncontextmenu = null; // Allow context menu
            } else {
              videoEl.controlsList = 'nodownload';
              videoEl.oncontextmenu = (e) => { e.preventDefault(); return false; };
            }

            videoEl.disablePictureInPicture = true;

            if (poster) {
              videoEl.poster = poster;
            }

            // CHECK AUTOPLAY
            if (autoplay) {
              videoEl.autoplay = true;
            }

            for (const s of sources) {
              const source = document.createElement('source');
              source.src = s.src;
              if (s.type) source.type = s.type;
              videoEl.appendChild(source);
            }

            const tracks = [];

            if (video.subtitlesUrl || video.subtitles_url) {
              tracks.push(
                normalizeTrack({
                  src: video.subtitlesUrl || video.subtitles_url,
                  kind: 'subtitles',
                  srclang: 'en',
                  label: 'Subtitles',
                  default: true
                })
              );
            }

            if (Array.isArray(video.tracks)) {
              for (const t of video.tracks) {
                tracks.push(normalizeTrack(t));
              }
            }

            for (const t of tracks.filter(Boolean)) {
              const trackEl = document.createElement('track');
              trackEl.kind = t.kind;
              trackEl.src = t.src;
              trackEl.srclang = t.srclang;
              trackEl.label = t.label;
              if (t.default) trackEl.default = true;
              videoEl.appendChild(trackEl);
            }

            videoEl.addEventListener('error', () => {
              safeSetHTML(
                buildMessageCard({
                  title: 'Video unavailable',
                  message:
                    'This video could not be loaded.\n\n' +
                    (getFileExtension(video.url) === 'm3u8'
                      ? 'Note: .m3u8 (HLS) playback depends on your browser.'
                      : ''),
                  href: video.url,
                  linkText: 'Open video link'
                })
              );
            });

            safeSetElement(videoEl);

            // FIXED: Explicitly call play() to ensure it starts
            if (autoplay) {
              videoEl.play().catch(e => console.warn('Autoplay blocked:', e));
            }
          };

          // Show thumbnail overlay if poster exists AND no autoplay requested
          if (poster && !video.autoplay) {
            const overlay = createThumbnailOverlay(container, poster, () => {
              showVideoPlayer(true);
            });
            if (overlay) {
              container.innerHTML = '';
              container.appendChild(overlay);
            } else {
              showVideoPlayer(false);
            }
          } else {
            // Autoplay true or no poster
            showVideoPlayer(!!video.autoplay);
          }
          break;
        }

        default: {
          safeSetHTML(
            buildMessageCard({
              title: 'Video URL not supported',
              message: 'We could not determine how to play this video URL.',
              href: videoUrl,
              linkText: 'Open video link'
            })
          );
        }
      }
    }
  };
})();

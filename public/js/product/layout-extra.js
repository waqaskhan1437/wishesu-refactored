/*
 * Secondary layout helpers for the product page.
 * Appends description/reviews section and initializes video player.
 * Updated for Accessibility (Correct Heading Hierarchy h3 -> h2).
 */

;(function(){
  const PLAYER_OPTIONS = {
    controls: ['play-large','play','progress','current-time','mute','volume','fullscreen'],
    ratio: '16:9',
    clickToPlay: true,
    youtube: { noCookie: true, rel: 0, showinfo: 0, iv_load_policy: 3, modestbranding: 1 }
  };

  function splitUrlSuffix(raw) {
    const s = (raw || '').toString();
    const hashIndex = s.indexOf('#');
    const noHash = hashIndex === -1 ? s : s.slice(0, hashIndex);
    const hash = hashIndex === -1 ? '' : s.slice(hashIndex);
    const queryIndex = noHash.indexOf('?');
    const base = queryIndex === -1 ? noHash : noHash.slice(0, queryIndex);
    const query = queryIndex === -1 ? '' : noHash.slice(queryIndex);
    return { base, query, hash };
  }

  function optimizeGoogleusercontentUrl(src, targetWidth, targetHeight) {
    const s = (src || '').toString().trim();
    if (!s || !s.includes('googleusercontent.com')) return src;

    const { base, query, hash } = splitUrlSuffix(s);
    const m = base.match(/^(.*)=w(\d+)-h(\d+)(-[^?#]*)?$/);
    if (!m) return src;

    const prefix = m[1];
    const originalW = parseInt(m[2], 10) || 0;
    const originalH = parseInt(m[3], 10) || 0;
    const suffix = m[4] || '';

    const w = Math.max(1, Math.round(Number(targetWidth) || originalW || 0));
    let h = Math.round(Number(targetHeight) || 0);
    if (!h || !Number.isFinite(h)) {
      h = (originalW > 0 && originalH > 0) ? Math.round((originalH * w) / originalW) : 0;
    }
    if (!h || !Number.isFinite(h)) h = originalH || 1;

    return `${prefix}=w${w}-h${h}${suffix}${query}${hash}`;
  }

  function optimizeNavThumbUrl(src) {
    const s = (src || '').toString().trim();
    if (!s) return src;

    // 2x for retina (displayed at 60px square).
    const targetW = 120;

    if (s.includes('res.cloudinary.com')) {
      const cloudinaryRegex = /(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.*)/;
      const match = s.match(cloudinaryRegex);
      if (match) {
        const baseUrl = match[1];
        const imagePath = match[2];
        return `${baseUrl}f_auto,q_auto,w_${targetW}/${imagePath}`;
      }
    }

    if (s.includes('googleusercontent.com')) {
      return optimizeGoogleusercontentUrl(s, targetW);
    }

    return s;
  }

  const ALLOWED_DESCRIPTION_TAGS = new Set([
    'p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'em', 'b', 'i', 'u',
    'ul', 'ol', 'li',
    'a', 'blockquote', 'code', 'pre', 'hr', 'span'
  ]);

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function decodeBasicHtmlEntities(value) {
    let decoded = String(value || '');
    for (let i = 0; i < 2; i += 1) {
      const next = decoded
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'");
      if (next === decoded) break;
      decoded = next;
    }
    return decoded;
  }

  function sanitizeProductDescriptionHtml(rawInput) {
    const raw = String(rawInput || '').trim();
    if (!raw) return 'No description available.';

    const hasMarkupHint = /<[a-z!/][^>]*>/i.test(raw) || /&lt;[a-z!/]/i.test(raw);
    if (!hasMarkupHint) {
      return escapeHtml(raw).replace(/\n/g, '<br>');
    }

    let html = decodeBasicHtmlEntities(raw)
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
      .replace(/<object[\s\S]*?<\/object>/gi, '')
      .replace(/<embed[\s\S]*?>/gi, '')
      .replace(/<link[\s\S]*?>/gi, '')
      .replace(/<meta[\s\S]*?>/gi, '')
      .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

    html = html.replace(/<[^>]*>/g, (tag) => {
      if (/^<!--/.test(tag)) return '';

      const closeMatch = tag.match(/^<\s*\/\s*([a-z0-9]+)\s*>$/i);
      if (closeMatch) {
        const tagName = String(closeMatch[1] || '').toLowerCase();
        return ALLOWED_DESCRIPTION_TAGS.has(tagName) ? `</${tagName}>` : '';
      }

      const openMatch = tag.match(/^<\s*([a-z0-9]+)([^>]*)>$/i);
      if (!openMatch) return '';

      const tagName = String(openMatch[1] || '').toLowerCase();
      if (!ALLOWED_DESCRIPTION_TAGS.has(tagName)) return '';

      if (tagName === 'br' || tagName === 'hr') return `<${tagName}>`;

      if (tagName === 'a') {
        const attrs = String(openMatch[2] || '');
        const hrefMatch = attrs.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
        const targetMatch = attrs.match(/\btarget\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
        const hrefRaw = String((hrefMatch && (hrefMatch[1] || hrefMatch[2] || hrefMatch[3])) || '#').trim();
        const safeHref = /^(https?:\/\/|mailto:|tel:|\/|#)/i.test(hrefRaw) ? hrefRaw : '#';
        const targetRaw = String((targetMatch && (targetMatch[1] || targetMatch[2] || targetMatch[3])) || '').trim().toLowerCase();

        if (targetRaw === '_blank') {
          return `<a href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer">`;
        }
        return `<a href="${escapeHtml(safeHref)}">`;
      }

      return `<${tagName}>`;
    });

    const cleaned = html.trim();
    return cleaned || 'No description available.';
  }

  function renderProductDescription(wrapper, product) {
    let descRow = wrapper.querySelector('.product-desc-row');
    let descBox = descRow ? descRow.querySelector('.product-desc') : null;

    if (!descRow) {
      descRow = document.createElement('div');
      descRow.className = 'product-desc-row';
      wrapper.appendChild(descRow);
    }

    if (!descBox) {
      descBox = document.createElement('div');
      descBox.className = 'product-desc';
      descRow.appendChild(descBox);
    }

    // Keep server-rendered block when available; fallback to client markup only when missing.
    if (!descBox.querySelector('#reviews-container')) {
      const descText = sanitizeProductDescriptionHtml(product.description || '');
      const reviewCount = product.review_count || 0;
      const ratingAverage = product.rating_average || 0;
      descBox.innerHTML = `
        <h2>Description</h2>
        <div>${descText}</div>
        <hr style="margin: 2rem 0; border: 0; border-top: 1px solid #eee;">
        <h2>Customer Reviews</h2>
        ${reviewCount > 0 ? `
          <div style="background:#f9fafb; padding:1.5rem; border-radius:8px; text-align:center; color:#6b7280; margin-bottom: 2rem;">
            <span style="font-size:2rem;">&#11088; ${ratingAverage.toFixed(1)}</span>
            <p style="margin-top: 0.5rem;">Based on ${reviewCount} ${reviewCount === 1 ? 'review' : 'reviews'}</p>
          </div>
        ` : `
          <div style="background:#f9fafb; padding:1.5rem; border-radius:8px; text-align:center; color:#6b7280; margin-bottom: 2rem;">
            <div style="font-size:3rem; margin-bottom:15px;">&#11088;</div>
            <p>No reviews yet. Be the first to leave a review!</p>
          </div>
        `}
        <div id="reviews-container"></div>
      `;
    }

    // Add or reuse product navigation (Next/Previous buttons)
    let navSection = wrapper.querySelector('#product-navigation');
    if (!navSection) {
      navSection = document.createElement('div');
      navSection.id = 'product-navigation';
      navSection.className = 'product-navigation-section';
      wrapper.appendChild(navSection);
    }

    if (!navSection.querySelector('#prev-product-btn') || !navSection.querySelector('#next-product-btn')) {
      navSection.innerHTML = `
        <div style="display: flex; justify-content: center; align-items: center; padding: 30px 0; gap: 20px; flex-wrap: wrap;">
          <div id="prev-product-btn" style="flex: 1; max-width: 300px; min-width: 200px; display: none;"></div>
          <div id="next-product-btn" style="flex: 1; max-width: 300px; min-width: 200px; display: none;"></div>
        </div>
      `;
    }

    const renderAdjacentProducts = (data) => {
      const prevContainer = navSection.querySelector('#prev-product-btn');
      const nextContainer = navSection.querySelector('#next-product-btn');
      if (!prevContainer || !nextContainer) return;

      prevContainer.style.display = 'none';
      nextContainer.style.display = 'none';
      prevContainer.innerHTML = '';
      nextContainer.innerHTML = '';

      if (data && data.previous) {
        prevContainer.style.display = 'block';
        prevContainer.innerHTML = `
          <a href="${data.previous.url}" style="display: flex; align-items: center; gap: 12px; padding: 16px; background: #fff; border: 2px solid #e5e7eb; border-radius: 12px; text-decoration: none; color: inherit; transition: all 0.3s; box-shadow: 0 2px 8px rgba(0,0,0,0.05);" 
             onmouseenter="this.style.borderColor='#667eea'; this.style.boxShadow='0 4px 12px rgba(102,126,234,0.15)';"
             onmouseleave="this.style.borderColor='#e5e7eb'; this.style.boxShadow='0 2px 8px rgba(0,0,0,0.05)';">
            <div style="width: 60px; height: 60px; flex-shrink: 0; border-radius: 8px; overflow: hidden; background: #f3f4f6;">
              ${data.previous.thumbnail_url ? `<img src="${optimizeNavThumbUrl(data.previous.thumbnail_url)}" alt="" loading="lazy" decoding="async" width="60" height="60" style="width: 100%; height: 100%; object-fit: cover;">` : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#9ca3af;">&#128230;</div>'}
            </div>
            <div style="flex: 1; min-width: 0;">
              <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin-bottom: 4px;">&#8592; Previous</div>
              <div style="font-weight: 600; font-size: 14px; color: #1f2937; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${data.previous.title}</div>
            </div>
          </a>
        `;
      }

      if (data && data.next) {
        nextContainer.style.display = 'block';
        nextContainer.innerHTML = `
          <a href="${data.next.url}" style="display: flex; align-items: center; gap: 12px; padding: 16px; background: #fff; border: 2px solid #e5e7eb; border-radius: 12px; text-decoration: none; color: inherit; transition: all 0.3s; box-shadow: 0 2px 8px rgba(0,0,0,0.05); flex-direction: row-reverse; text-align: right;" 
             onmouseenter="this.style.borderColor='#667eea'; this.style.boxShadow='0 4px 12px rgba(102,126,234,0.15)';"
             onmouseleave="this.style.borderColor='#e5e7eb'; this.style.boxShadow='0 2px 8px rgba(0,0,0,0.05)';">
            <div style="width: 60px; height: 60px; flex-shrink: 0; border-radius: 8px; overflow: hidden; background: #f3f4f6;">
              ${data.next.thumbnail_url ? `<img src="${optimizeNavThumbUrl(data.next.thumbnail_url)}" alt="" loading="lazy" decoding="async" width="60" height="60" style="width: 100%; height: 100%; object-fit: cover;">` : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#9ca3af;">&#128230;</div>'}
            </div>
            <div style="flex: 1; min-width: 0;">
              <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin-bottom: 4px;">Next &#8594;</div>
              <div style="font-weight: 600; font-size: 14px; color: #1f2937; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${data.next.title}</div>
            </div>
          </a>
        `;
      }

      if (!data || (!data.previous && !data.next)) {
        navSection.style.display = 'none';
      } else {
        navSection.style.display = '';
      }
    };

    // Step 8: prefer bootstrap adjacent products to avoid extra API call on product page.
    if (product && product.adjacent && typeof product.adjacent === 'object') {
      renderAdjacentProducts(product.adjacent);
    } else if (product.id && typeof window.getAdjacentProducts === 'function') {
      window.getAdjacentProducts(product.id).then(function(data) {
        renderAdjacentProducts(data);
      }).catch(function(err) {
        console.warn('Failed to load adjacent products:', err);
        navSection.style.display = 'none';
      });
    }

    // Load reviews - first try from existing product data, then fallback to widget
    setTimeout(() => {
      const container = descBox.querySelector('#reviews-container') || document.getElementById('reviews-container');
      if (!container) return;
      
      // Always try to render reviews, either from embedded data or by fetching.
      if (typeof window.ReviewsWidget !== 'undefined') {
        if (product.reviews && product.reviews.length > 0) {
          // Use reviews from product data (more efficient)
          const grid = document.createElement('div');
          grid.className = 'reviews-grid';
          grid.style.cssText = 'display: grid; grid-template-columns: 1fr; gap: 25px; max-width: 1200px; margin: 0 auto;';

          const scrollToPlayer = () => {
            const target = document.getElementById('review-highlight') || document.getElementById('player');
            if (target && typeof target.scrollIntoView === 'function') {
              target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          };

          const showHighlight = (review) => {
            const highlight = document.getElementById('review-highlight');
            if (!highlight) return;

            const reviewerName = review.customer_name || review.author_name || 'Customer';
            const reviewText = review.review_text || review.comment || '';

            highlight.style.display = 'block';
            highlight.innerHTML = '';

            const strong = document.createElement('strong');
            strong.textContent = `${reviewerName} says: `;
            highlight.appendChild(strong);

            const span = document.createElement('span');
            span.textContent = reviewText ? `"${reviewText}"` : 'Shared a portfolio video.';
            highlight.appendChild(span);
          };

          const parseReviewVideoMetadata = (review) => {
            if (!review || !review.delivered_video_metadata) return {};
            try {
              const parsed = JSON.parse(review.delivered_video_metadata);
              return parsed && typeof parsed === 'object' ? parsed : {};
            } catch (_) {
              return {};
            }
          };

          // Try to show a frame from inside the video instead of external posters.
          const setVideoPreviewFrame = (videoEl) => {
            if (!videoEl) return;
            videoEl.addEventListener('loadedmetadata', () => {
              try {
                const duration = Number(videoEl.duration) || 0;
                if (!duration || !Number.isFinite(duration)) return;
                const target = duration > 8 ? 5 : Math.max(1, duration * 0.35);
                videoEl.currentTime = Math.min(target, Math.max(0.1, duration - 0.1));
              } catch (_) {
                // Ignore seek failures (cross-origin streams may block seeking).
              }
            }, { once: true });
          };

          const resolveReviewVideoMedia = (review) => {
            const metadata = parseReviewVideoMetadata(review);
            const youtubeUrl = (metadata.youtubeUrl || metadata.reviewYoutubeUrl || '').toString().trim();
            const fallbackUrl = (review.delivered_video_url || '').toString().trim();
            const videoUrl = youtubeUrl || fallbackUrl;

            const player = window.UniversalVideoPlayer;
            const detected = player && typeof player.detect === 'function' ? player.detect(videoUrl) : null;
            const isNativeVideo =
              !!detected && ['direct', 'cloudinary', 'bunny'].includes(detected.type);

            // Delivery/review videos should not use product thumbnail fallback.
            let posterUrl = '';
            if (!posterUrl && detected && detected.type === 'youtube' && detected.id) {
              posterUrl = `https://i.ytimg.com/vi/${detected.id}/hqdefault.jpg`;
            }

            return { videoUrl, posterUrl, isNativeVideo };
          };

          const setPlayerSource = (videoUrl, posterUrl) => {
            if (!videoUrl) return;
            
            const videoWrapper = document.querySelector('.video-wrapper');
            if (!videoWrapper) return;
            
            // Always clear the wrapper first for clean state
            videoWrapper.innerHTML = '';
            
            // Check if mobile
            const isMobile = window.innerWidth <= 768;
            
            // Create player container
            const playerContainer = document.createElement('div');
            playerContainer.id = 'universal-player-container';
            playerContainer.style.cssText = `width: 100%; height: 100%; min-height: ${isMobile ? '200px' : '300px'}; border-radius: 12px; overflow: visible; background: #000;`;
            videoWrapper.appendChild(playerContainer);

            const detected = typeof window.UniversalVideoPlayer !== 'undefined' && typeof window.UniversalVideoPlayer.detect === 'function'
              ? window.UniversalVideoPlayer.detect(videoUrl)
              : null;
            const useNativeMobile = isMobile && detected && ['direct', 'cloudinary', 'bunny'].includes(detected.type);
            
            // On mobile, use simple HTML5 video for better compatibility
            if (useNativeMobile) {
              const videoEl = document.createElement('video');
              videoEl.src = videoUrl;
              videoEl.controls = true;
              videoEl.autoplay = true;
              videoEl.playsInline = true;
              videoEl.setAttribute('playsinline', '');
              videoEl.setAttribute('webkit-playsinline', '');
              videoEl.muted = false;
              videoEl.style.cssText = 'width:100%; height:100%; min-height:200px; border-radius:12px; background:#000;';
              videoEl.controlsList = 'nodownload';
              if (posterUrl) videoEl.poster = posterUrl;
              setVideoPreviewFrame(videoEl);
              
              playerContainer.appendChild(videoEl);
              
              // Try to play
              videoEl.play().catch(e => {
                console.warn('Mobile autoplay blocked:', e);
                // Show play button if autoplay fails
                videoEl.controls = true;
              });
            } else {
              // Use UniversalVideoPlayer for YouTube, embeds, and desktop playback
              if (typeof window.UniversalVideoPlayer !== 'undefined') {
                window.UniversalVideoPlayer.render('universal-player-container', videoUrl, {
                  poster: posterUrl || '',
                  thumbnailUrl: posterUrl || '',
                  autoplay: true
                });
              } else if (detected && detected.type === 'youtube' && detected.id) {
                playerContainer.innerHTML = `
                  <iframe
                    src="https://www.youtube.com/embed/${detected.id}?autoplay=1&rel=0&modestbranding=1"
                    title="Review Video"
                    frameborder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowfullscreen
                    style="width:100%; height:100%; min-height:200px; border-radius:12px;"
                  ></iframe>
                `;
              } else {
                // Fallback
                playerContainer.innerHTML = `
                  <video 
                    src="${videoUrl}" 
                    controls 
                    autoplay 
                    playsinline 
                    style="width:100%; height:100%; min-height:200px; border-radius:12px; background:#000;"
                    ${posterUrl ? `poster="${posterUrl}"` : ''}
                  ></video>
                `;
              }
            }
          };

          const getReviewPayloadFromDataset = (el) => {
            if (!el || !el.dataset) return null;
            const videoUrl = (el.dataset.reviewVideoUrl || '').trim();
            if (!videoUrl) return null;
            return {
              videoUrl,
              posterUrl: (el.dataset.reviewPosterUrl || '').trim(),
              review: {
                customer_name: (el.dataset.reviewerName || '').trim(),
                author_name: (el.dataset.reviewerName || '').trim(),
                review_text: (el.dataset.reviewText || '').trim(),
                comment: (el.dataset.reviewText || '').trim()
              }
            };
          };

          const setActiveReviewThumb = (selectedEl) => {
            const slider = document.getElementById('thumbnails-slider');
            if (!slider) return;
            slider.querySelectorAll('.thumb, [data-review-slider-thumb=\"1\"]').forEach((node) => {
              if (node && node.style) node.style.border = '3px solid transparent';
            });
            if (selectedEl && selectedEl.style) {
              selectedEl.style.border = '3px solid #667eea';
            }
          };

          const setActiveReviewThumbByVideo = (videoUrl) => {
            if (!videoUrl) return;
            const slider = document.getElementById('thumbnails-slider');
            if (!slider) return;
            const target = Array.from(slider.querySelectorAll('[data-review-slider-thumb=\"1\"]'))
              .find((node) => (node.dataset.reviewVideoUrl || '').trim() === videoUrl);
            if (target) {
              setActiveReviewThumb(target);
            }
          };

          const bindSsrWatchTarget = (el, isSliderThumb) => {
            if (!el || el.dataset.reviewBound === '1') return;
            el.dataset.reviewBound = '1';
            el.addEventListener('click', (e) => {
              e.preventDefault();
              if (isSliderThumb) e.stopPropagation();
              const payload = getReviewPayloadFromDataset(el);
              if (!payload || !payload.videoUrl) return;
              showHighlight(payload.review);
              scrollToPlayer();
              setPlayerSource(payload.videoUrl, payload.posterUrl || null);
              if (isSliderThumb) {
                setActiveReviewThumb(el);
              } else {
                setActiveReviewThumbByVideo(payload.videoUrl);
              }
            });

            if (isSliderThumb) {
              el.addEventListener('mouseenter', () => {
                el.style.transform = 'scale(1.05)';
              });
              el.addEventListener('mouseleave', () => {
                el.style.transform = 'scale(1)';
              });
            }
          };

          // If SSR reviews already exist, hydrate behavior only and skip full client rebuild.
          const hasSsrReviewCards = container.querySelector('[data-ssr-review-card=\"1\"]');
          if (hasSsrReviewCards) {
            container.querySelectorAll('[data-review-watch=\"1\"]').forEach((el) => {
              const isSliderThumb = !!el.hasAttribute('data-review-slider-thumb');
              bindSsrWatchTarget(el, isSliderThumb);
            });
            const slider = document.getElementById('thumbnails-slider');
            if (slider) {
              slider.querySelectorAll('[data-review-slider-thumb=\"1\"]').forEach((el) => {
                bindSsrWatchTarget(el, true);
              });
            }
            if (typeof window.ReviewsWidget !== 'undefined' && typeof window.ReviewsWidget.addStyles === 'function') {
              window.ReviewsWidget.addStyles();
            }
            return;
          }

          // Pagination
          let currentPage = 1;
          const reviewsPerPage = 10;
          const totalPages = Math.ceil(product.reviews.length / reviewsPerPage);
          
          const renderPage = (page) => {
            currentPage = page;
            grid.innerHTML = '';
            const start = (page - 1) * reviewsPerPage;
            const end = start + reviewsPerPage;
            product.reviews.slice(start, end).forEach(review => {
            const temp = document.createElement('div');
            temp.innerHTML = window.ReviewsWidget.renderReview(review, true);
            const card = temp.firstElementChild;
            if (!card) return;
            
            // Add Read More functionality
            const reviewText = review.review_text || review.comment || '';
            if (reviewText) {
              const words = reviewText.split(' ');
              const maxWords = 60; // ~5 lines
              
              if (words.length > maxWords) {
                const shortText = words.slice(0, maxWords).join(' ') + '...';
                const fullText = reviewText;
                
                const textDiv = card.querySelector('.review-text') || document.createElement('div');
                textDiv.className = 'review-text';
                
                const textSpan = document.createElement('span');
                textSpan.textContent = shortText;
                textDiv.innerHTML = '';
                textDiv.appendChild(textSpan);
                
                const readMoreBtn = document.createElement('button');
                readMoreBtn.textContent = 'Read More';
                readMoreBtn.style.cssText = 'color:#667eea;background:none;border:none;cursor:pointer;font-weight:600;margin-left:6px;text-decoration:underline';
                
                let expanded = false;
                readMoreBtn.onclick = (e) => {
                  e.stopPropagation();
                  expanded = !expanded;
                  textSpan.textContent = expanded ? fullText : shortText;
                  readMoreBtn.textContent = expanded ? 'Read Less' : 'Read More';
                };
                
                textDiv.appendChild(readMoreBtn);
                
                if (!card.querySelector('.review-text')) {
                  card.appendChild(textDiv);
                }
              }
            }

            // Only show portfolio video if buyer explicitly allowed it
            const reviewMedia = resolveReviewVideoMedia(review);
            const portfolioVideoUrl = reviewMedia.videoUrl;
            const canWatch = !!portfolioVideoUrl && Number(review.show_on_product) === 1;

            if (canWatch) {
              const portfolioRow = document.createElement('div');
              portfolioRow.className = 'review-portfolio-row';
              portfolioRow.style.cssText = 'display:flex; align-items:center; gap:16px; margin-top:16px; padding-top:16px; border-top:1px solid #f3f4f6; flex-wrap:wrap;';

              // Create video thumbnail container - use video itself as thumbnail source
              const thumbContainer = document.createElement('div');
              thumbContainer.style.cssText = 'position:relative; width:260px; height:146px; flex-shrink:0; cursor:pointer; border-radius:10px; overflow:hidden; box-shadow:0 4px 6px rgba(0,0,0,0.1); transition:transform 0.2s, box-shadow 0.2s; background:#000;';

              if (reviewMedia.isNativeVideo) {
                // Use an actual video frame when source is a direct media URL.
                const videoThumb = document.createElement('video');
                videoThumb.src = portfolioVideoUrl;
                videoThumb.preload = 'metadata';
                videoThumb.style.cssText = 'width:100%; height:100%; object-fit:cover;';
                videoThumb.muted = true;
                videoThumb.playsInline = true;
                videoThumb.setAttribute('playsinline', '');
                videoThumb.controls = false;
                setVideoPreviewFrame(videoThumb);
                thumbContainer.appendChild(videoThumb);
              } else if (reviewMedia.posterUrl) {
                // For YouTube/embedded sources use poster image instead of <video>.
                const imageThumb = document.createElement('img');
                imageThumb.src = reviewMedia.posterUrl;
                imageThumb.alt = 'Review video thumbnail';
                imageThumb.loading = 'lazy';
                imageThumb.style.cssText = 'width:100%; height:100%; object-fit:cover;';
                thumbContainer.appendChild(imageThumb);
              }
              
              // Add "Review" badge overlay
              const reviewBadge = document.createElement('div');
              reviewBadge.textContent = 'Review';
              reviewBadge.style.cssText = 'position:absolute; top:8px; right:8px; background:rgba(16,185,129,0.95); color:white; padding:5px 12px; border-radius:6px; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; box-shadow:0 2px 6px rgba(0,0,0,0.3);';
              thumbContainer.appendChild(reviewBadge);
              
              // Add play icon overlay
              const playIcon = document.createElement('div');
              playIcon.innerHTML = '▶';
              playIcon.style.cssText = 'position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); background:rgba(0,0,0,0.75); color:white; width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:16px; padding-left:3px; transition:background 0.2s;';
              thumbContainer.appendChild(playIcon);

              const btn = document.createElement('button');
              btn.type = 'button';
              btn.textContent = '▶ Watch Video';
              btn.style.cssText = 'background:#111827; color:white; border:0; padding:12px 16px; border-radius:8px; cursor:pointer; font-weight:600; font-size:15px; transition:background 0.2s;';

              const onWatch = () => {
                showHighlight(review);
                scrollToPlayer();
                setPlayerSource(portfolioVideoUrl, reviewMedia.posterUrl || null);
              };
              
              // Hover effects
              thumbContainer.addEventListener('mouseenter', () => {
                thumbContainer.style.transform = 'scale(1.03)';
                thumbContainer.style.boxShadow = '0 6px 12px rgba(0,0,0,0.15)';
                playIcon.style.background = 'rgba(0,0,0,0.85)';
              });
              
              thumbContainer.addEventListener('mouseleave', () => {
                thumbContainer.style.transform = 'scale(1)';
                thumbContainer.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
                playIcon.style.background = 'rgba(0,0,0,0.75)';
              });
              
              btn.addEventListener('mouseenter', () => {
                btn.style.background = '#1f2937';
              });
              
              btn.addEventListener('mouseleave', () => {
                btn.style.background = '#111827';
              });

              thumbContainer.addEventListener('click', onWatch);
              btn.addEventListener('click', onWatch);

              portfolioRow.appendChild(thumbContainer);
              portfolioRow.appendChild(btn);
              card.appendChild(portfolioRow);
            }

            grid.appendChild(card);
            }); // End forEach
            
            // Pagination controls - add to grid so they don't get cleared
            if (totalPages > 1) {
              const pag = document.createElement('div');
              pag.style.cssText = 'display:flex;justify-content:center;gap:12px;margin-top:30px;padding:20px 0;';
              
              const prev = document.createElement('button');
              prev.textContent = '← Prev';
              prev.disabled = currentPage === 1;
              prev.style.cssText = `padding:10px 20px;background:${currentPage===1?'#999':'#667eea'};color:#fff;border:none;border-radius:8px;cursor:${currentPage===1?'not-allowed':'pointer'};font-weight:600`;
              if (currentPage > 1) prev.onclick = () => { renderPage(currentPage - 1); container.scrollIntoView({behavior:'smooth'}); };
              pag.appendChild(prev);
              
              const info = document.createElement('span');
              info.textContent = `Page ${currentPage} of ${totalPages}`;
              info.style.cssText = 'color:#666;font-weight:600;padding:10px;display:flex;align-items:center;';
              pag.appendChild(info);
              
              const next = document.createElement('button');
              next.textContent = 'Next →';
              next.disabled = currentPage === totalPages;
              next.style.cssText = `padding:10px 20px;background:${currentPage===totalPages?'#999':'#667eea'};color:#fff;border:none;border-radius:8px;cursor:${currentPage===totalPages?'not-allowed':'pointer'};font-weight:600`;
              if (currentPage < totalPages) next.onclick = () => { renderPage(currentPage + 1); container.scrollIntoView({behavior:'smooth'}); };
              pag.appendChild(next);
              
              grid.appendChild(pag);
            }
          }; // End renderPage
          
          // Gallery thumbnails - only last 20 reviews with allowed portfolio videos
          const reviewsWithVideo = product.reviews
            .map(review => ({ review, media: resolveReviewVideoMedia(review) }))
            .filter(item => !!item.media.videoUrl && Number(item.review.show_on_product) === 1);
          
          // Take only last 20 for slider
          const sliderReviews = reviewsWithVideo.slice(-20);
          
          // Intersection Observer for lazy loading video metadata
          const videoObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
              if (entry.isIntersecting) {
                const video = entry.target;
                if (video.dataset.src && !video.src) {
                  video.src = video.dataset.src;
                  video.preload = 'metadata';
                }
                videoObserver.unobserve(video);
              }
            });
          }, { rootMargin: '100px' });
          
          sliderReviews.forEach(item => {
            const review = item.review;
            const media = item.media;
            const portfolioVideoUrl = media.videoUrl;
            if (!portfolioVideoUrl || !window.productThumbnailsSlider) return;

            const galleryThumb = document.createElement('div');
            galleryThumb.style.cssText = 'position: relative; min-width: 140px; width: 140px; height: 100px; flex-shrink: 0; cursor: pointer; border-radius: 10px; overflow: hidden; border: 3px solid transparent; transition: border-color 0.15s ease, transform 0.15s ease; background:#1a1a2e; contain: layout style;';

            if (media.isNativeVideo) {
              const videoThumb = document.createElement('video');
              videoThumb.dataset.src = portfolioVideoUrl;
              videoThumb.preload = 'none';
              videoThumb.muted = true;
              videoThumb.playsInline = true;
              videoThumb.setAttribute('playsinline', '');
              videoThumb.setAttribute('webkit-playsinline', '');
              videoThumb.controls = false;
              videoThumb.style.cssText = 'width: 100%; height: 100%; object-fit: cover; pointer-events: none; background: #1a1a2e;';
              galleryThumb.appendChild(videoThumb);
              videoObserver.observe(videoThumb);
              setVideoPreviewFrame(videoThumb);
            } else if (media.posterUrl) {
              const imageThumb = document.createElement('img');
              imageThumb.src = media.posterUrl;
              imageThumb.alt = 'Review video thumbnail';
              imageThumb.loading = 'lazy';
              imageThumb.style.cssText = 'width: 100%; height: 100%; object-fit: cover; pointer-events: none; background: #1a1a2e;';
              galleryThumb.appendChild(imageThumb);
            }

            const badge = document.createElement('div');
            badge.textContent = 'Review';
            badge.style.cssText = 'position: absolute; bottom: 4px; right: 4px; background: rgba(16,185,129,0.95); color: white; padding: 3px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; z-index: 10;';

            const playIcon = document.createElement('div');
            playIcon.className = 'thumb-play-btn';
            playIcon.innerHTML = '▶';
            playIcon.style.cssText = 'position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); background:rgba(0,0,0,0.6); color:white; width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:12px; padding-left:2px; z-index:100; pointer-events:none;';

            galleryThumb.appendChild(badge);
            galleryThumb.appendChild(playIcon);

            galleryThumb.onclick = () => {
              document.querySelectorAll('#thumbnails-slider .thumb, #thumbnails-slider > div').forEach(t => {
                if (t.style) t.style.border = '3px solid transparent';
              });
              galleryThumb.style.border = '3px solid #667eea';

              showHighlight(review);
              scrollToPlayer();
              setPlayerSource(portfolioVideoUrl, media.posterUrl || null);
            };

            galleryThumb.onmouseenter = () => {
              galleryThumb.style.transform = 'scale(1.05)';
            };
            galleryThumb.onmouseleave = () => {
              galleryThumb.style.transform = 'scale(1)';
            };

            window.productThumbnailsSlider.appendChild(galleryThumb);
          });
          // Update slider arrows visibility after all thumbs added (single check instead of per-thumb)
          if (sliderReviews.length > 0) {
            setTimeout(() => {
              const slider = window.productThumbnailsSlider;
              const container = slider ? slider.parentElement : null;
              if (slider && container && slider.scrollWidth > slider.clientWidth) {
                const leftArrow = container.querySelector('button:first-of-type');
                const rightArrow = container.querySelector('button:last-of-type');
                if (leftArrow) leftArrow.style.display = 'block';
                if (rightArrow) rightArrow.style.display = 'block';
              }
            }, 100);
          }

          // Initial render - add grid to container first, then render page
          container.innerHTML = '';
          container.appendChild(grid);
          renderPage(1);

          // Add styles if needed
          window.ReviewsWidget.addStyles();
        }
      } else if (typeof window.ReviewsWidget !== 'undefined' && product.id) {
        // Fallback to API call for reviews
        window.ReviewsWidget.render('reviews-container', {
          productId: product.id,
          limit: 50,
          columns: 1,
          showAvatar: true
        });
      } else {
        // No reviews widget available and no reviews in product data
        container.innerHTML = `
          <div style="text-align: center; padding: 40px; color: #6b7280;">
            <div style="font-size: 3rem; margin-bottom: 15px;">⭐</div>
            <p>No reviews yet. Be the first to leave a review!</p>
          </div>
        `;
      }
    }, 100);
  }

  function initializePlayer(hasVideo) {
    if (!hasVideo) return;
    // Small delay to ensure DOM is ready
    setTimeout(function() {
      if (document.getElementById('player')) {
        // Lazy load Plyr only when needed
        if (typeof window.loadPlyr === 'function') {
          window.loadPlyr(function() {
            if (window.Plyr) {
              try {
                if (window.productPlayer && typeof window.productPlayer.destroy === 'function') {
                  window.productPlayer.destroy();
                }
              } catch (_) {}
              window.productPlayer = new window.Plyr('#player', PLAYER_OPTIONS);
            }
          });
        } else if (window.Plyr) {
          // Plyr already loaded
          try {
            if (window.productPlayer && typeof window.productPlayer.destroy === 'function') {
              window.productPlayer.destroy();
            }
          } catch (_) {}
          window.productPlayer = new window.Plyr('#player', PLAYER_OPTIONS);
        }
      }
    }, 100);
  }

  window.renderProductDescription = renderProductDescription;
  window.initializePlayer = initializePlayer;
})();


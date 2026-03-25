/*
 * Construct the primary layout for the product detail page.
 * Builds media column, info column, and addons form.
 * Updated: Implements Click-to-Load Facade for Video to ensure thumbnail visibility.
 */

;(function(){
  // Helpers to optimize image URLs for Cloudinary + Googleusercontent.
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
    // Googleusercontent sizing typically ends with `=w600-h315-...`
    const m = base.match(/^(.*)=w(\d+)-h(\d+)(-[^?#]*)?$/);
    if (!m) return src;

    const prefix = m[1];
    const originalW = parseInt(m[2], 10) || 0;
    const originalH = parseInt(m[3], 10) || 0;
    const suffix = m[4] || '';

    const w = Math.max(1, Math.round(Number(targetWidth) || originalW || 0));
    let h = Math.round(Number(targetHeight) || 0);
    if (!h || !Number.isFinite(h)) {
      // Preserve aspect ratio when only width is provided.
      h = (originalW > 0 && originalH > 0) ? Math.round((originalH * w) / originalW) : 0;
    }
    if (!h || !Number.isFinite(h)) h = originalH || 1;

    return `${prefix}=w${w}-h${h}${suffix}${query}${hash}`;
  }

  function optimizeCloudinaryUrl(src, width) {
    if (!src || !src.includes('res.cloudinary.com')) return src;
    const cloudinaryRegex = /(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.*)/;
    const match = src.match(cloudinaryRegex);
    if (match) {
      const baseUrl = match[1];
      const imagePath = match[2];
      return `${baseUrl}f_auto,q_auto,w_${width || 400}/${imagePath}`;
    }
    return src;
  }

  function optimizeImageUrl(src, width, height) {
    const s = (src || '').toString().trim();
    if (!s) return src;
    if (s.includes('res.cloudinary.com')) return optimizeCloudinaryUrl(s, width);
    if (s.includes('googleusercontent.com')) return optimizeGoogleusercontentUrl(s, width, height);
    return s;
  }

  function isLikelyVideoUrl(url) {
    const s = (url || '').toString().trim().toLowerCase();
    if (!s) return false;
    if (s.includes('youtube.com') || s.includes('youtu.be')) return true;
    return /\.(mp4|webm|mov|mkv|avi|m4v|flv|wmv|m3u8|mpd)(?:[?#]|$)/i.test(s);
  }

  function isBadMediaValue(url) {
    const s = (url || '').toString().trim().toLowerCase();
    if (!s) return true;
    if (s === 'null' || s === 'undefined' || s === 'false' || s === 'true' || s === '0') return true;
    return false;
  }

  function isLikelyImageUrl(url) {
    const s = (url || '').toString().trim().toLowerCase();
    if (!s) return false;
    if (s.startsWith('data:image/')) return true;
    if (s.startsWith('/')) return true;
    return s.startsWith('http://') || s.startsWith('https://');
  }

  function normalizeMediaUrl(url) {
    const raw = (url || '').toString().trim();
    if (!raw) return '';
    try {
      const u = new URL(raw, window.location.origin);
      u.hash = '';
      u.search = '';
      return u.toString();
    } catch (_) {
      return raw.split('#')[0].split('?')[0];
    }
  }

  function renderProductMain(container, product, addonGroups) {
    const ssrRoot = (() => {
      try {
        return container.querySelector('.product-page[data-ssr-step="player"]') ||
          container.querySelector('.product-page') ||
          null;
      } catch (_) {
        return null;
      }
    })();

    const ssrMediaSnapshot = (() => {
      try {
        const node = ssrRoot ? ssrRoot.querySelector('.product-media-col') : null;
        return node ? node.cloneNode(true) : null;
      } catch (_) {
        return null;
      }
    })();

    const ssrDescSnapshot = (() => {
      try {
        const node = ssrRoot ? ssrRoot.querySelector('.product-desc-row') : null;
        return node ? node.cloneNode(true) : null;
      } catch (_) {
        return null;
      }
    })();

    const ssrNavSnapshot = (() => {
      try {
        const node = ssrRoot ? ssrRoot.querySelector('#product-navigation') : null;
        return node ? node.cloneNode(true) : null;
      } catch (_) {
        return null;
      }
    })();

    const ssrInfoSnapshot = (() => {
      try {
        const node = ssrRoot ? ssrRoot.querySelector('.product-info-col') : null;
        return node ? node.cloneNode(true) : null;
      } catch (_) {
        return null;
      }
    })();

    const wrapper = document.createElement('div');
    wrapper.className = 'product-page';
    
    const mainRow = document.createElement('div');
    mainRow.className = 'product-main-row';
    
    // --- Left Column: Media ---
    let leftCol = document.createElement('div');
    leftCol.className = 'product-media-col';

    const reviewHighlight = document.createElement('div');
    reviewHighlight.id = 'review-highlight';
    reviewHighlight.style.cssText = 'display:none; background:#f0fdf4; padding:10px; margin-bottom:10px; border-radius:8px;';
    leftCol.appendChild(reviewHighlight);
    
    const videoWrapper = document.createElement('div');
    videoWrapper.className = 'video-wrapper';
    videoWrapper.style.cssText = 'aspect-ratio: 16/9; width: 100%;';
    let hasVideo = false;

    const hydrateSsrMedia = (mediaCol) => {
      if (!mediaCol) return;

      const existingHighlight = mediaCol.querySelector('#review-highlight');
      if (!existingHighlight) {
        const reviewHighlight = document.createElement('div');
        reviewHighlight.id = 'review-highlight';
        reviewHighlight.style.cssText = 'display:none; background:#f0fdf4; padding:10px; margin-bottom:10px; border-radius:8px;';
        mediaCol.insertBefore(reviewHighlight, mediaCol.firstChild || null);
      }

      const localVideoWrapper = mediaCol.querySelector('.video-wrapper');
      const thumbsDiv = mediaCol.querySelector('#thumbnails-slider');
      if (!localVideoWrapper || !thumbsDiv) return;

      const bindFacadePlayer = (facadeEl) => {
        if (!facadeEl) return;
        const playBtn = facadeEl.querySelector('.play-btn-overlay');
        const loadVideo = () => {
          localVideoWrapper.innerHTML = '';
          const isMobile = window.innerWidth <= 768;
          const playerContainer = document.createElement('div');
          playerContainer.id = 'universal-player-container';
          playerContainer.style.cssText = `width: 100%; height: 100%; min-height: ${isMobile ? '200px' : '300px'}; border-radius: 12px; overflow: visible; background: #000;`;
          localVideoWrapper.appendChild(playerContainer);

          if (isMobile) {
            const videoEl = document.createElement('video');
            videoEl.src = product.video_url;
            videoEl.controls = true;
            videoEl.preload = 'metadata';
            videoEl.autoplay = false;
            videoEl.playsInline = true;
            videoEl.setAttribute('playsinline', '');
            videoEl.setAttribute('webkit-playsinline', '');
            videoEl.style.cssText = 'width:100%; height:100%; min-height:200px; border-radius:12px; background:#000;';
            videoEl.controlsList = 'nodownload';
            playerContainer.appendChild(videoEl);
          } else if (typeof window.UniversalVideoPlayer !== 'undefined') {
            window.UniversalVideoPlayer.render('universal-player-container', product.video_url, {
              poster: null,
              thumbnailUrl: null,
              autoplay: true
            });
          } else {
            playerContainer.innerHTML = `<video src="${product.video_url}" controls autoplay playsinline style="width:100%;height:100%;min-height:200px;"></video>`;
          }
        };

        facadeEl.onclick = loadVideo;
        if (playBtn) {
          playBtn.onclick = (e) => {
            e.stopPropagation();
            loadVideo();
          };
        }
      };

      const renderMainFacade = () => {
        localVideoWrapper.innerHTML = '';
        if (!product.video_url) {
          const mainImg = createMainImage(product.thumbnail_url || 'https://via.placeholder.com/600');
          mainImg.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;border-radius:12px;';
          localVideoWrapper.appendChild(mainImg);
          return;
        }
        const facade = document.createElement('div');
        facade.className = 'video-facade';
        facade.style.cssText = 'position: relative; width: 100%; cursor: pointer; background: #000; aspect-ratio: 16/9; border-radius: 12px; overflow: hidden;';
        const img = createMainImage(product.thumbnail_url || 'https://via.placeholder.com/600');
        img.style.cssText = 'width: 100%; height: 100%; object-fit: cover; display: block;';
        facade.appendChild(img);
        const playBtn = document.createElement('button');
        playBtn.className = 'play-btn-overlay';
        playBtn.type = 'button';
        playBtn.setAttribute('aria-label', 'Play video');
        playBtn.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%, -50%);width:80px;height:80px;background:rgba(0,0,0,0.7);border-radius:50%;border:none;display:flex;align-items:center;justify-content:center;color:white;z-index:10;cursor:pointer;';
        playBtn.innerHTML = `
          <svg width="40" height="40" viewBox="0 0 24 24" fill="white" aria-hidden="true" focusable="false">
            <path d="M8 5v14l11-7z"></path>
          </svg>`;
        facade.appendChild(playBtn);
        localVideoWrapper.appendChild(facade);
        bindFacadePlayer(facade);
      };

      const renderGalleryImage = (src) => {
        localVideoWrapper.innerHTML = '';
        const largeImg = createMainImage(src || product.thumbnail_url || '');
        largeImg.style.width = '100%';
        largeImg.style.height = '100%';
        largeImg.style.objectFit = 'contain';
        localVideoWrapper.appendChild(largeImg);
      };

      const setActiveThumb = (target) => {
        thumbsDiv.querySelectorAll('.thumb').forEach((thumb) => {
          thumb.classList.remove('active');
          thumb.style.border = '3px solid transparent';
        });
        if (target) {
          target.classList.add('active');
          target.style.border = '3px solid #667eea';
        }
      };

      Array.from(thumbsDiv.querySelectorAll('.thumb')).forEach((thumb, idx) => {
        if (thumb.dataset.ssrHydrated === '1') return;
        thumb.dataset.ssrHydrated = '1';
        thumb.onclick = () => {
          setActiveThumb(thumb);
          const mediaKind = (thumb.dataset.mediaKind || '').toLowerCase();
          const mediaSrc = (thumb.dataset.mediaSrc || thumb.getAttribute('src') || '').trim();
          if (mediaKind === 'video-main' && product.video_url) {
            renderMainFacade();
          } else {
            renderGalleryImage(mediaSrc || (idx === 0 ? product.thumbnail_url : ''));
          }
        };
      });

      const sliderContainer = thumbsDiv.parentElement;
      if (sliderContainer) {
        let leftArrow = sliderContainer.querySelector('[data-ssr-slider-arrow="left"]');
        let rightArrow = sliderContainer.querySelector('[data-ssr-slider-arrow="right"]');

        const arrowBaseStyle = 'position:absolute;top:50%;transform:translateY(-50%);background:rgba(0,0,0,0.7);color:white;border:none;width:35px;height:35px;border-radius:50%;cursor:pointer;font-size:24px;z-index:10;display:none;';

        if (!leftArrow) {
          leftArrow = document.createElement('button');
          leftArrow.type = 'button';
          leftArrow.setAttribute('aria-label', 'Previous thumbnails');
          leftArrow.setAttribute('data-ssr-slider-arrow', 'left');
          leftArrow.textContent = '‹';
          leftArrow.style.cssText = `left:0;${arrowBaseStyle}`;
          sliderContainer.appendChild(leftArrow);
        }
        if (!rightArrow) {
          rightArrow = document.createElement('button');
          rightArrow.type = 'button';
          rightArrow.setAttribute('aria-label', 'Next thumbnails');
          rightArrow.setAttribute('data-ssr-slider-arrow', 'right');
          rightArrow.textContent = '›';
          rightArrow.style.cssText = `right:0;${arrowBaseStyle}`;
          sliderContainer.appendChild(rightArrow);
        }

        const updateArrowVisibility = () => {
          const canScroll = thumbsDiv.scrollWidth > thumbsDiv.clientWidth + 2;
          leftArrow.style.display = canScroll ? 'block' : 'none';
          rightArrow.style.display = canScroll ? 'block' : 'none';
        };

        // Guard to avoid duplicate listeners/observers if hydration runs again.
        if (thumbsDiv.dataset.ssrSliderBound !== '1') {
          thumbsDiv.dataset.ssrSliderBound = '1';
          leftArrow.onclick = () => thumbsDiv.scrollBy({ left: -160, behavior: 'smooth' });
          rightArrow.onclick = () => thumbsDiv.scrollBy({ left: 160, behavior: 'smooth' });
          thumbsDiv.addEventListener('scroll', updateArrowVisibility, { passive: true });
          window.addEventListener('resize', updateArrowVisibility);
          try {
            const observer = new MutationObserver(updateArrowVisibility);
            observer.observe(thumbsDiv, { childList: true, subtree: false });
          } catch (_) {}
        }
        updateArrowVisibility();
      }

      const initialFacade = localVideoWrapper.querySelector('.video-facade');
      if (initialFacade) {
        bindFacadePlayer(initialFacade);
      }

      window.productThumbnailsSlider = thumbsDiv;
    };

    const hydrateSsrInfoColumn = (infoCol) => {
      if (!infoCol) return;
      const panel = infoCol.querySelector('.product-info-panel');
      if (!panel) return;

      // Keep same delivery-badge behavior as client-rendered panel.
      const getDeliveryText = (isInstant, days) => {
        if (isInstant) return 'Instant Delivery In 60 Minutes';
        const dayNum = parseInt(days, 10) || 1;
        if (dayNum === 1) return '24 Hour Express Delivery';
        return `${dayNum} Days Delivery`;
      };

      const computeDeliveryBadge = (label) => {
        const raw = (label || '').toString();
        const v = raw.toLowerCase();
        if (v.includes('instant') || v.includes('60') || v.includes('1 hour')) {
          return { icon: '&#9889;', text: raw || 'Instant Delivery In 60 Minutes' };
        }
        if (v.includes('24') || v.includes('express') || v.includes('1 day') || v.includes('24 hour')) {
          return { icon: '&#128640;', text: raw || '24 Hour Express Delivery' };
        }
        if (v.includes('48') || v.includes('2 day')) {
          return { icon: '&#128230;', text: raw || '2 Days Delivery' };
        }
        if (v.includes('3 day') || v.includes('72')) {
          return { icon: '&#128197;', text: raw || '3 Days Delivery' };
        }
        const daysMatch = v.match(/(\d+)\s*day/i);
        if (daysMatch) {
          const numDays = parseInt(daysMatch[1], 10) || 2;
          return { icon: '&#128230;', text: raw || `${numDays} Days Delivery` };
        }
        return { icon: '&#128666;', text: raw || '2 Days Delivery' };
      };

      const setDeliveryBadge = (label) => {
        const deliveryBadge = computeDeliveryBadge(label);
        const iconEl = panel.querySelector('#delivery-badge-icon');
        const textEl = panel.querySelector('#delivery-badge-text');
        if (iconEl) iconEl.innerHTML = deliveryBadge.icon;
        if (textEl) textEl.textContent = deliveryBadge.text;
      };

      let initialDeliveryLabel = '';
      const deliveryField = (addonGroups || []).find((g) => (
        g &&
        g.id === 'delivery-time' &&
        (g.type === 'radio' || g.type === 'select') &&
        Array.isArray(g.options)
      ));
      if (deliveryField) {
        const defaultOption = deliveryField.options.find((o) => o && o.default) || deliveryField.options[0];
        if (defaultOption) {
          if (defaultOption.delivery && typeof defaultOption.delivery === 'object') {
            initialDeliveryLabel = getDeliveryText(
              !!defaultOption.delivery.instant,
              parseInt(defaultOption.delivery.days, 10) || 1
            );
          } else {
            initialDeliveryLabel = defaultOption.label || '';
          }
        }
      }
      if (!initialDeliveryLabel) {
        initialDeliveryLabel = getDeliveryText(
          !!product.instant_delivery,
          parseInt(product.delivery_time_days, 10) || parseInt(product.normal_delivery_text, 10) || 1
        );
      }
      setDeliveryBadge(initialDeliveryLabel);
      window.updateDeliveryBadge = setDeliveryBadge;

      const bookNowBtn = panel.querySelector('#book-now-trigger');
      const addonsContainer = panel.querySelector('#addons-container');
      if (!bookNowBtn || !addonsContainer) return;

      // Keep button text aligned with runtime price.
      bookNowBtn.innerHTML = '<span aria-hidden="true">&#127916;</span> Book Now - $' + window.basePrice.toLocaleString();
      bookNowBtn.setAttribute('aria-expanded', 'false');
      bookNowBtn.setAttribute('aria-controls', 'addons-container');
      bookNowBtn.style.cssText = `
        width: 100%;
        padding: 16px 24px;
        margin-top: 1.5rem;
        background: linear-gradient(135deg, #FFD700 0%, #FFC107 100%);
        color: #000;
        border: none;
        border-radius: 12px;
        font-size: 1.2rem;
        font-weight: 700;
        cursor: pointer;
        transition: transform 0.15s ease, filter 0.15s ease;
        box-shadow: 0 4px 15px rgba(255, 215, 0, 0.4);
      `;

      // Rebuild addon controls with JS-enabled renderer to attach full behavior.
      let addonsForm = addonsContainer.querySelector('#addons-form');
      if (typeof window.renderAddonField === 'function') {
        const nextForm = document.createElement('form');
        nextForm.id = 'addons-form';
        nextForm.style.cssText = 'padding-top: 1.5rem; border-top: 1px solid #e5e7eb; margin-top: 1.5rem;';

        if (addonGroups && addonGroups.length > 0) {
          addonGroups.forEach(group => {
            if (group.type === 'heading') {
              const h = document.createElement('h3');
              h.textContent = group.text || group.label;
              h.style.marginTop = '1.5rem';
              h.style.fontSize = '1.1rem';
              nextForm.appendChild(h);
            } else {
              nextForm.appendChild(window.renderAddonField(group));
            }
          });
        }

        if (addonsForm && addonsForm.parentNode) {
          addonsForm.parentNode.replaceChild(nextForm, addonsForm);
        } else {
          addonsContainer.insertBefore(nextForm, addonsContainer.firstChild || null);
        }
        addonsForm = nextForm;
      }

      // Remove any existing checkout footer (SSR or prior client render) to prevent duplicate checkout buttons/IDs.
      Array.from(addonsContainer.children).forEach((child) => {
        if (!child || child.id === 'addons-form') return;
        if (child.getAttribute && child.getAttribute('data-checkout-footer') === '1') {
          child.remove();
          return;
        }
        const hasCheckoutControls = !!(child.querySelector && (child.querySelector('#checkout-btn') || child.querySelector('#apple-pay-btn')));
        if (hasCheckoutControls) child.remove();
      });

      const stickyFooter = document.createElement('div');
      stickyFooter.dataset.checkoutFooter = '1';
      stickyFooter.style.marginTop = '2rem';
      stickyFooter.style.paddingTop = '1rem';
      stickyFooter.style.borderTop = '1px solid #e5e5e5';

      const useMinimal = window.whopSettings && window.whopSettings.enable_minimal_checkout;
      if (useMinimal) {
        const btnContainer = document.createElement('div');
        btnContainer.style.cssText = 'display: flex; gap: 12px; flex-wrap: wrap;';
        btnContainer.setAttribute('role', 'group');
        btnContainer.setAttribute('aria-label', 'Payment options');

        const applePayBtn = document.createElement('button');
        applePayBtn.id = 'apple-pay-btn';
        applePayBtn.type = 'button';
        applePayBtn.className = 'btn-buy';
        applePayBtn.setAttribute('aria-label', 'Pay with Apple Pay');
        applePayBtn.style.cssText = 'flex: 1; min-width: 140px; background: #000; color: #fff;';
        applePayBtn.innerHTML = '<span aria-hidden="true"></span> Pay';
        applePayBtn.addEventListener('click', function(e) {
          e.preventDefault();
          if (typeof handleCheckout === 'function') handleCheckout();
        });

        const cardBtn = document.createElement('button');
        cardBtn.id = 'checkout-btn';
        cardBtn.type = 'button';
        cardBtn.className = 'btn-buy';
        cardBtn.setAttribute('aria-label', 'Pay with credit or debit card');
        cardBtn.style.cssText = 'flex: 1; min-width: 140px; background: #2563eb; color: #fff;';
        cardBtn.innerHTML = 'Pay with Card <span aria-hidden="true">&#128179;</span>';
        cardBtn.addEventListener('click', function(e) {
          e.preventDefault();
          if (typeof handleCheckout === 'function') handleCheckout();
        });

        btnContainer.appendChild(applePayBtn);
        btnContainer.appendChild(cardBtn);
        stickyFooter.appendChild(btnContainer);
      } else {
        const checkoutBtn = document.createElement('button');
        checkoutBtn.id = 'checkout-btn';
        checkoutBtn.type = 'button';
        checkoutBtn.className = 'btn-buy';
        checkoutBtn.innerHTML = '<span aria-hidden="true">&#9989;</span> Proceed to Checkout - $' + window.currentTotal.toLocaleString();
        checkoutBtn.addEventListener('click', function(e) {
          e.preventDefault();
          if (typeof handleCheckout === 'function') handleCheckout();
        });
        stickyFooter.appendChild(checkoutBtn);
      }
      addonsContainer.appendChild(stickyFooter);

      if (bookNowBtn.dataset.ssrToggleBound !== '1') {
        bookNowBtn.dataset.ssrToggleBound = '1';
        let isExpanded = false;

        bookNowBtn.addEventListener('click', function(e) {
          e.preventDefault();
          if (!isExpanded) {
            Array.from(panel.children).forEach(child => {
              if (child !== bookNowBtn && child !== addonsContainer) {
                child.dataset.origDisplay = child.style.display || '';
                child.style.display = 'none';
              }
            });

            addonsContainer.classList.add('expanding');
            addonsContainer.style.maxHeight = addonsContainer.scrollHeight + 1000 + 'px';
            addonsContainer.style.opacity = '1';
            addonsContainer.style.overflow = 'hidden';
            bookNowBtn.innerHTML = '<span aria-hidden="true">&#9650;</span> Close Form';
            bookNowBtn.setAttribute('aria-expanded', 'true');
            bookNowBtn.style.background = 'linear-gradient(135deg, #D1A20D 0%, #AF8A0E 100%)';
            bookNowBtn.style.boxShadow = '0 4px 15px rgba(209, 162, 13, 0.4)';
            bookNowBtn.style.color = '#000';
            isExpanded = true;

            setTimeout(() => {
              addonsContainer.classList.remove('expanding');
              addonsContainer.classList.add('expanded');
              addonsContainer.style.maxHeight = 'none';
              addonsContainer.style.overflow = 'visible';
            }, 550);

            setTimeout(() => {
              if (addonsForm && typeof addonsForm.scrollIntoView === 'function') {
                addonsForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }, 100);
          } else {
            addonsContainer.classList.remove('expanded');
            addonsContainer.style.overflow = 'hidden';
            addonsContainer.style.maxHeight = addonsContainer.scrollHeight + 'px';
            addonsContainer.offsetHeight;
            addonsContainer.style.maxHeight = '0';
            addonsContainer.style.opacity = '0';
            bookNowBtn.innerHTML = '<span aria-hidden="true">&#127916;</span> Book Now - $' + window.basePrice.toLocaleString();
            bookNowBtn.setAttribute('aria-expanded', 'false');
            bookNowBtn.style.background = 'linear-gradient(135deg, #FFD700 0%, #FFC107 100%)';
            bookNowBtn.style.boxShadow = '0 4px 15px rgba(255, 215, 0, 0.4)';
            bookNowBtn.style.color = '#000';

            Array.from(panel.children).forEach(child => {
              if (child !== bookNowBtn && child !== addonsContainer) {
                const orig = child.dataset.origDisplay;
                child.style.display = orig !== undefined ? orig : '';
              }
            });
            isExpanded = false;
          }
        });
      }

      window.updateCheckoutPrice = function(newTotal) {
        const checkoutBtn = document.getElementById('checkout-btn');
        if (checkoutBtn && !useMinimal && !checkoutBtn.classList.contains('btn-loading')) {
          checkoutBtn.textContent = '✅ Proceed to Checkout - $' + newTotal.toLocaleString();
        }
      };
    };

    // Helper to create main image with SEO/LCP optimizations
    const createMainImage = (src) => {
      const img = document.createElement('img');
      
      // Optimize image URLs and add responsive srcset when possible.
      const rawSrc = (src || '').toString().trim();
      let optimizedSrc = rawSrc;
      let srcsetAttr = '';

      if (rawSrc && rawSrc.includes('res.cloudinary.com')) {
        // Extract parts of Cloudinary URL and add transformations
        const cloudinaryRegex = /(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.*)/;
        const match = rawSrc.match(cloudinaryRegex);
        if (match) {
          const baseUrl = match[1];
          const imagePath = match[2];

          // Use a reasonable default fallback; browsers will pick the right candidate from srcset.
          optimizedSrc = `${baseUrl}f_auto,q_auto,w_800/${imagePath}`;

          srcsetAttr = [
            `${baseUrl}f_auto,q_auto,w_400/${imagePath} 400w`,
            `${baseUrl}f_auto,q_auto,w_600/${imagePath} 600w`,
            `${baseUrl}f_auto,q_auto,w_800/${imagePath} 800w`,
            `${baseUrl}f_auto,q_auto,w_1200/${imagePath} 1200w`
          ].join(', ');
        }
      } else if (rawSrc && rawSrc.includes('googleusercontent.com')) {
        // Common for Google Photos / Googleusercontent thumbnails.
        optimizedSrc = optimizeImageUrl(rawSrc, 600);
        srcsetAttr = [400, 600, 800, 1200]
          .map(w => `${optimizeImageUrl(rawSrc, w)} ${w}w`)
          .join(', ');
      }
      
      img.src = optimizedSrc;
      if (srcsetAttr) {
        img.srcset = srcsetAttr;
        img.sizes = '(max-width: 600px) 100vw, (max-width: 900px) 55vw, 650px';
      }
      
      img.className = 'main-img';
      // Fix Accessibility: Add Alt text
      img.alt = product.title || 'Product Image';
      // Fix Performance: Prioritize loading for LCP
      img.setAttribute('fetchpriority', 'high');
      img.loading = 'eager';
      // Add explicit dimensions to prevent layout shift (container is 16:9).
      img.width = 800;
      img.height = 450;
      img.decoding = 'async';
      return img;
    };

    // Step 7: when full SSR shell already exists, hydrate in place and skip full client rebuild.
    if (ssrRoot && ssrMediaSnapshot && ssrInfoSnapshot) {
      const ssrMainRow = ssrRoot.querySelector('.product-main-row');
      const ssrLeftCol = ssrMainRow ? ssrMainRow.querySelector('.product-media-col') : null;
      const ssrRightCol = ssrMainRow ? ssrMainRow.querySelector('.product-info-col') : null;

      if (ssrLeftCol) {
        hasVideo = !!product.video_url;
        hydrateSsrMedia(ssrLeftCol);
      }

      if (ssrRightCol) {
        hydrateSsrInfoColumn(ssrRightCol);
      }

      if (!ssrRoot.querySelector('.product-desc-row') && ssrDescSnapshot) {
        ssrRoot.appendChild(ssrDescSnapshot.cloneNode(true));
      }
      if (!ssrRoot.querySelector('#product-navigation') && ssrNavSnapshot) {
        ssrRoot.appendChild(ssrNavSnapshot.cloneNode(true));
      }

      container.className = '';
      if (!container.contains(ssrRoot)) {
        container.innerHTML = '';
        container.appendChild(ssrRoot);
      }

      return { wrapper: ssrRoot, hasVideo: hasVideo };
    }

    if (product.video_url) {
      // --- FIX: Manual Facade implementation ---
      // Instead of loading the heavy player immediately, we load the image + play button.
      // This ensures the thumbnail IS ALWAYS VISIBLE first.
      
      const facade = document.createElement('div');
      facade.className = 'video-facade';
      facade.style.cssText = 'position: relative; width: 100%; cursor: pointer; background: #000; aspect-ratio: 16/9; border-radius: 12px; overflow: hidden;';
      
      // 1. The Image
      const img = createMainImage(product.thumbnail_url || 'https://via.placeholder.com/600');
      img.style.cssText = 'width: 100%; height: 100%; object-fit: cover; display: block;';
      facade.appendChild(img);

      // 2. The Play Button Overlay - positioned above image (Accessibility Enhanced)
      const playBtn = document.createElement('button');
      playBtn.className = 'play-btn-overlay';
      playBtn.type = 'button';
      playBtn.setAttribute('aria-label', 'Play video');
      playBtn.setAttribute('role', 'button');
      playBtn.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 80px;
        height: 80px;
        background: rgba(0, 0, 0, 0.7);
        border-radius: 50%;
        border: none;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        transition: background-color 0.15s ease, transform 0.15s ease;
        z-index: 10;
        cursor: pointer;
      `;
      // SVG Icon (aria-hidden for screen readers)
      playBtn.innerHTML = `
        <svg width="40" height="40" viewBox="0 0 24 24" fill="white" aria-hidden="true" focusable="false">
          <path d="M8 5v14l11-7z"></path>
        </svg>
      `;
      facade.appendChild(playBtn);

      // 3. Hover & Focus Effects
      playBtn.onmouseenter = () => {
        playBtn.style.background = 'rgba(79, 70, 229, 0.9)';
        playBtn.style.transform = 'translate(-50%, -50%) scale(1.1)';
      };
      playBtn.onmouseleave = () => {
        playBtn.style.background = 'rgba(0, 0, 0, 0.7)';
        playBtn.style.transform = 'translate(-50%, -50%) scale(1.0)';
      };
      playBtn.onfocus = () => {
        playBtn.style.outline = '3px solid #667eea';
        playBtn.style.outlineOffset = '2px';
      };
      playBtn.onblur = () => {
        playBtn.style.outline = 'none';
      };

      // 4. Click Handler - Load the real player
      const loadVideo = () => {
        // Clear the facade
        videoWrapper.innerHTML = '';
        
        // Check if mobile
        const isMobile = window.innerWidth <= 768;
        
        // Create container for the player
        const playerContainer = document.createElement('div');
        playerContainer.id = 'universal-player-container';
        playerContainer.style.cssText = `width: 100%; height: 100%; min-height: ${isMobile ? '200px' : '300px'}; border-radius: 12px; overflow: visible; background: #000;`;
        videoWrapper.appendChild(playerContainer);

        // On mobile, use simple HTML5 video for better compatibility
        if (isMobile) {
          const videoEl = document.createElement('video');
          videoEl.src = product.video_url;
          videoEl.controls = true;
          // Only load video metadata until the user initiates playback. According to MDN, setting
          // preload to 'metadata' defers downloading large video files until needed, saving bandwidth【187715498598355†L270-L279】.
          videoEl.preload = 'metadata';
          // Disable autoplay so the video does not start downloading immediately on mobile.
          videoEl.autoplay = false;
          videoEl.playsInline = true;
          videoEl.setAttribute('playsinline', '');
          videoEl.setAttribute('webkit-playsinline', '');
          videoEl.style.cssText = 'width:100%; height:100%; min-height:200px; border-radius:12px; background:#000;';
          videoEl.controlsList = 'nodownload';

          playerContainer.appendChild(videoEl);
          
          // Autoplay is disabled; the video will only download and play when the user taps play.
        } else {
          // Desktop - use UniversalVideoPlayer
          if (typeof window.UniversalVideoPlayer !== 'undefined') {
            window.UniversalVideoPlayer.render('universal-player-container', product.video_url, {
              poster: null,
              thumbnailUrl: null,
              autoplay: true
            });
          } else {
            // Fallback
            playerContainer.innerHTML = `<video src="${product.video_url}" controls autoplay playsinline style="width:100%;height:100%;min-height:200px;"></video>`;
          }
        }
      };

      // Add click listeners to both facade and playBtn
      facade.onclick = loadVideo;
      playBtn.onclick = (e) => {
        e.stopPropagation();
        loadVideo();
      };

      videoWrapper.appendChild(facade);
      hasVideo = true;

    } else {
      // No video, show main image normally
      videoWrapper.appendChild(createMainImage(product.thumbnail_url || 'https://via.placeholder.com/600'));
    }
    
    leftCol.appendChild(videoWrapper);

    // Thumbnails with slider
    const thumbsContainer = document.createElement('div');
    thumbsContainer.style.cssText = 'position: relative; margin-top: 15px;';

    const thumbsDiv = document.createElement('div');
    thumbsDiv.className = 'thumbnails';
    thumbsDiv.id = 'thumbnails-slider';
    thumbsDiv.style.cssText = 'display: flex; gap: 12px; overflow-x: auto; scroll-behavior: smooth; padding: 8px 0; scrollbar-width: thin;';

    // Add main product thumbnail
    if (product.thumbnail_url) {
      // Create wrapper for thumbnail with play button overlay
      const thumbWrapper = document.createElement('div');
      thumbWrapper.className = 'thumb-wrapper';
      thumbWrapper.style.cssText = 'position: relative; display: inline-block;';
      
      const img = document.createElement('img');
      // Optimize thumbnail URL for smaller size
      img.src = optimizeImageUrl(product.thumbnail_url, 280);
      img.className = 'thumb active';
      img.style.cssText = 'min-width: 140px; width: 140px; height: 100px; object-fit: cover; border-radius: 10px; cursor: pointer; border: 3px solid #667eea; transition: border-color 0.15s ease; contain: layout;';
      img.alt = (product.title || 'Product') + ' - Thumbnail';
      img.dataset.type = 'main';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.width = 140;
      img.height = 100;
      
      // Add play button overlay ONLY if video exists
      if (product.video_url) {
        const playOverlay = document.createElement('div');
        playOverlay.className = 'thumb-play-btn';
        playOverlay.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.7); color: white; width: 35px; height: 35px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; padding-left: 2px; pointer-events: none; opacity: 1 !important; visibility: visible !important; z-index: 100;';
        playOverlay.innerHTML = '▶';
        thumbWrapper.appendChild(playOverlay);
      }
      
      // Click handler to show main image/video
      img.onclick = () => {
        // Remove active from all thumbs
        thumbsDiv.querySelectorAll('.thumb').forEach(t => t.style.border = '3px solid transparent');
        img.style.border = '3px solid #667eea';
        
        // Reset the main video wrapper to initial state (Thumbnail + Play Button)
        const videoWrapper = document.querySelector('.video-wrapper');
        if (videoWrapper) {
            videoWrapper.innerHTML = '';
            // Re-run the main logic to recreate the facade
            // We can simply call a small helper or duplicate the facade creation logic lightly here
            // For simplicity, we just reload the page or re-render. 
            // Better: Re-trigger the initial render logic for the video wrapper part.
            
            // Re-render Main View (Facade)
            if (product.video_url) {
                const facade = document.createElement('div');
                facade.className = 'video-facade';
                facade.style.cssText = 'position: relative; width: 100%; height: 100%; cursor: pointer; display: flex; align-items: center; justify-content: center; background: #000;';
                
                const mainImg = createMainImage(product.thumbnail_url);
                mainImg.style.width = '100%';
                mainImg.style.height = '100%';
                mainImg.style.objectFit = 'cover';
                facade.appendChild(mainImg);

                const playBtn = document.createElement('div');
                playBtn.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 80px; height: 80px; background: rgba(0, 0, 0, 0.6); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; transition: background-color 0.15s ease, transform 0.15s ease; z-index: 10;';
                playBtn.innerHTML = '<svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor" style="display:block; margin-left:4px;"><path d="M8 5v14l11-7z"></path></svg>';
                facade.appendChild(playBtn);

                facade.onclick = () => {
                    videoWrapper.innerHTML = '';
                    const playerContainer = document.createElement('div');
                    playerContainer.id = 'universal-player-container';
                    playerContainer.style.cssText = 'width: 100%; height: 100%; min-height: 400px; border-radius: 12px; overflow: hidden; background: #000;';
                    videoWrapper.appendChild(playerContainer);
                    if (typeof window.UniversalVideoPlayer !== 'undefined') {
                        window.UniversalVideoPlayer.render('universal-player-container', product.video_url, { poster: product.thumbnail_url, autoplay: true });
                    }
                };
                videoWrapper.appendChild(facade);
            } else {
                videoWrapper.appendChild(createMainImage(product.thumbnail_url));
            }
        }
      };
      
      thumbWrapper.appendChild(img);
      thumbsDiv.appendChild(thumbWrapper);
    }

    // Add gallery images thumbnails
    if (product.gallery_images) {
      let galleryImages = [];
      try {
        galleryImages = typeof product.gallery_images === 'string' 
          ? JSON.parse(product.gallery_images) 
          : product.gallery_images;
      } catch (e) {
        galleryImages = [];
      }

      if (Array.isArray(galleryImages) && galleryImages.length > 0) {
        const normalizedMainThumb = normalizeMediaUrl(product.thumbnail_url || '');
        const normalizedVideo = normalizeMediaUrl(product.video_url || '');
        const seenGallery = new Set();
        galleryImages.forEach((imageUrl, index) => {
          if (isBadMediaValue(imageUrl)) return;
          if (isLikelyVideoUrl(imageUrl)) return;
          if (!isLikelyImageUrl(imageUrl)) return;
          const normalizedImage = normalizeMediaUrl(imageUrl);
          if (!normalizedImage) return;

          // Do not duplicate product thumbnail inside gallery strip.
          if (normalizedMainThumb && normalizedImage === normalizedMainThumb) return;
          // Do not render the product video URL as an image.
          if (normalizedVideo && normalizedImage === normalizedVideo) return;
          if (seenGallery.has(normalizedImage)) return;
          seenGallery.add(normalizedImage);
          
          const galleryThumb = document.createElement('img');
          galleryThumb.src = optimizeImageUrl(imageUrl, 280);
          galleryThumb.className = 'thumb';
          galleryThumb.style.cssText = 'min-width: 140px; width: 140px; height: 100px; object-fit: cover; border-radius: 10px; cursor: pointer; border: 3px solid transparent; transition: border-color 0.15s ease; contain: layout;';
          galleryThumb.alt = (product.title || 'Product') + ' - Gallery Image ' + (index + 1);
          galleryThumb.dataset.type = 'gallery';
          galleryThumb.loading = 'lazy';
          galleryThumb.decoding = 'async';
          galleryThumb.width = 140;
          galleryThumb.height = 100;
          galleryThumb.onerror = () => {
            // Remove broken images instead of showing a broken icon + alt text.
            try { galleryThumb.remove(); } catch (_) {}
          };
          
          galleryThumb.onclick = () => {
            thumbsDiv.querySelectorAll('.thumb').forEach(t => t.style.border = '3px solid transparent');
            galleryThumb.style.border = '3px solid #667eea';
            
            const videoWrapper = document.querySelector('.video-wrapper');
            if (videoWrapper) {
              videoWrapper.innerHTML = '';
              const largeImg = createMainImage(imageUrl);
              largeImg.style.width = '100%';
              largeImg.style.height = '100%';
              largeImg.style.objectFit = 'contain'; // Better for gallery images
              videoWrapper.appendChild(largeImg);
            }
          };
          
          thumbsDiv.appendChild(galleryThumb);
        });
      }
    }

    thumbsContainer.appendChild(thumbsDiv);

    // Add slider arrows (with accessibility)
    const leftArrow = document.createElement('button');
    leftArrow.innerHTML = '‹';
    leftArrow.setAttribute('aria-label', 'Previous thumbnails');
    leftArrow.type = 'button';
    leftArrow.style.cssText = 'position: absolute; left: 0; top: 50%; transform: translateY(-50%); background: rgba(0,0,0,0.7); color: white; border: none; width: 35px; height: 35px; border-radius: 50%; cursor: pointer; font-size: 24px; z-index: 10; display: none;';
    leftArrow.onclick = () => {
      thumbsDiv.scrollBy({ left: -160, behavior: 'smooth' });
    };

    const rightArrow = document.createElement('button');
    rightArrow.innerHTML = '›';
    rightArrow.setAttribute('aria-label', 'Next thumbnails');
    rightArrow.type = 'button';
    rightArrow.style.cssText = 'position: absolute; right: 0; top: 50%; transform: translateY(-50%); background: rgba(0,0,0,0.7); color: white; border: none; width: 35px; height: 35px; border-radius: 50%; cursor: pointer; font-size: 24px; z-index: 10; display: none;';
    rightArrow.onclick = () => {
      thumbsDiv.scrollBy({ left: 160, behavior: 'smooth' });
    };

    thumbsContainer.appendChild(leftArrow);
    thumbsContainer.appendChild(rightArrow);

    setTimeout(() => {
      if (thumbsDiv.scrollWidth > thumbsDiv.clientWidth) {
        leftArrow.style.display = 'block';
        rightArrow.style.display = 'block';
      }
    }, 100);

    leftCol.appendChild(thumbsContainer);
    window.productThumbnailsSlider = thumbsDiv;
    mainRow.appendChild(leftCol);

    if (ssrMediaSnapshot) {
      try {
        const renderedLeftCol = mainRow.querySelector('.product-media-col');
        if (renderedLeftCol && renderedLeftCol.parentNode) {
          renderedLeftCol.parentNode.replaceChild(ssrMediaSnapshot, renderedLeftCol);
          leftCol = ssrMediaSnapshot;
          hasVideo = !!product.video_url;
          hydrateSsrMedia(leftCol);
        }
      } catch (_) {}
    }

    // --- Right Column: Info & Form ---
    let rightCol = null;
    if (ssrInfoSnapshot) {
      rightCol = ssrInfoSnapshot;
      hydrateSsrInfoColumn(rightCol);
    } else {
    rightCol = document.createElement('div');
    rightCol.className = 'product-info-col';
    
    const panel = document.createElement('div');
    panel.className = 'product-info-panel';
    
    const title = document.createElement('h1');
    title.className = 'product-title';
    title.textContent = product.title;
    panel.appendChild(title);
    
    const ratingRow = document.createElement('div');
    ratingRow.className = 'rating-row';
    
    const reviewCount = product.review_count || 0;
    const ratingAverage = product.rating_average || 5.0;
    
    // Set accessibility attributes after variables are defined
    ratingRow.setAttribute('role', 'img');
    ratingRow.setAttribute('aria-label', `Rating: ${ratingAverage.toFixed(1)} out of 5 stars, ${reviewCount} ${reviewCount === 1 ? 'review' : 'reviews'}`);
    
    const fullStars = Math.floor(ratingAverage);
    const halfStar = ratingAverage % 1 >= 0.5 ? 1 : 0;
    const emptyStars = 5 - fullStars - halfStar;
    
    let starsHtml = '';
    for (let i = 0; i < fullStars; i++) starsHtml += '★';
    if (halfStar) starsHtml += '☆'; 
    for (let i = 0; i < emptyStars; i++) starsHtml += '☆';
    
    const reviewText = reviewCount === 0 
      ? 'No reviews yet' 
      : `${ratingAverage.toFixed(1)} (${reviewCount} ${reviewCount === 1 ? 'Review' : 'Reviews'})`;
    
    ratingRow.innerHTML = `<span class="stars" aria-hidden="true">${starsHtml}</span> <span class="review-count">${reviewText}</span>`;
    panel.appendChild(ratingRow);
    
    // Badges
    const badgeRow = document.createElement('div');
    badgeRow.className = 'badges-row';

    // Helper function to get delivery text from instant/days
    const getDeliveryText = (isInstant, days) => {
      if (isInstant) return 'Instant Delivery In 60 Minutes';
      days = parseInt(days) || 1;
      if (days === 1) return '24 Hour Express Delivery';
      return `${days} Days Delivery`;
    };

    const computeDeliveryBadge = (label) => {
      const raw = (label || '').toString();
      const v = raw.toLowerCase();

      if (v.includes('instant') || v.includes('60') || v.includes('1 hour')) {
        return { icon: '⚡', text: raw || 'Instant Delivery In 60 Minutes' };
      }
      if (v.includes('24') || v.includes('express') || v.includes('1 day') || v.includes('24 hour')) {
        return { icon: '🚀', text: raw || '24 Hour Express Delivery' };
      }
      if (v.includes('48') || v.includes('2 day')) {
        return { icon: '📦', text: raw || '2 Days Delivery' };
      }
      if (v.includes('3 day') || v.includes('72')) {
        return { icon: '📅', text: raw || '3 Days Delivery' };
      }
      // Check for any number of days pattern
      const daysMatch = v.match(/(\d+)\s*day/i);
      if (daysMatch) {
        const numDays = parseInt(daysMatch[1]) || 2;
        return { icon: '📦', text: raw || `${numDays} Days Delivery` };
      }
      return { icon: '🚚', text: raw || '2 Days Delivery' };
    };

    const setDeliveryBadge = (label) => {
      const { icon, text } = computeDeliveryBadge(label);
      const iconEl = badgeRow.querySelector('#delivery-badge-icon');
      const textEl = badgeRow.querySelector('#delivery-badge-text');
      if (iconEl) iconEl.textContent = icon;
      if (textEl) textEl.textContent = text;
    };

    badgeRow.innerHTML = `
      <div class="badge-box badge-delivery" id="delivery-badge">
        <div class="icon" id="delivery-badge-icon"></div>
        <span id="delivery-badge-text"></span>
      </div>
    `;

    let initialDeliveryLabel = '';
    
    // First check if addon has delivery time field with default selected
    const deliveryField = (addonGroups || []).find(g => g && g.id === 'delivery-time' && (g.type === 'radio' || g.type === 'select') && Array.isArray(g.options));
    if (deliveryField) {
      const defaultOption = deliveryField.options.find(o => o && o.default) || deliveryField.options[0];
      if (defaultOption) {
        // Check if option has delivery settings
        if (defaultOption.delivery && typeof defaultOption.delivery === 'object') {
          const isInstant = !!defaultOption.delivery.instant;
          const days = parseInt(defaultOption.delivery.days) || 1;
          initialDeliveryLabel = getDeliveryText(isInstant, days);
        } else {
          // Use option label as fallback
          initialDeliveryLabel = defaultOption.label || '';
        }
      }
    }

    // If no addon delivery field, use product settings
    if (!initialDeliveryLabel) {
      const isInstant = !!product.instant_delivery;
      const days = parseInt(product.delivery_time_days) || parseInt(product.normal_delivery_text) || 1;
      initialDeliveryLabel = getDeliveryText(isInstant, days);
    }

    setDeliveryBadge(initialDeliveryLabel);
    window.updateDeliveryBadge = setDeliveryBadge;

    const priceBadge = document.createElement('div');
    priceBadge.className = 'badge-box badge-price';
    const normalPrice = parseFloat(product.normal_price) || 0;
    let priceHtml = '<div class="price-final">$' + window.basePrice.toLocaleString() + '</div>';
    if (window.basePrice < normalPrice) {
      const off = Math.round(((normalPrice - window.basePrice) / normalPrice) * 100);
      priceHtml += '<div style="font-size:0.9rem"><span class="price-original">$' + normalPrice + '</span></div>';
      priceHtml += '<div class="discount-tag">' + off + '% OFF</div>';
    }
    priceBadge.innerHTML = priceHtml;
    badgeRow.appendChild(priceBadge);
    panel.appendChild(badgeRow);
    
    const note = document.createElement('div');
    note.className = 'digital-note';
    note.setAttribute('role', 'note');
    note.innerHTML = '<span aria-hidden="true">📩</span> <span><strong>Digital Delivery:</strong> Receive via WhatsApp/Email.</span>';
    panel.appendChild(note);
    
    // Book Now Button - reveals addons form
    const bookNowBtn = document.createElement('button');
    bookNowBtn.id = 'book-now-trigger';
    bookNowBtn.type = 'button';
    bookNowBtn.className = 'btn-book-now';
    bookNowBtn.setAttribute('aria-expanded', 'false');
    bookNowBtn.setAttribute('aria-controls', 'addons-container');
    bookNowBtn.innerHTML = '<span aria-hidden="true">🎬</span> Book Now - $' + window.basePrice.toLocaleString();
    // Apply high‑contrast golden styling to the Book Now button.  The
    // button's colour scheme has been chosen to maximise contrast for
    // users with low vision.  See the related CSS for more details.
    bookNowBtn.style.cssText = `
      width: 100%;
      padding: 16px 24px;
      margin-top: 1.5rem;
      /* Golden gradient for idle state */
      background: linear-gradient(135deg, #FFD700 0%, #FFC107 100%);
      color: #000;
      border: none;
      border-radius: 12px;
      font-size: 1.2rem;
      font-weight: 700;
      cursor: pointer;
      transition: transform 0.15s ease, filter 0.15s ease;
      /* Golden‑toned shadow */
      box-shadow: 0 4px 15px rgba(255, 215, 0, 0.4);
    `;
    panel.appendChild(bookNowBtn);
    
    // Collapsible Addons Container
    const addonsContainer = document.createElement('div');
    addonsContainer.id = 'addons-container';
    addonsContainer.style.cssText = `
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.4s ease-out, opacity 0.25s ease;
      opacity: 0;
    `;
    
    // Addons Form inside container
    const addonsForm = document.createElement('form');
    addonsForm.id = 'addons-form';
    addonsForm.style.cssText = 'padding-top: 1.5rem; border-top: 1px solid #e5e7eb; margin-top: 1.5rem;';
    
    // No duplicate header - user can add custom heading via addons config
    
    if (addonGroups && addonGroups.length > 0) {
      addonGroups.forEach(group => {
        if (group.type === 'heading') {
          const h = document.createElement('h3'); 
          h.textContent = group.text || group.label;
          h.style.marginTop = '1.5rem';
          h.style.fontSize = '1.1rem'; 
          addonsForm.appendChild(h);
        } else {
          addonsForm.appendChild(window.renderAddonField(group));
        }
      });
    }
    addonsContainer.appendChild(addonsForm);
    
    // Sticky Footer with Checkout button (inside container)
    const stickyFooter = document.createElement('div');
    stickyFooter.style.marginTop = '2rem';
    stickyFooter.style.paddingTop = '1rem';
    stickyFooter.style.borderTop = '1px solid #e5e5e5';

    // Check if Minimal Checkout is enabled
    const useMinimal = window.whopSettings && window.whopSettings.enable_minimal_checkout;

    if (useMinimal) {
      // Minimal Checkout: Apple Pay + Card buttons side by side
      const btnContainer = document.createElement('div');
      btnContainer.style.cssText = 'display: flex; gap: 12px; flex-wrap: wrap;';
      btnContainer.setAttribute('role', 'group');
      btnContainer.setAttribute('aria-label', 'Payment options');

      // Apple Pay Button
      const applePayBtn = document.createElement('button');
      applePayBtn.id = 'apple-pay-btn';
      applePayBtn.type = 'button';
      applePayBtn.className = 'btn-buy';
      applePayBtn.setAttribute('aria-label', 'Pay with Apple Pay');
      applePayBtn.style.cssText = 'flex: 1; min-width: 140px; background: #000; color: #fff;';
      applePayBtn.innerHTML = '<span aria-hidden="true"></span> Pay';
      applePayBtn.addEventListener('click', function(e) {
        e.preventDefault();
        if (typeof handleCheckout === 'function') handleCheckout();
      });

      // Card Button
      const cardBtn = document.createElement('button');
      cardBtn.id = 'checkout-btn';
      cardBtn.type = 'button';
      cardBtn.className = 'btn-buy';
      cardBtn.setAttribute('aria-label', 'Pay with credit or debit card');
      cardBtn.style.cssText = 'flex: 1; min-width: 140px; background: #2563eb; color: #fff;';
      cardBtn.innerHTML = 'Pay with Card <span aria-hidden="true">💳</span>';
      cardBtn.addEventListener('click', function(e) {
        e.preventDefault();
        if (typeof handleCheckout === 'function') handleCheckout();
      });

      btnContainer.appendChild(applePayBtn);
      btnContainer.appendChild(cardBtn);
      stickyFooter.appendChild(btnContainer);
    } else {
      // Standard Checkout Button
      const checkoutBtn = document.createElement('button');
      checkoutBtn.id = 'checkout-btn';
      checkoutBtn.type = 'button';
      checkoutBtn.className = 'btn-buy';
      checkoutBtn.innerHTML = '<span aria-hidden="true">✅</span> Proceed to Checkout - $' + window.currentTotal.toLocaleString();
      checkoutBtn.addEventListener('click', function(e) {
        e.preventDefault();
        if (typeof handleCheckout === 'function') handleCheckout();
      });
      stickyFooter.appendChild(checkoutBtn);
    }
    
    addonsContainer.appendChild(stickyFooter);
    panel.appendChild(addonsContainer);
    
    // Book Now click handler - expand/collapse addons form
    // When the form expands we hide all other info in the right panel so the
    // form occupies the full column.  Upon collapse the info is shown again.
    let isExpanded = false;
    bookNowBtn.addEventListener('click', function(e) {
      e.preventDefault();
      const isMobile = window.matchMedia('(max-width: 600px)').matches;
      if (!isExpanded) {
        // Hide other elements in the panel (except the trigger and form container)
        Array.from(panel.children).forEach(child => {
          if (child !== bookNowBtn && child !== addonsContainer) {
            child.dataset.origDisplay = child.style.display || '';
            child.style.display = 'none';
          }
        });

        // Expand - first set expanding class for animation
        addonsContainer.classList.add('expanding');
        addonsContainer.style.maxHeight = addonsContainer.scrollHeight + 1000 + 'px';
        addonsContainer.style.opacity = '1';
        addonsContainer.style.overflow = 'hidden';
        bookNowBtn.innerHTML = '<span aria-hidden="true">▲</span> Close Form';
        bookNowBtn.setAttribute('aria-expanded', 'true');
        // When the form is expanded, switch to a slightly darker golden
        // palette so the button still stands out.  We keep the text
        // colour black for consistency with the idle state.
        bookNowBtn.style.background = 'linear-gradient(135deg, #D1A20D 0%, #AF8A0E 100%)';
        bookNowBtn.style.boxShadow = '0 4px 15px rgba(209, 162, 13, 0.4)';
        bookNowBtn.style.color = '#000';
        // On mobile, keep the form inline (reverted from fullscreen overlay)
        isExpanded = true;
        
        // After animation completes, remove height constraint so content can grow freely
        setTimeout(() => {
          addonsContainer.classList.remove('expanding');
          addonsContainer.classList.add('expanded');
          addonsContainer.style.maxHeight = 'none';
          addonsContainer.style.overflow = 'visible';
        }, 550);
        
        // Scroll to form smoothly
        setTimeout(() => {
          addonsForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      } else {
        // Collapse - first restore height constraint for animation
        addonsContainer.classList.remove('expanded');
        addonsContainer.style.overflow = 'hidden';
        addonsContainer.style.maxHeight = addonsContainer.scrollHeight + 'px';
        
        // Trigger reflow then collapse
        addonsContainer.offsetHeight;
        addonsContainer.style.maxHeight = '0';
        addonsContainer.style.opacity = '0';
        bookNowBtn.innerHTML = '<span aria-hidden="true">🎬</span> Book Now - $' + window.basePrice.toLocaleString();
        bookNowBtn.setAttribute('aria-expanded', 'false');
        // Restore the original golden styling when collapsing the form
        bookNowBtn.style.background = 'linear-gradient(135deg, #FFD700 0%, #FFC107 100%)';
        bookNowBtn.style.boxShadow = '0 4px 15px rgba(255, 215, 0, 0.4)';
        bookNowBtn.style.color = '#000';

        // On mobile, nothing to remove (fullscreen overlay removed in this version)

        // Restore previously hidden elements
        Array.from(panel.children).forEach(child => {
          if (child !== bookNowBtn && child !== addonsContainer) {
            // If dataset.origDisplay is defined, restore it; otherwise blank resets to default
            const orig = child.dataset.origDisplay;
            child.style.display = orig !== undefined ? orig : '';
          }
        });

        isExpanded = false;
      }
    });
    
    // Update checkout button when price changes
    window.updateCheckoutPrice = function(newTotal) {
      const checkoutBtn = document.getElementById('checkout-btn');
      // Don't update if button is in loading state
      if (checkoutBtn && !useMinimal && !checkoutBtn.classList.contains('btn-loading')) {
        checkoutBtn.textContent = '✅ Proceed to Checkout - $' + newTotal.toLocaleString();
      }
    };
    
    rightCol.appendChild(panel);
    }
    mainRow.appendChild(rightCol);
    wrapper.appendChild(mainRow);
    if (ssrDescSnapshot && !wrapper.querySelector('.product-desc-row')) {
      wrapper.appendChild(ssrDescSnapshot);
    }
    if (ssrNavSnapshot && !wrapper.querySelector('#product-navigation')) {
      wrapper.appendChild(ssrNavSnapshot);
    }
    container.className = '';
    container.innerHTML = '';
    container.appendChild(wrapper);
    
    return { wrapper: wrapper, hasVideo: hasVideo };
  }
  window.renderProductMain = renderProductMain;
})();

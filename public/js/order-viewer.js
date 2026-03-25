/**
 * Unified Order Viewer - Handles both buyer and admin views
 * Replaces buyer-order.js and order-detail.js
 */

(function () {
    const CHECKOUT_INTENT_KEY = 'whop_checkout_intent_v1';
    const urlParams = new URLSearchParams(window.location.search);
    const orderId = urlParams.get('id');
    const isAdmin = urlParams.get('admin') === '1';
    let orderData = null;
    let selectedRating = 5;
    let countdownTimer = null;

    if (!orderId) {
        showError('Order ID not found');
        return;
    }

    // Character counter for review comment
    const commentEl = document.getElementById('review-comment');
    const countEl = document.getElementById('comment-count');
    if (commentEl && countEl) {
        commentEl.addEventListener('input', function () {
            countEl.textContent = this.value.length;
            countEl.style.color = this.value.length > 900 ? '#ef4444' : '#6b7280';
        });
    }

    // Setup view based on admin mode
    if (isAdmin) {
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'block');
        document.querySelectorAll('.buyer-only').forEach(el => el.style.display = 'none');
        const backBtn = document.getElementById('back-btn');
        if (backBtn) backBtn.href = '/admin/dashboard.html';
    } else {
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.buyer-only').forEach(el => el.style.display = 'block');
        const backBtn = document.getElementById('back-btn');
        if (backBtn) backBtn.href = '/';
    }

    // Check if returning from tip payment
    const tipSuccess = urlParams.get('tip_success');
    const tipAmount = urlParams.get('tip_amount');
    if (tipSuccess === '1' && tipAmount) {
        fetch('/api/order/tip-paid', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId, amount: parseFloat(tipAmount) })
        }).then(() => {
            window.history.replaceState({}, '', `?id=${orderId}`);
            alert('🎉 Thank you for your generous tip!');
        });
    }

    // Fetch server time and load order
    if (typeof fetchServerTimeOffset === 'function') {
        fetchServerTimeOffset().then(offset => {
            window.timerOffset = offset;
            loadOrder();
        }).catch(() => {
            window.timerOffset = 0;
            loadOrder();
        });
    } else {
        window.timerOffset = 0;
        loadOrder();
    }

    // Rating stars
    document.querySelectorAll('.rating-stars span').forEach(star => {
        star.addEventListener('click', function () {
            selectedRating = parseInt(this.dataset.rating);
            updateStars(selectedRating);
        });
    });

    // Review form
    document.getElementById('review-form')?.addEventListener('submit', submitReview);

    // Approve button
    document.getElementById('approve-btn')?.addEventListener('click', () => {
        const reviewSection = document.getElementById('review-section');
        if (reviewSection) {
            reviewSection.style.display = 'block';
            reviewSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    });

    // Revision button
    document.getElementById('revision-btn')?.addEventListener('click', requestRevision);

    // Tip buttons
    document.querySelectorAll('.tip-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            processTip(this.dataset.amount);
        });
    });

    // Admin delivery
    document.getElementById('submit-delivery-btn')?.addEventListener('click', submitDelivery);

    async function loadOrder() {
        try {
            const res = await fetch(`/api/order/buyer/${orderId}`);
            const data = await res.json();
            if (!res.ok || !data.order) throw new Error(data.error || 'Order not found');
            orderData = data.order;
            displayOrder(orderData);
        } catch (err) {
            showError('Error: ' + err.message);
        }
    }

    function parseVideoMetadata(order) {
        if (!order || !order.delivered_video_metadata) return {};
        try {
            const parsed = JSON.parse(order.delivered_video_metadata);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (e) {
            console.warn('Failed to parse video metadata:', e);
            return {};
        }
    }

    function isArchiveDetailsUrl(url) {
        const lowered = (url || '').toString().toLowerCase();
        return lowered.includes('archive.org/details/') && !lowered.includes('/download/');
    }

    function isOpenOnlyUrl(url) {
        if (!url) return false;

        const lowered = url.toLowerCase();
        if (isArchiveDetailsUrl(url)) return true;
        if (lowered.includes('youtube.com') || lowered.includes('youtu.be')) return true;
        if (lowered.includes('vimeo.com')) return true;
        if (lowered.includes('iframe.mediadelivery.net/embed/')) return true;
        if (lowered.includes('video.bunnycdn.com/play/')) return true;

        const player = window.UniversalVideoPlayer || window.UniversalPlayer;
        if (player && typeof player.detect === 'function') {
            try {
                const detected = player.detect(url);
                const openOnlyTypes = ['youtube', 'vimeo', 'bunny-embed'];
                if (detected && openOnlyTypes.includes(detected.type)) return true;
            } catch (_) {
                // Ignore detector errors and fall back to URL checks above.
            }
        }

        return false;
    }

    function resolveDeliveryUrls(order) {
        const metadata = parseVideoMetadata(order);
        const storedUrl = (order?.delivered_video_url || '').toString().trim();
        const metadataDownloadUrl = (metadata.downloadUrl || metadata.buyerDownloadUrl || metadata.deliveryUrl || '').toString().trim();
        const metadataYoutubeUrl = (metadata.youtubeUrl || metadata.reviewYoutubeUrl || '').toString().trim();

        let buyerDownloadUrl = metadataDownloadUrl || storedUrl;
        if (metadataYoutubeUrl && buyerDownloadUrl && buyerDownloadUrl === metadataYoutubeUrl && storedUrl && storedUrl !== metadataYoutubeUrl) {
            buyerDownloadUrl = storedUrl;
        }

        let buyerPlaybackUrl = '';
        if (buyerDownloadUrl && !isOpenOnlyUrl(buyerDownloadUrl)) {
            buyerPlaybackUrl = buyerDownloadUrl;
        } else if (storedUrl && !isOpenOnlyUrl(storedUrl)) {
            buyerPlaybackUrl = storedUrl;
        } else if (metadataDownloadUrl && !isOpenOnlyUrl(metadataDownloadUrl)) {
            buyerPlaybackUrl = metadataDownloadUrl;
        }

        const adminPreviewUrl = metadataYoutubeUrl || storedUrl || metadataDownloadUrl;
        const hasDownloadableDelivery = !!buyerDownloadUrl && !isOpenOnlyUrl(buyerDownloadUrl);

        return {
            metadata,
            buyerDownloadUrl,
            buyerPlaybackUrl,
            adminPreviewUrl,
            hasDownloadableDelivery
        };
    }

    function displayOrder(order) {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('order-content').style.display = 'block';

        // Handle different element ID naming conventions
        const orderIdEl = document.getElementById('order-id-display') || document.getElementById('order-id');
        const emailEl = document.getElementById('email-display') || document.getElementById('email');
        const amountEl = document.getElementById('amount-display') || document.getElementById('amount');
        const statusEl = document.getElementById('status-display') || document.getElementById('status');
        const dateEl = document.getElementById('order-date') || document.getElementById('date');
        const deliveryEl = document.getElementById('delivery-time-display');

        if (orderIdEl) orderIdEl.textContent = (orderIdEl.id.includes('display') ? 'Order #' : '') + order.order_id;
        if (emailEl) emailEl.textContent = order.email || 'N/A';
        if (amountEl) amountEl.textContent = '$' + (order.amount || 0);
        if (statusEl) statusEl.textContent = order.status;
        if (dateEl) dateEl.textContent = new Date(order.created_at).toLocaleString();

        // Show delivery time in proper format
        if (deliveryEl) {
            const deliveryMins = order.delivery_time_minutes || 60;
            let deliveryText = '';
            if (deliveryMins <= 60) {
                deliveryText = 'Instant Delivery In 60 Minutes';
            } else {
                const days = Math.ceil(deliveryMins / (24 * 60));
                if (days === 1) {
                    deliveryText = '24 Hour Express Delivery';
                } else {
                    deliveryText = `${days} Days Delivery`;
                }
            }
            deliveryEl.textContent = deliveryText;
        }

        // Product summary card (buyer-order style)
        renderProductSummary(order);

        // Show revision info if any
        displayRevisionInfo(order);

        displayRequirements(order.addons || []);

        const statusMsg = document.getElementById('status-message');
        const deliveryUrls = resolveDeliveryUrls(order);
        const hasDeliveredMedia = !!(deliveryUrls.adminPreviewUrl || deliveryUrls.buyerDownloadUrl || deliveryUrls.buyerPlaybackUrl);

        if (order.status === 'delivered' && hasDeliveredMedia) {
            showDelivery(order);
        } else {
            startCountdown(order.delivery_time_minutes || 60, order.created_at);

            if (isAdmin) {
                const deliverySection = document.getElementById('delivery-section');
                if (deliverySection) deliverySection.style.display = 'block';
                if (statusMsg) statusMsg.style.display = 'none';
            } else {
                if (statusMsg) {
                    statusMsg.style.display = 'block';
                    statusMsg.className = 'status-message status-processing';
                    statusMsg.innerHTML = '<h3>🎬 Video Being Created</h3><p>Our team is working on your personalized video. You\'ll be notified when it\'s ready!</p>';
                }
            }
        }
    }

    function renderProductSummary(order) {
        const productCard = document.getElementById('product-summary-card');
        if (!productCard) return;

        const productTitle = order.product_title || '';
        const productThumb = order.product_thumbnail || '';
        const productId = order.product_id || '';

        productCard.innerHTML = '';
        const img = document.createElement('img');
        img.className = 'product-summary-thumb';
        img.alt = productTitle ? `Product: ${productTitle}` : 'Product thumbnail';
        if (productThumb) img.src = productThumb;

        const meta = document.createElement('div');
        meta.className = 'product-summary-meta';

        const titleEl = document.createElement('p');
        titleEl.className = 'product-summary-title';

        const productUrl = productId ? `/product?id=${encodeURIComponent(productId)}` : '/products';
        const a = document.createElement('a');
        a.href = productUrl;
        a.textContent = productTitle || 'View purchased product';
        a.rel = 'noopener';
        titleEl.appendChild(a);

        const actions = document.createElement('div');
        actions.className = 'product-summary-actions';

        const viewBtn = document.createElement('a');
        viewBtn.href = productUrl;
        viewBtn.textContent = 'View Product';
        viewBtn.rel = 'noopener';

        const buyAgainBtn = document.createElement('a');
        buyAgainBtn.href = productUrl;
        buyAgainBtn.textContent = 'Buy Again';
        buyAgainBtn.className = 'secondary';
        buyAgainBtn.rel = 'noopener';

        actions.appendChild(viewBtn);
        actions.appendChild(buyAgainBtn);
        meta.appendChild(titleEl);
        meta.appendChild(actions);

        if (productThumb) productCard.appendChild(img);
        productCard.appendChild(meta);
        productCard.style.display = 'flex';
    }

    function displayRequirements(addons) {
        const list = document.getElementById('requirements-list') || document.getElementById('requirements');
        if (!list) return;

        const photos = [];

        if (!addons || addons.length === 0) {
            list.innerHTML = '<div class="addon-item" style="color:#6b7280;font-style:italic;">No requirements provided.</div>';
            return;
        }

        const filtered = addons.filter(a => a.field !== '_temp_session');

        if (filtered.length === 0) {
            list.innerHTML = '<div class="addon-item" style="color:#6b7280;font-style:italic;">No requirements provided.</div>';
            return;
        }

        list.innerHTML = filtered.map(a => {
            let val = a.value || '';
            let label = a.field || 'Item';

            if (val.includes('[TEMP_FILE]') || val.includes('[PHOTO LINK]')) {
                const url = val.split(']:')[1]?.trim();
                if (url) {
                    photos.push(url);
                    return `<div class="addon-item"><span class="addon-label">${label}:</span> <a href="${url}" target="_blank" style="color:#3b82f6;">View Photo 📷</a></div>`;
                }
                return `<div class="addon-item"><span class="addon-label">${label}:</span> Photo uploaded</div>`;
            }

            return `<div class="addon-item"><span class="addon-label">${label}:</span> ${val}</div>`;
        }).join('');

        if (photos.length > 0) {
            const photosSection = document.getElementById('photos-section');
            const photosGrid = document.getElementById('photos-grid') || document.getElementById('photos');
            if (photosSection) photosSection.style.display = 'block';
            if (photosGrid) {
                photosGrid.innerHTML = photos.map(url => `<div class="photo-item"><img src="${url}" onclick="window.open('${url}', '_blank')" onerror="this.style.display='none'"></div>`).join('');
            }
        }
    }

    function displayRevisionInfo(order) {
        // Check if order has revision requested
        if (!order.revision_requested && order.status !== 'revision') return;

        // Find or create revision info container
        let revisionSection = document.getElementById('revision-info-section');
        if (!revisionSection) {
            revisionSection = document.createElement('div');
            revisionSection.id = 'revision-info-section';
            revisionSection.style.cssText = 'background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border: 2px solid #f87171; border-radius: 12px; padding: 20px; margin-bottom: 20px;';

            // Insert after product summary card or at start of order content
            const productCard = document.getElementById('product-summary-card');
            const orderContent = document.getElementById('order-content');
            if (productCard && productCard.nextSibling) {
                productCard.parentNode.insertBefore(revisionSection, productCard.nextSibling);
            } else if (orderContent) {
                orderContent.insertBefore(revisionSection, orderContent.firstChild);
            }
        }

        const revisionCount = order.revision_count || 1;
        const revisionReason = order.revision_reason || 'No specific reason provided';
        const isRevisionStatus = order.status === 'revision';

        let headerText = isAdmin ? '⚠️ Revision Requested by Buyer' : '📝 Your Revision Request';
        let statusText = isRevisionStatus
            ? '<span style="color: #dc2626; font-weight: 700;">Pending</span>'
            : '<span style="color: #16a34a; font-weight: 700;">Addressed</span>';

        revisionSection.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <h3 style="color: #b91c1c; margin: 0; font-size: 1.1em;">${headerText}</h3>
                <span style="background: #fff; padding: 4px 12px; border-radius: 20px; font-size: 0.85em;">
                    Revision #${revisionCount} • Status: ${statusText}
                </span>
            </div>
            <div style="background: #fff; padding: 15px; border-radius: 8px; border-left: 4px solid #f87171;">
                <p style="margin: 0 0 8px 0; font-weight: 600; color: #991b1b; font-size: 0.9em;">
                    ${isAdmin ? 'Buyer\'s Feedback:' : 'What You Requested:'}
                </p>
                <p style="margin: 0; color: #374151; line-height: 1.5;">${escapeHtml(revisionReason)}</p>
            </div>
            ${isAdmin ? `
            <p style="margin: 12px 0 0 0; font-size: 0.85em; color: #6b7280;">
                💡 Please address the buyer's feedback and submit a new delivery.
            </p>` : `
            <p style="margin: 12px 0 0 0; font-size: 0.85em; color: #6b7280;">
                ⏳ Our team is working on your requested changes. You'll be notified when ready!
            </p>`}
        `;

        revisionSection.style.display = 'block';
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function startCountdown(minutes, createdAt) {
        const countdownSection = document.getElementById('countdown-section');
        if (countdownSection) countdownSection.style.display = 'block';

        if (countdownTimer) {
            countdownTimer.stop();
        }

        if (typeof CountdownTimer === 'function') {
            const displayEl = document.getElementById('countdown-display');
            if (displayEl) {
                countdownTimer = new CountdownTimer('countdown-display', minutes, createdAt, {
                    serverTimeOffset: window.timerOffset || 0
                });
                countdownTimer.start();
            }
        }
    }

    function showDelivery(order) {
        document.getElementById('countdown-section').style.display = 'none';

        const videoSection = document.getElementById('video-section') || document.getElementById('video-player-section');
        if (videoSection) videoSection.style.display = 'block';

        const deliveryUrls = resolveDeliveryUrls(order);
        const isBuyer = !isAdmin;

        const statusMsg = document.getElementById('status-message');
        if (statusMsg && isBuyer) {
            statusMsg.style.display = 'block';
            statusMsg.className = 'status-message status-delivered';
            statusMsg.innerHTML = '<h3>Video Ready</h3><p>Your delivery is available below.</p>';
        }

        // Initialize video player
        const playerContainer = document.getElementById('player-container') || document.getElementById('universal-video-player');
        const playerUrl = isBuyer ? deliveryUrls.buyerPlaybackUrl : (deliveryUrls.adminPreviewUrl || deliveryUrls.buyerPlaybackUrl);

        if (playerContainer && playerUrl) {
            const player = window.UniversalVideoPlayer || window.UniversalPlayer;
            if (player) {
                const renderMetadata = { ...deliveryUrls.metadata, allowDownload: isBuyer };
                player.render(playerContainer.id, playerUrl, renderMetadata);
            }
        } else if (playerContainer && isBuyer) {
            playerContainer.innerHTML = `
                <div style="padding:20px;border:1px solid #e5e7eb;border-radius:10px;background:#f9fafb;color:#374151;">
                    Download is ready below.
                </div>
            `;
        }

        // Setup download button
        const downloadBtn = document.getElementById('download-btn');
        if (downloadBtn) {
            downloadBtn.style.display = 'none';

            if (deliveryUrls.hasDownloadableDelivery) {
                downloadBtn.style.display = 'inline-flex';
                downloadBtn.textContent = 'Download Video';
                downloadBtn.href = `/download/${order.order_id}`;
                downloadBtn.removeAttribute('target');
                downloadBtn.setAttribute('download', '');
            } else if (!isBuyer && deliveryUrls.adminPreviewUrl) {
                downloadBtn.style.display = 'inline-flex';
                downloadBtn.textContent = 'Open Preview';
                downloadBtn.href = deliveryUrls.adminPreviewUrl;
                downloadBtn.target = '_blank';
                downloadBtn.removeAttribute('download');
            }
        }

        // Show action buttons for buyers
        if (isBuyer) {
            const revisionBtn = document.getElementById('revision-btn');
            const approveBtn = document.getElementById('approve-btn');
            if (revisionBtn) revisionBtn.style.display = 'inline-flex';
            if (approveBtn) approveBtn.style.display = 'inline-flex';

            // Check if already reviewed
            if (order.has_review) {
                hideReviewUIElements();
                if (videoSection) {
                    const thankYou = document.createElement('div');
                    thankYou.style.cssText = 'background:#d1fae5;border:2px solid #10b981;padding:20px;border-radius:12px;text-align:center;margin-top:20px;';
                    thankYou.innerHTML = '<h3 style="color:#065f46;margin:0;">Thank you for your review!</h3><p style="color:#047857;margin:10px 0 0;">Your feedback has been submitted.</p>';
                    videoSection.appendChild(thankYou);
                }
            }

            // Show tip section
            updateTipUI(order);
        }
    }
    async function submitDelivery() {
        const url = document.getElementById('delivery-url')?.value.trim();
        const youtubeUrl = document.getElementById('youtube-url')?.value.trim();
        const file = document.getElementById('delivery-file')?.files[0];
        const thumb = document.getElementById('thumbnail-url')?.value.trim();
        const subtitlesUrl = document.getElementById('subtitles-url')?.value.trim();

        if (!url && !file) {
            alert('Provide buyer download URL or upload file');
            return;
        }

        let videoUrl = url;
        if (file) {
            const maxSize = 500 * 1024 * 1024;
            if (file.size > maxSize) {
                alert(`File too large! Maximum size is 500MB.`);
                return;
            }

            const btn = document.getElementById('submit-delivery-btn');
            const progressDiv = document.getElementById('upload-progress');
            const progressBar = document.getElementById('progress-bar');
            const progressText = document.getElementById('progress-text');

            if (btn) {
                btn.innerHTML = '<span style="display: inline-flex; align-items: center; gap: 8px;"><span style="display: inline-block; width: 16px; height: 16px; border: 2px solid white; border-top-color: transparent; border-radius: 50%; animation: spin 0.6s linear infinite;"></span>Uploading...</span>';
                btn.disabled = true;
            }
            if (progressDiv) progressDiv.style.display = 'block';

            try {
                const itemId = 'delivery_' + orderId + '_' + Date.now();
                const filename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
                const uploadUrl = `/api/upload/customer-file?itemId=${itemId}&filename=${encodeURIComponent(filename)}&originalFilename=${encodeURIComponent(file.name)}&orderId=${encodeURIComponent(orderId)}`;

                const xhr = new XMLHttpRequest();
                xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable && progressBar && progressText) {
                        const percent = (e.loaded / e.total) * 100;
                        progressBar.style.width = percent + '%';
                        progressText.textContent = `Uploading... ${Math.round(percent)}%`;
                    }
                });

                xhr.addEventListener('load', () => {
                    if (xhr.status === 200) {
                        const data = JSON.parse(xhr.responseText);
                        if (data.url) {
                            submitDeliveryWithUrl(data.url, thumb, subtitlesUrl, data, youtubeUrl);
                        } else {
                            alert('Upload failed: ' + (data.error || 'Unknown error'));
                        }
                    } else {
                        alert('Upload failed');
                    }
                });

                xhr.open('POST', uploadUrl);
                xhr.send(file);
                return;
            } catch (err) {
                alert('Upload failed: ' + err.message);
                if (btn) {
                    btn.textContent = 'Submit Delivery';
                    btn.disabled = false;
                }
                return;
            }
        }

        submitDeliveryWithUrl(videoUrl, thumb, subtitlesUrl, null, youtubeUrl);
    }

    async function submitDeliveryWithUrl(videoUrl, thumb, subtitlesUrl, uploadData, youtubeUrl) {
        const btn = document.getElementById('submit-delivery-btn');

        try {
            if (btn) btn.innerHTML = 'Submitting...';

            const deliveryData = {
                orderId,
                videoUrl,
                downloadUrl: videoUrl,
                thumbnailUrl: thumb
            };

            if (youtubeUrl) deliveryData.youtubeUrl = youtubeUrl;
            if (subtitlesUrl) deliveryData.subtitlesUrl = subtitlesUrl;
            if (uploadData?.embedUrl) {
                deliveryData.embedUrl = uploadData.embedUrl;
                deliveryData.itemId = uploadData.itemId;
            }

            const res = await fetch('/api/order/deliver', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(deliveryData)
            });
            const data = await res.json();
            if (res.ok && data.success) {
                if (btn) btn.innerHTML = 'Delivered';
                setTimeout(() => loadOrder(), 1500);
            } else throw new Error(data.error || 'Failed');
        } catch (err) {
            alert('Error: ' + err.message);
            if (btn) {
                btn.textContent = 'Submit Delivery';
                btn.disabled = false;
            }
        }
    }
    async function requestRevision(e) {
        if (e) e.preventDefault();
        const reason = prompt('What needs to be changed?');
        if (!reason || !reason.trim()) return;
        try {
            const res = await fetch('/api/order/revision', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId, reason: reason.trim() })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                alert('✅ Revision requested!');
                loadOrder();
            } else throw new Error(data.error || 'Failed');
        } catch (err) {
            alert('Error: ' + err.message);
        }
    }

    async function submitReview(e) {
        e.preventDefault();
        const name = document.getElementById('reviewer-name')?.value.trim();
        const comment = document.getElementById('review-comment')?.value.trim();
        const portfolioEnabled = document.getElementById('portfolio-checkbox')?.checked;

        if (!name || !comment) {
            alert('Please fill all fields');
            return;
        }

        try {
            // Use shared utility if available
            if (typeof submitReviewToAPI === 'function') {
                await submitReviewToAPI(orderData, { name, comment, rating: selectedRating, portfolioEnabled });
            } else {
                const res = await fetch('/api/reviews/add', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        productId: orderData.product_id,
                        author: name,
                        rating: selectedRating,
                        comment: comment,
                        orderId: orderData.order_id,
                        showOnProduct: portfolioEnabled ? 1 : 0
                    })
                });
                const data = await res.json();
                if (!res.ok || !data.success) throw new Error(data.error || 'Failed');

                if (portfolioEnabled) {
                    await fetch('/api/order/portfolio', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ orderId: orderData.order_id, portfolioEnabled: 1 })
                    });
                }
            }

            alert('✅ Review submitted!');
            hideReviewUIElements();
        } catch (err) {
            alert('Error: ' + err.message);
        }
    }

    function hideReviewUIElements() {
        const reviewSection = document.getElementById('review-section');
        const approveBtn = document.getElementById('approve-btn');
        const revisionBtn = document.getElementById('revision-btn');
        if (reviewSection) reviewSection.style.display = 'none';
        if (approveBtn) approveBtn.style.display = 'none';
        if (revisionBtn) revisionBtn.style.display = 'none';
    }

    function setTipButtonsDisabled(disabled) {
        document.querySelectorAll('.tip-btn').forEach(btn => {
            btn.disabled = !!disabled;
            btn.style.opacity = disabled ? '0.65' : '1';
            btn.style.cursor = disabled ? 'not-allowed' : 'pointer';
        });
    }

    function compactMethod(method) {
        if (!method || typeof method !== 'object') return null;
        return {
            id: method.id || '',
            name: method.name || '',
            icon: method.icon || '',
            enabled: method.enabled !== false
        };
    }

    function saveCheckoutIntent(intent) {
        const serialized = JSON.stringify(intent);
        try { sessionStorage.setItem(CHECKOUT_INTENT_KEY, serialized); } catch (e) { }
        try { localStorage.setItem(CHECKOUT_INTENT_KEY, serialized); } catch (e) { }
    }

    function redirectTipToCheckout(tipAmount, whopMethod) {
        const numericProductId = Number(orderData?.product_id || 0);
        if (!Number.isFinite(numericProductId) || numericProductId <= 0) {
            throw new Error('Invalid product for tip checkout');
        }

        const normalizedTip = Number(tipAmount);
        if (!Number.isFinite(normalizedTip) || normalizedTip <= 0) {
            throw new Error('Invalid tip amount');
        }

        const sourceUrl = `/buyer-order?id=${encodeURIComponent(orderData.order_id)}`;
        const compactWhop = compactMethod(whopMethod);

        const intent = {
            version: 1,
            created_at: Date.now(),
            productId: numericProductId,
            amount: normalizedTip,
            originalAmount: normalizedTip,
            email: (orderData?.email || '').trim(),
            addons: [],
            coupon: null,
            deliveryTimeMinutes: 60,
            sourceUrl,
            productTitle: orderData?.product_title || `Tip for Order #${orderData.order_id}`,
            productThumbnail: orderData?.product_thumbnail || '',
            preferredMethod: 'whop',
            availableMethods: compactWhop ? [compactWhop] : [],
            flowType: 'tip',
            tipOrderId: orderData.order_id,
            tipAmount: normalizedTip,
            tipReturnUrl: sourceUrl
        };

        saveCheckoutIntent(intent);
        window.location.href = '/checkout';
    }

    function updateTipUI(order) {
        const tipSection = document.getElementById('tip-section');
        if (!tipSection) return;

        if (order.tip_paid) {
            tipSection.style.display = 'none';
            showTipThankYou(order.tip_amount || 0);
            return;
        }

        tipSection.style.display = 'block';
    }

    function showTipThankYou(amount) {
        const container = document.getElementById('video-section') || document.getElementById('video-player-section') || document.getElementById('order-actions');
        if (!container || document.getElementById('tip-thankyou')) return;

        const box = document.createElement('div');
        box.id = 'tip-thankyou';
        box.style.cssText = 'background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border: 2px solid #fbbf24; padding: 20px; border-radius: 12px; text-align: center; margin-top: 20px;';
        const safe = Number(amount);
        const shown = Number.isFinite(safe) ? safe : 0;
        box.innerHTML = `<h3 style="color:#92400e;margin:0;">💝 Thank you for your $${shown} tip!</h3><p style="color:#78350f;margin:10px 0 0;">Your generosity means the world to us!</p>`;
        container.appendChild(box);
    }

    async function markTipPaid(amount) {
        const tipAmount = Number(amount);
        if (!Number.isFinite(tipAmount) || tipAmount <= 0) return;

        await fetch('/api/order/tip-paid', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId, amount: tipAmount })
        });

        if (orderData) {
            orderData.tip_paid = 1;
            orderData.tip_amount = tipAmount;
        }

        const tipSection = document.getElementById('tip-section');
        if (tipSection) tipSection.style.display = 'none';
        showTipThankYou(tipAmount);
    }

    async function processTip(amount) {
        const tipAmount = Number(amount);
        if (!orderData || !Number.isFinite(tipAmount) || tipAmount <= 0) return;

        if (orderData.tip_paid) {
            showTipThankYou(orderData.tip_amount || tipAmount);
            return;
        }

        setTipButtonsDisabled(true);

        let methods = [];
        try {
            if (window.TipCheckout?.loadPaymentMethods) {
                methods = await window.TipCheckout.loadPaymentMethods();
            }
        } catch (e) {
            methods = [];
        }

        const paypalMethod = methods.find(m => m?.id === 'paypal' && m.enabled !== false && m.client_id);
        const whopMethod = methods.find(m => m?.id === 'whop' && m.enabled !== false);

        // Primary path: route tips through dedicated checkout page with Whop.
        if (whopMethod) {
            try {
                redirectTipToCheckout(tipAmount, whopMethod);
                return;
            } catch (err) {
                alert('Error: ' + (err.message || 'Unable to open checkout page'));
                setTipButtonsDisabled(false);
                return;
            }
        }

        // Fallback: PayPal popup flow if Whop is unavailable.
        if (paypalMethod && window.TipCheckout?.openPayPalTip) {
            try {
                window.TipCheckout.openPayPalTip({
                    clientId: paypalMethod.client_id,
                    productId: orderData.product_id,
                    amount: tipAmount,
                    email: orderData.email || '',
                    orderId: orderData.order_id,
                    onSuccess: async () => await markTipPaid(tipAmount),
                    onClose: () => setTipButtonsDisabled(false)
                });
                return;
            } catch (err) {
                alert('Error: ' + (err.message || 'PayPal checkout failed'));
                setTipButtonsDisabled(false);
                return;
            }
        }

        if (!whopMethod) {
            alert('Payment system not available');
            setTipButtonsDisabled(false);
            return;
        }
    }

    function updateStars(rating) {
        document.querySelectorAll('.rating-stars span').forEach((star, i) => {
            star.classList.toggle('active', i < rating);
        });
    }

    function showError(msg) {
        document.getElementById('loading').style.display = 'none';
        const errorEl = document.getElementById('error');
        if (errorEl) {
            errorEl.textContent = msg;
            errorEl.style.display = 'block';
        }
    }

    updateStars(5);
})();


/**
 * Shared Timer Utilities
 * Centralized countdown timer logic for order pages
 */

class CountdownTimer {
  constructor(containerId, deliveryMinutes, createdAt, options = {}) {
    this.containerId = containerId;
    this.deliveryMinutes = deliveryMinutes || 60;
    this.createdAt = new Date(createdAt).getTime();
    this.endTime = this.createdAt + (this.deliveryMinutes * 60 * 1000);
    this.interval = null;
    this.serverTimeOffset = options.serverTimeOffset || 0;
    this.onExpired = options.onExpired || null;
  }

  /**
   * Get current server time accounting for offset
   */
  getServerTime() {
    return Date.now() + this.serverTimeOffset;
  }

  /**
   * Format time remaining
   * @param {number} ms - milliseconds remaining
   * @returns {string} formatted time string
   */
  formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    // Format based on time remaining
    if (hours >= 24) {
      // Show as days + hours if more than 24 hours
      const days = Math.floor(hours / 24);
      const remainingHours = hours % 24;
      return `${days}d ${remainingHours}h ${minutes}m`;
    } else if (hours > 0) {
      // Show hours:minutes:seconds if less than 24 hours
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
      // Show minutes:seconds if less than 1 hour
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
  }

  /**
   * Start the countdown timer
   */
  start() {
    const display = document.getElementById(this.containerId);
    if (!display) {
      console.error(`Timer container "${this.containerId}" not found`);
      return;
    }

    // Clear any existing interval
    this.stop();

    const updateDisplay = () => {
      const remaining = this.endTime - this.getServerTime();

      if (remaining <= 0) {
        display.textContent = 'Time expired - Refresh page to check status';
        this.stop();
        if (this.onExpired) {
          this.onExpired();
        }
        return;
      }

      display.textContent = this.formatTime(remaining);
    };

    // Initial display
    updateDisplay();

    // Store interval to allow cleanup
    this.interval = setInterval(updateDisplay, 1000);
  }

  /**
   * Stop the countdown timer
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /**
   * Check if time has expired
   */
  isExpired() {
    return this.getServerTime() >= this.endTime;
  }

  /**
   * Get remaining time in milliseconds
   */
  getRemaining() {
    return Math.max(0, this.endTime - this.getServerTime());
  }
}

/**
 * Fetch server time and return offset
 * @returns {Promise<number>} server time offset in milliseconds
 */
async function fetchServerTimeOffset() {
  try {
    const browserBefore = Date.now();
    const res = await fetch('/api/time');

    if (!res.ok) {
      console.warn('Failed to fetch server time');
      return 0;
    }

    const data = await res.json();
    const browserAfter = Date.now();

    if (!data.serverTime) {
      console.warn('No serverTime in response');
      return 0;
    }

    // Account for network latency by averaging
    const browserTime = Math.floor((browserBefore + browserAfter) / 2);
    const serverTime = data.serverTime;

    // Calculate offset: how much to add to browser time to get server time
    return serverTime - browserTime;
  } catch (err) {
    console.warn('Error fetching server time:', err);
    return 0;
  }
}

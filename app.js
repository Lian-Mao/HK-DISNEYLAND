/* ==========================================================
   Theme Park Queue Buddy — Hong Kong Disneyland
   Application Logic (GitHub Pages / Simplified Proxy Version)
   ========================================================== */

(() => {
  'use strict';

  // ---- Constants ----
  const TARGET_URL = 'https://queue-times.com/parks/31/queue_times.json';
  const REFRESH_INTERVAL = 10_000; // 10 seconds
  const MAX_WAIT_BAR = 90; // minutes — anything above this is "full bar"

  // ---- DOM Refs ----
  const ridesGrid = document.getElementById('ridesGrid');
  const loaderOverlay = document.getElementById('loaderOverlay');
  const errorBanner = document.getElementById('errorBanner');
  const errorMsg = document.getElementById('errorMsg');
  const refreshBtn = document.getElementById('refreshBtn');

  const searchInput = document.getElementById('searchInput');
  const sortSelect = document.getElementById('sortSelect');
  const filterPills = document.getElementById('filterPills');
  const lastUpdatedEl = document.getElementById('lastUpdated');

  // Stats
  const statOpen = document.getElementById('statOpen')?.querySelector('.stat-value');
  const statClosed = document.getElementById('statClosed')?.querySelector('.stat-value');
  const statAvgWait = document.getElementById('statAvgWait')?.querySelector('.stat-value');
  const statMaxWait = document.getElementById('statMaxWait')?.querySelector('.stat-value');

  // ---- State ----
  let rides = [];
  let previousWaitTimes = {};
  let activeFilter = 'all';
  let refreshTimer = null;
  let isFirstLoad = true;

  // ---- Background Stars (Disney magic) ----
  function initParticles() {
    const container = document.getElementById('bg-particles');
    if (!container) return;
    const count = 50;
    const starColors = [
      'rgba(212,160,32,0.35)',   // gold
      'rgba(212,160,32,0.2)',    // soft gold
      'rgba(53,112,224,0.25)',   // Disney blue
      'rgba(124,58,237,0.2)',    // purple
      'rgba(208,72,140,0.15)',   // pink
      'rgba(100,120,160,0.15)',  // soft grey-blue
      'rgba(53,112,224,0.12)',   // faint blue
    ];

    for (let i = 0; i < count; i++) {
      const s = document.createElement('div');
      s.classList.add('particle');
      const size = Math.random() * 4 + 1.5;
      const dur = Math.random() * 4 + 2;     // twinkle speed
      const delay = Math.random() * 6;
      const left = Math.random() * 100;
      const top = Math.random() * 100;
      s.style.cssText = `
        width:${size}px;height:${size}px;
        left:${left}%;top:${top}%;
        background:${starColors[Math.floor(Math.random() * starColors.length)]};
        animation-duration:${dur}s;
        animation-delay:${delay}s;
        box-shadow: 0 0 ${size * 2}px ${starColors[Math.floor(Math.random() * starColors.length)]};
      `;
      container.appendChild(s);
    }
  }

  // ---- Fetch Data (Simplified Public CORS Proxy) ----
async function fetchQueueTimes() {
  const nativeFetch = window.fetch.bind(window);
  const proxyUrls = [
    `https://corsproxy.io/?${encodeURIComponent(TARGET_URL)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(TARGET_URL)}`,
    `https://thingproxy.freeboard.io/fetch/${TARGET_URL}`
  ];

  for (const url of proxyUrls) {
    try {
      const res = await nativeFetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      return data.rides || data.lands?.flatMap(land => land.rides || []) || [];
    } catch (err) {
      console.warn(`Proxy failed for ${url}:`, err);
    }
  }

  throw new Error('All CORS proxies failed to load queue data.');
}

  // ---- Wait Level ----
  function waitLevel(minutes) {
    if (minutes <= 15) return 'low';
    if (minutes <= 40) return 'medium';
    return 'high';
  }

  // ---- Render Stats ----
  function renderStats(rideList) {
    if (!statOpen || !statClosed || !statAvgWait || !statMaxWait) return;

    const open = rideList.filter(r => r.is_open);
    const closed = rideList.filter(r => !r.is_open);
    const waits = open.filter(r => r.wait_time > 0).map(r => r.wait_time);
    const avg = waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : 0;
    const max = waits.length ? Math.max(...waits) : 0;

    animateStatValue(statOpen, open.length);
    animateStatValue(statClosed, closed.length);
    animateStatValue(statAvgWait, avg, ' min');
    animateStatValue(statMaxWait, max, ' min');
  }

  function animateStatValue(el, target, suffix = '') {
    const current = parseInt(el.textContent) || 0;
    if (current === target) { el.textContent = target + suffix; return; }
    const diff = target - current;
    const steps = 20;
    let step = 0;
    const interval = setInterval(() => {
      step++;
      const val = Math.round(current + diff * (step / steps));
      el.textContent = val + suffix;
      if (step >= steps) clearInterval(interval);
    }, 25);
  }

  // ---- Build Card HTML ----
  function buildCard(ride) {
    const level = waitLevel(ride.wait_time);
    const barWidth = ride.is_open
      ? Math.min((ride.wait_time / MAX_WAIT_BAR) * 100, 100)
      : 0;

    const updatedDate = ride.last_updated ? new Date(ride.last_updated) : new Date();
    const timeStr = updatedDate.toLocaleTimeString('en-HK', {
      hour: '2-digit', minute: '2-digit', hour12: true,
    });

    const changed = previousWaitTimes[ride.id] !== undefined &&
      previousWaitTimes[ride.id] !== ride.wait_time;

    return `
      <article class="ride-card status-${ride.is_open ? 'open' : 'closed'}${changed ? ' flash' : ''}"
               data-ride-id="${ride.id}"
               data-is-open="${ride.is_open}"
               style="animation-delay:0s">
        <div class="card-top">
          <span class="ride-name">${escapeHTML(ride.name)}</span>
          <span class="status-badge ${ride.is_open ? 'open' : 'closed'}">
            ${ride.is_open ? '● Open' : '○ Closed'}
          </span>
        </div>
        ${ride.is_open ? `
          <div class="wait-display">
            <span class="wait-number wait-level-${level}">${ride.wait_time}</span>
            <span class="wait-unit">min</span>
          </div>
          <div class="wait-bar-track">
            <div class="wait-bar-fill level-${level}" style="width:${barWidth}%"></div>
          </div>
        ` : `
          <div class="wait-display closed-state">
            <span class="wait-number">Currently Closed</span>
          </div>
          <div class="wait-bar-track">
            <div class="wait-bar-fill" style="width:0%"></div>
          </div>
        `}
        <div class="card-footer">Updated ${timeStr}</div>
      </article>
    `;
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---- Filter / Search / Sort ----
  function getFilteredRides() {
    let list = [...rides];

    // filter
    if (activeFilter === 'open') list = list.filter(r => r.is_open);
    else if (activeFilter === 'closed') list = list.filter(r => !r.is_open);

    // search
    const q = searchInput ? searchInput.value.trim().toLowerCase() : '';
    if (q) list = list.filter(r => r.name.toLowerCase().includes(q));

    // sort
    const sortVal = sortSelect ? sortSelect.value : 'name';
    list.sort((a, b) => {
      if (sortVal === 'name') return a.name.localeCompare(b.name);
      if (sortVal === 'wait-desc') return b.wait_time - a.wait_time;
      if (sortVal === 'wait-asc') return a.wait_time - b.wait_time;
      if (sortVal === 'status') return (b.is_open ? 1 : 0) - (a.is_open ? 1 : 0);
      return 0;
    });

    return list;
  }

  function renderRides(fullRebuild = false) {
    if (!ridesGrid) return;
    const filtered = getFilteredRides();

    if (filtered.length === 0) {
      ridesGrid.innerHTML = '<p class="no-results">No attractions match your criteria.</p>';
      return;
    }

    // Full rebuild on first load or when filters/search/sort change
    if (fullRebuild || !ridesGrid.querySelector('.ride-card')) {
      ridesGrid.innerHTML = filtered.map(buildCard).join('');
      const cards = ridesGrid.querySelectorAll('.ride-card');
      cards.forEach((card, i) => {
        card.style.animationDelay = `${i * 0.04}s`;
      });
      return;
    }

    // In-place patch update
    const existingCards = ridesGrid.querySelectorAll('.ride-card');
    const existingIds = new Set();
    existingCards.forEach(c => existingIds.add(c.dataset.rideId));
    const filteredIds = new Set(filtered.map(r => String(r.id)));

    if (existingIds.size !== filteredIds.size || ![...existingIds].every(id => filteredIds.has(id))) {
      ridesGrid.innerHTML = filtered.map(buildCard).join('');
      return;
    }

    filtered.forEach(ride => {
      const card = ridesGrid.querySelector(`[data-ride-id="${ride.id}"]`);
      if (!card) return;

      // Full card rebuild if status toggles between open/closed
      const wasOpen = card.dataset.isOpen === 'true';
      if (wasOpen !== ride.is_open) {
        card.outerHTML = buildCard(ride);
        return;
      }

      const level = waitLevel(ride.wait_time);
      const barWidth = ride.is_open ? Math.min((ride.wait_time / MAX_WAIT_BAR) * 100, 100) : 0;

      // Update wait number
      const waitNum = card.querySelector('.wait-number');
      if (waitNum && ride.is_open) {
        const oldVal = parseInt(waitNum.textContent);
        if (oldVal !== ride.wait_time) {
          waitNum.textContent = ride.wait_time;
          waitNum.className = `wait-number wait-level-${level}`;
          waitNum.style.transition = 'color 0.5s ease, transform 0.3s ease';
          waitNum.style.transform = 'scale(1.08)';
          setTimeout(() => { waitNum.style.transform = 'scale(1)'; }, 300);
        }
      }

      // Update bar fill
      const barFill = card.querySelector('.wait-bar-fill');
      if (barFill) {
        barFill.style.width = `${barWidth}%`;
        barFill.className = `wait-bar-fill level-${level}`;
      }

      // Update status badge
      const badge = card.querySelector('.status-badge');
      if (badge) {
        badge.className = `status-badge ${ride.is_open ? 'open' : 'closed'}`;
        badge.innerHTML = ride.is_open ? '● Open' : '○ Closed';
      }

      // Update footer time
      const footer = card.querySelector('.card-footer');
      if (footer) {
        const updatedDate = ride.last_updated ? new Date(ride.last_updated) : new Date();
        footer.textContent = `Updated ${updatedDate.toLocaleTimeString('en-HK', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
      }
    });
  }

  // ---- Refresh ----
  async function refresh(manual = false) {
    if (manual && refreshBtn) {
      refreshBtn.classList.add('spinning');
      setTimeout(() => refreshBtn.classList.remove('spinning'), 700);
    }

    try {
      const newRides = await fetchQueueTimes();

      if (!isFirstLoad) {
        rides.forEach(r => { previousWaitTimes[r.id] = r.wait_time; });
      }

      const currentFirstLoad = isFirstLoad;
      rides = newRides;
      isFirstLoad = false;

      if (errorBanner) errorBanner.classList.add('hidden');
      if (loaderOverlay) loaderOverlay.classList.add('hidden');

      renderStats(rides);
      renderRides(currentFirstLoad);

      if (lastUpdatedEl) {
        lastUpdatedEl.textContent = `Last refreshed: ${new Date().toLocaleTimeString('en-HK', {
          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
        })}`;
      }

    } catch (err) {
      if (errorMsg) errorMsg.textContent = `Unable to fetch data: ${err.message}`;
      if (errorBanner) errorBanner.classList.remove('hidden');
      if (loaderOverlay) loaderOverlay.classList.add('hidden');
    }

    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refresh(false), REFRESH_INTERVAL);
  }

  // ---- Event Listeners ----
  if (refreshBtn) refreshBtn.addEventListener('click', () => refresh(true));

  if (searchInput) searchInput.addEventListener('input', () => renderRides(true));
  if (sortSelect) sortSelect.addEventListener('change', () => renderRides(true));

  if (filterPills) {
    filterPills.addEventListener('click', (e) => {
      const btn = e.target.closest('.pill');
      if (!btn) return;
      filterPills.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      renderRides(true);
    });
  }

  // ---- Init ----
  initParticles();
  refresh(false);
})();
